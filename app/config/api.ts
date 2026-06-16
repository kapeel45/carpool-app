import axios from 'axios';
import { assertOfficialWorkEmail } from './work-email';

const API_URL = process.env.EXPO_PUBLIC_DIRECTUS_URL || 'http://192.168.1.25:8055';
const ADMIN_TOKEN = process.env.EXPO_PUBLIC_DIRECTUS_TOKEN || '';
const GOOGLE_MAPS_API_KEY =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || 'AIzaSyBhjfn1ZfqiR4zSGT8clhe2Yc-X8FYifF8';
const RESEND_API_KEY = process.env.EXPO_PUBLIC_RESEND_API_KEY || '';

if (!ADMIN_TOKEN) {
    console.warn(
        'Directus token missing. Copy .env.example to .env and set EXPO_PUBLIC_DIRECTUS_TOKEN.'
    );
}

// api instance FIRST before any functions
export const api = axios.create({
    baseURL: API_URL,
    headers: {
        Authorization: `Bearer ${ADMIN_TOKEN}`,
    },
});

const OTP_VALID_MS = 10 * 60 * 1000;

/** Directus returns UTC datetimes without a Z suffix — parse as UTC to avoid IST offset bugs. */
export const parseDirectusDatetime = (value?: string | null): number => {
    if (!value) return NaN;
    const trimmed = value.trim().replace(' ', 'T');
    const hasTimezone = /[zZ]$|[+-]\d{2}:\d{2}$/.test(trimmed);
    const normalized = hasTimezone ? trimmed : `${trimmed}Z`;
    return new Date(normalized).getTime();
};

/** Re-check Find Rides list this often so past departures drop off. */
export const FIND_RIDE_REFRESH_MS = 60 * 1000;
const FIND_RIDE_HIDE_AFTER_MS = 60 * 60 * 1000; // hide rides 1 hour after departure

export const parseRideDepartureTime = parseDirectusDatetime;

export const getAvailableSeats = (ride: { available_seats?: number | string | null }) =>
    Math.max(0, Number(ride.available_seats) || 0);

export const hasAvailableSeats = (ride: { available_seats?: number | string | null }) =>
    getAvailableSeats(ride) > 0;

export const isRideSearchable = (ride: {
    departure_time?: string | null;
    status?: string | null;
}): boolean => {
    if (ride.status && ride.status !== 'active') return false;
    const departure = parseRideDepartureTime(ride.departure_time);
    if (Number.isNaN(departure)) return false;
    return departure + FIND_RIDE_HIDE_AFTER_MS > Date.now();
};

export const filterSearchableRides = <T extends { departure_time?: string | null; status?: string | null }>(
    rides: T[]
): T[] => rides.filter(isRideSearchable);

export const normalizePhone = (phone: string) => phone.replace(/\D/g, '').slice(-10);

export const isOwnOfferedRide = (
    ride: { driver_name?: string | null },
    viewerPhone?: string
): boolean => {
    if (!viewerPhone) return false;
    const ownerPhone = normalizePhone(ride.driver_name || '');
    return ownerPhone.length === 10 && ownerPhone === normalizePhone(viewerPhone);
};

/** Find Ride list: upcoming/active rides from other ride owners only. */
export const filterRidesForFind = <
    T extends { departure_time?: string | null; status?: string | null; driver_name?: string | null },
>(
    rides: T[],
    viewerPhone?: string
): T[] => filterSearchableRides(rides).filter((ride) => !isOwnOfferedRide(ride, viewerPhone));

const hasResendKey = () =>
    Boolean(RESEND_API_KEY) &&
    !RESEND_API_KEY.includes('your-resend') &&
    !RESEND_API_KEY.includes('1234567890') &&
    RESEND_API_KEY.startsWith('re_');

const sendTransactionalEmail = async (to: string, subject: string, html: string) => {
    if (!hasResendKey() || !to.includes('@')) return false;
    try {
        const emailResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: 'CarpoolApp <onboarding@resend.dev>',
                to,
                subject,
                html,
            }),
        });
        return emailResponse.ok;
    } catch (error) {
        console.warn('Transactional email failed:', error);
        return false;
    }
};

export const sendEmailOTP = async (email: string, userId: string) => {
    const normalizedEmail = normalizeEmail(email);
    assertOfficialWorkEmail(normalizedEmail);
    await assertEmailAvailable(normalizedEmail, userId);

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + OTP_VALID_MS);

    const existing = await api.get('/items/email_otps', {
        params: {
            'filter[email][_eq]': normalizedEmail,
            'filter[used][_eq]': false,
            fields: 'id',
            limit: 100,
        },
    });
    for (const record of existing.data?.data || []) {
        await api.patch(`/items/email_otps/${record.id}`, { used: true });
    }

    await api.post('/items/email_otps', {
        email: normalizedEmail,
        otp,
        user_id: userId,
        expires_at: expiresAt.toISOString(),
        used: false,
        status: 'active',
    });

    if (hasResendKey()) {
        try {
            const emailResponse = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${RESEND_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    from: 'CarpoolApp <onboarding@resend.dev>',
                    to: normalizedEmail,
                    subject: 'Verify your email - CarpoolApp',
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                            <h1 style="color: #1a73e8;">🚗 CarpoolApp</h1>
                            <h2>Email Verification</h2>
                            <p>Your OTP for email verification is:</p>
                            <div style="background: #f0f5ff; padding: 20px; border-radius: 12px; text-align: center;">
                                <h1 style="color: #1a73e8; letter-spacing: 8px;">${otp}</h1>
                            </div>
                            <p>This OTP expires in 10 minutes.</p>
                            <p>If you didn't request this, please ignore this email.</p>
                        </div>
                    `,
                }),
            });

            if (emailResponse.ok) {
                return { success: true, emailSent: true };
            }

            const errorBody = await emailResponse.text();
            console.warn('Resend email failed:', errorBody);
        } catch (error) {
            console.warn('Resend email error:', error);
        }
    }

    if (__DEV__) {
        console.log(`[DEV] Email OTP for ${normalizedEmail}: ${otp}`);
        return { success: true, emailSent: false, devOtp: otp };
    }

    throw new Error(
        'Email service not configured. Set a valid EXPO_PUBLIC_RESEND_API_KEY in .env'
    );
};

export const verifyEmailOTP = async (email: string, otp: string, userId: string) => {
    const normalizedEmail = normalizeEmail(email);
    assertOfficialWorkEmail(normalizedEmail);
    await assertEmailAvailable(normalizedEmail, userId);
    const normalizedOtp = otp.trim();
    const response = await api.get('/items/email_otps', {
        params: {
            'filter[email][_eq]': normalizedEmail,
            'filter[otp][_eq]': normalizedOtp,
            'filter[used][_eq]': false,
            sort: '-date_created',
            limit: 1,
        },
    });
    const otpRecord = response.data?.data?.[0];

    if (!otpRecord) return { success: false, message: 'Invalid OTP' };

    const createdAt = parseDirectusDatetime(otpRecord.date_created);
    const expiresAt = parseDirectusDatetime(otpRecord.expires_at);
    const now = Date.now();

    const validByCreated = !Number.isNaN(createdAt) && now - createdAt <= OTP_VALID_MS;
    const validByExpiry = !Number.isNaN(expiresAt) && now <= expiresAt;

    if (!validByCreated && !validByExpiry) {
        return { success: false, message: 'OTP expired. Please request a new one.' };
    }

    await api.patch(`/items/email_otps/${otpRecord.id}`, { used: true });
    await api.patch(`/items/app_users/${userId}`, { email: normalizedEmail, email_verified: true });

    return { success: true };
};

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const findUserByEmail = async (email: string, excludeUserId?: string) => {
    const normalized = normalizeEmail(email);
    if (!normalized || !normalized.includes('@')) return null;

    try {
        const response = await api.get('/items/app_users', {
            params: {
                'filter[email][_nnull]': true,
                fields: 'id,phone,email,email_verified,date_created',
                limit: 100,
            },
        });
        const users = (response.data?.data || []).filter(
            (user: { id: string | number; email?: string }) =>
                normalizeEmail(user.email || '') === normalized &&
                String(user.id) !== String(excludeUserId || '')
        );
        return users.length > 0 ? users[0] : null;
    } catch (error) {
        console.warn('findUserByEmail failed:', error);
        return null;
    }
};

export const assertEmailAvailable = async (email: string, forUserId: string) => {
    const other = await findUserByEmail(email, forUserId);
    if (other) {
        throw new Error('This email is already linked to another account. Use a different email.');
    }
};

export const resolveRelationId = (value: unknown): string | undefined => {
    if (value == null || value === '') return undefined;
    if (typeof value === 'object' && value !== null && 'id' in value) {
        return String((value as { id: unknown }).id);
    }
    return String(value);
};

/** Human-readable name only — never falls back to phone (used for UI labels). */
export const getDisplayName = (name?: string | null, _phone?: string | null) => {
    return name?.trim() || '';
};

/** Directus may return booleans as true, 1, or string — normalize for the app session. */
export const isEmailVerifiedFlag = (value: unknown): boolean => {
    if (value === true || value === 1) return true;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        return normalized === 'true' || normalized === '1' || normalized === 'yes';
    }
    return false;
};

const readEmailVerifiedFromUser = (user: Record<string, unknown>) => {
    if ('email_verified' in user) return isEmailVerifiedFlag(user.email_verified);
    if ('emailVerified' in user) return isEmailVerifiedFlag(user.emailVerified);
    return false;
};

export const buildSessionFromUser = (user: {
    id: string | number;
    phone?: string;
    name?: string | null;
    gender?: string | null;
    email?: string | null;
    email_verified?: unknown;
    emailVerified?: unknown;
    car_model?: string | null;
    car_number?: string | null;
    car_color?: string | null;
    profile_photo?: unknown;
    car_number_photo?: unknown;
}) => ({
    loggedIn: true,
    userId: user.id,
    phone: user.phone,
    name: user.name?.trim() || '',
    gender: user.gender,
    email: user.email,
    emailVerified: readEmailVerifiedFromUser(user as Record<string, unknown>),
    carModel: user.car_model,
    carNumber: user.car_number,
    carColor: user.car_color,
    profilePhotoUrl: resolveProfilePhotoUrl(user.profile_photo),
    carNumberPhotoUrl: resolveProfilePhotoUrl(user.car_number_photo),
});

/** Profile reads — never request mpin (often blocked); avoids fallback wiping email/car. */
const USER_PROFILE_FIELDS =
    'id,phone,name,email,email_verified,car_model,car_number,car_color,gender,profile_photo,car_number_photo';
const USER_AUTH_FIELDS = 'id,phone,name,mpin';

/** Full profile from Directus (all fields the token can read). */
export const fetchAppUserProfile = async (opts: {
    userId?: string | number;
    phone?: string;
}) => {
    const id = opts.userId != null ? String(opts.userId) : '';
    const normalized = opts.phone ? normalizePhone(opts.phone) : '';

    if (id) {
        for (const params of [{}, { fields: '*' }, { fields: USER_PROFILE_FIELDS }]) {
            try {
                const response = await api.get(`/items/app_users/${id}`, { params });
                if (response.data?.data) return response.data.data;
            } catch (error) {
                console.warn(`fetchAppUserProfile id=${id} failed:`, error);
            }
        }
    }

    if (normalized.length === 10) {
        for (const params of [
            { 'filter[phone][_eq]': normalized, limit: 1 },
            { 'filter[phone][_eq]': normalized, limit: 1, fields: '*' },
            {
                'filter[phone][_eq]': normalized,
                limit: 1,
                fields: USER_PROFILE_FIELDS,
            },
        ]) {
            try {
                const response = await api.get('/items/app_users', { params });
                const user = response.data?.data?.[0];
                if (user) return user;
            } catch (error) {
                console.warn(`fetchAppUserProfile phone=${normalized} failed:`, error);
            }
        }
    }

    return null;
};

export const mergeSessionFromUser = (
    existing: Record<string, unknown> | null,
    user: Record<string, unknown>
) => {
    const built = buildSessionFromUser(user as Parameters<typeof buildSessionFromUser>[0]);
    const has = (key: string) => user[key] !== undefined && user[key] !== null;

    return {
        ...existing,
        loggedIn: true,
        userId: user.id ?? existing?.userId,
        phone: normalizePhone(String(user.phone || existing?.phone || '')) || existing?.phone,
        name: built.name || existing?.name || '',
        gender: has('gender') ? user.gender : existing?.gender,
        email: has('email') ? user.email : existing?.email,
        emailVerified:
            'email_verified' in user || 'emailVerified' in user
                ? readEmailVerifiedFromUser(user)
                : Boolean(existing?.emailVerified),
        carModel: has('car_model') ? user.car_model : existing?.carModel,
        carNumber: has('car_number') ? user.car_number : existing?.carNumber,
        carColor: has('car_color') ? user.car_color : existing?.carColor,
        profilePhotoUrl:
            'profile_photo' in user
                ? resolveProfilePhotoUrl(user.profile_photo)
                : existing?.profilePhotoUrl,
        carNumberPhotoUrl:
            'car_number_photo' in user
                ? resolveProfilePhotoUrl(user.car_number_photo)
                : existing?.carNumberPhotoUrl,
    };
};

const getApiBaseUrl = () => String(api.defaults.baseURL || process.env.EXPO_PUBLIC_DIRECTUS_URL || '').replace(/\/$/, '');

/** Build a displayable URL for a Directus file id or expanded file object. */
export const resolveProfilePhotoUrl = (photo: unknown): string | null => {
    if (photo == null || photo === '') return null;

    const base = getApiBaseUrl();
    if (!base) return null;

    const assetUrl = (id: string) => {
        const params = new URLSearchParams({
            width: '240',
            height: '240',
            fit: 'cover',
        });
        if (ADMIN_TOKEN) {
            params.set('access_token', ADMIN_TOKEN);
        }
        return `${base}/assets/${id}?${params.toString()}`;
    };

    if (typeof photo === 'string') {
        if (/^[0-9a-f-]{36}$/i.test(photo)) return assetUrl(photo);
        if (photo.startsWith('file://') || photo.startsWith('content://')) return photo;
        if (photo.startsWith('http')) {
            if (ADMIN_TOKEN && photo.includes('/assets/') && !photo.includes('access_token')) {
                const sep = photo.includes('?') ? '&' : '?';
                return `${photo}${sep}access_token=${encodeURIComponent(ADMIN_TOKEN)}`;
            }
            return photo;
        }
        return `${base}${photo.startsWith('/') ? '' : '/'}${photo}`;
    }

    if (typeof photo === 'object') {
        const file = photo as { id?: string };
        if (file.id) return assetUrl(String(file.id));
    }

    return null;
};

export const uploadProfilePhoto = async (userId: string | number, localUri: string) => {
    const base = getApiBaseUrl();
    if (!base || !ADMIN_TOKEN) {
        throw new Error('Directus is not configured.');
    }

    const ext = localUri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

    const formData = new FormData();
    formData.append('file', {
        uri: localUri,
        type: mime,
        name: `profile-${userId}.${ext}`,
    } as unknown as Blob);

    const response = await fetch(`${base}/files`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
        body: formData,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.errors?.[0]?.message || 'Could not upload photo.');
    }

    const fileId = payload?.data?.id;
    if (!fileId) throw new Error('Upload succeeded but file id was missing.');

    try {
        await api.patch(`/items/app_users/${userId}`, { profile_photo: fileId });
    } catch (error: any) {
        throw new Error(
            error?.response?.data?.errors?.[0]?.message ||
                'Photo uploaded but could not link to profile. Run: npm run setup-directus-fields'
        );
    }

    return { fileId: String(fileId), url: resolveProfilePhotoUrl(fileId) };
};

export const clearProfilePhoto = async (userId: string | number) => {
    await api.patch(`/items/app_users/${userId}`, { profile_photo: null });
};

export const uploadCarNumberPhoto = async (userId: string | number, localUri: string) => {
    const base = getApiBaseUrl();
    if (!base || !ADMIN_TOKEN) {
        throw new Error('Directus is not configured.');
    }

    const ext = localUri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

    const formData = new FormData();
    formData.append('file', {
        uri: localUri,
        type: mime,
        name: `car-number-${userId}.${ext}`,
    } as unknown as Blob);

    const response = await fetch(`${base}/files`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
        body: formData,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.errors?.[0]?.message || 'Could not upload car number photo.');
    }

    const fileId = payload?.data?.id;
    if (!fileId) throw new Error('Upload succeeded but file id was missing.');

    await api.patch(`/items/app_users/${userId}`, { car_number_photo: fileId });
    return { fileId: String(fileId), url: resolveProfilePhotoUrl(fileId) };
};

export const clearCarNumberPhoto = async (userId: string | number) => {
    await api.patch(`/items/app_users/${userId}`, { car_number_photo: null });
};

export const canOfferRides = (session: {
    emailVerified?: boolean;
    carModel?: string | null;
    carNumber?: string | null;
} | null) =>
    Boolean(
        session?.emailVerified &&
            String(session?.carModel || '').trim() &&
            String(session?.carNumber || '').trim()
    );

export const getUserById = async (userId: string | number) => {
    return fetchAppUserProfile({ userId });
};

export const findUserByPhoneForAuth = async (phone: string, excludeUserId?: string) => {
    const normalized = normalizePhone(phone);
    if (normalized.length !== 10) return null;

    for (const fields of [USER_AUTH_FIELDS, 'id,phone,name,mpin']) {
        try {
            const response = await api.get('/items/app_users', {
                params: {
                    'filter[phone][_eq]': normalized,
                    fields,
                    limit: 1,
                },
            });
            const user = response.data?.data?.[0];
            if (!user) return null;
            if (excludeUserId && String(user.id) === String(excludeUserId)) return null;
            return user;
        } catch (error) {
            console.warn(`findUserByPhoneForAuth fields=${fields} failed:`, error);
        }
    }
    return null;
};

export const resolveDisplayName = async (value?: string, fallback = 'Owner') => {
    if (!value) return fallback;
    const normalized = normalizePhone(value);
    if (normalized.length === 10 && value.replace(/\D/g, '').slice(-10) === normalized) {
        try {
            const user = await findUserByPhone(normalized);
            return getDisplayName(user?.name) || fallback;
        } catch {
            return fallback;
        }
    }
    return value;
};

export const findUserByPhone = async (phone: string, excludeUserId?: string) => {
    const normalized = normalizePhone(phone);
    if (normalized.length !== 10) return null;

    const user = await fetchAppUserProfile({ phone: normalized });
    if (!user) {
        const authUser = await findUserByPhoneForAuth(normalized, excludeUserId);
        return authUser;
    }
    if (excludeUserId && String(user.id) === String(excludeUserId)) return null;
    return user;
};

export const assertPhoneAvailable = async (phone: string, forUserId?: string) => {
    const other = await findUserByPhone(phone, forUserId);
    if (other) {
        throw new Error('This phone number is already registered. Log in with that number instead.');
    }
};

export type OwnerInfo = {
    name: string;
    gender?: string;
    photoUrl?: string | null;
};

export const resolveOwnerInfo = async (value?: string): Promise<OwnerInfo> => {
    if (!value) return { name: 'Owner', gender: undefined, photoUrl: null };
    const normalized = normalizePhone(value);
    if (normalized.length === 10) {
        const user = await findUserByPhone(normalized);
        if (user) {
            return {
                name: getDisplayName(user.name) || 'Owner',
                gender: user.gender as string | undefined,
                photoUrl: resolveProfilePhotoUrl(user.profile_photo),
            };
        }
        return { name: 'Owner', gender: undefined, photoUrl: null };
    }
    return { name: value, gender: undefined, photoUrl: null };
};

export const createUser = async (phone: string, name: string) => {
    const normalized = normalizePhone(phone);
    const trimmedName = name?.trim();
    if (normalized.length !== 10) {
        throw new Error('Enter a valid 10-digit mobile number.');
    }
    if (!trimmedName) {
        throw new Error('Please enter your name.');
    }
    const existing = await findUserByPhone(normalized);
    if (existing) return existing;

    try {
        const response = await api.post('/items/app_users', {
            phone: normalized,
            name: trimmedName,
            total_rides: 0,
            total_earnings: 0,
            status: 'active',
        });
        const created = response.data?.data;
        if (!created?.id) {
            throw new Error('Account could not be created. Check Directus permissions for app_users.');
        }
        return created;
    } catch (error: any) {
        const message = error?.response?.data?.errors?.[0]?.message || '';
        if (message.toLowerCase().includes('unique') || message.toLowerCase().includes('duplicate')) {
            const existingAfterRace = await findUserByPhone(normalized);
            if (existingAfterRace) return existingAfterRace;
        }
        const detail = error?.response?.data?.errors?.[0]?.message;
        throw new Error(detail || 'Could not create account. Try again.');
    }
};

const stripFieldFromPayload = (payload: Record<string, unknown>, field: string) => {
    const next = { ...payload };
    delete next[field];
    return next;
};

export const updateUserProfile = async (userId: string, data: Record<string, unknown>) => {
    const payload = { ...data };
    if (payload.email != null && payload.email !== '') {
        payload.email = normalizeEmail(String(payload.email));
        assertOfficialWorkEmail(payload.email as string);
        await assertEmailAvailable(payload.email as string, userId);
    }

    const optionalFields = [
        'gender',
        'car_model',
        'car_number',
        'car_color',
        'car_number_photo',
        'email_verified',
    ];
    let attempt: Record<string, unknown> = { ...payload };

    for (let i = 0; i <= optionalFields.length; i++) {
        try {
            const response = await api.patch(`/items/app_users/${userId}`, attempt);
            return response.data.data;
        } catch (error: any) {
            const message = (error?.response?.data?.errors?.[0]?.message || '').toLowerCase();
            const fieldFromError = optionalFields.find(
                (field) => message.includes(field) || message.includes(field.replace('_', ' '))
            );
            if (fieldFromError && fieldFromError in attempt) {
                console.warn(`updateUserProfile: retrying without ${fieldFromError}`);
                attempt = stripFieldFromPayload(attempt, fieldFromError);
                continue;
            }
            const detail = error?.response?.data?.errors?.[0]?.message;
            throw new Error(detail || 'Could not save profile. Check Directus field setup.');
        }
    }

    throw new Error('Could not save profile.');
};

export const getRides = async () => {
    const response = await api.get('/items/rides');
    return response.data.data;
};

export const createRide = async (rideData: any) => {
    const response = await api.post('/items/rides', rideData);
    return response.data.data;
};

export const countActiveBookingsForRide = async (rideId: string | number) => {
    const id = String(rideId);
    if (!id) return 0;

    try {
        const response = await api.get('/items/bookings', {
            params: {
                'filter[ride_id][_eq]': id,
                ...ACTIVE_BOOKING_QUERY,
                fields: 'id,ride_id,payment_status,status',
                limit: 100,
            },
        });
        return filterActiveBookings(response.data?.data || []).length;
    } catch (error) {
        console.warn('countActiveBookingsForRide failed:', error);
        return 0;
    }
};

/** Ride IDs that have at least one non-cancelled booking. */
export const getRideIdsWithActiveBookings = async (): Promise<Set<string>> => {
    try {
        const response = await api.get('/items/bookings', {
            params: {
                ...ACTIVE_BOOKING_QUERY,
                fields: 'id,ride_id,payment_status,status',
                limit: 500,
            },
        });
        const ids = new Set<string>();
        for (const booking of filterActiveBookings(
            (response.data?.data || []) as Array<{
                ride_id?: unknown;
                payment_status?: string | null;
                status?: string | null;
            }>
        )) {
            const rideId = resolveRelationId(booking.ride_id);
            if (rideId) ids.add(rideId);
        }
        return ids;
    } catch (error) {
        console.warn('getRideIdsWithActiveBookings failed:', error);
        return new Set();
    }
};

export const updateRide = async (rideId: string | number, rideData: Record<string, unknown>) => {
    const id = String(rideId);
    const activeCount = await countActiveBookingsForRide(id);
    if (activeCount > 0) {
        throw new Error('Cannot edit this ride — someone has already booked seats.');
    }

    const response = await api.patch(`/items/rides/${id}`, rideData);
    return response.data?.data;
};

/** Positive delta adds seats (cancel); negative delta removes seats (book). */
export const adjustRideAvailableSeats = async (
    rideId: string | number,
    seatDelta: number
): Promise<number> => {
    const id = String(rideId);
    const delta = Math.trunc(seatDelta);
    if (!id || delta === 0) {
        const ride = await getRideById(id);
        return getAvailableSeats(ride);
    }

    const ride = await getRideById(id);
    const current = getAvailableSeats(ride);
    const next = current + delta;
    if (next < 0) {
        throw new Error(
            delta < 0
                ? `Only ${current} seat(s) left on this ride.`
                : 'Invalid seat count for this ride.'
        );
    }

    const response = await api.patch(`/items/rides/${id}`, { available_seats: next });
    return getAvailableSeats(response.data?.data ?? { available_seats: next });
};

export const createBooking = async (bookingData: any) => {
    const rideId = resolveRelationId(bookingData.ride_id) || String(bookingData.ride_id || '');
    const seatsBooked = Math.max(1, Number(bookingData.seats_booked) || 1);

    if (!rideId) {
        throw new Error('Ride not found.');
    }

    const ride = await getRideById(rideId);
    const available = getAvailableSeats(ride);
    if (available < seatsBooked) {
        throw new Error(
            available === 0
                ? 'This ride is full. No seats available.'
                : `Only ${available} seat(s) left on this ride.`
        );
    }

    const response = await api.post('/items/bookings', {
        ...bookingData,
        ride_id: rideId,
        seats_booked: seatsBooked,
        rider_phone: normalizePhone(bookingData.rider_phone || ''),
        payment_status: bookingData.payment_status || 'pending',
        status: 'confirmed',
    });
    const booking = response.data?.data;
    if (!booking?.id) {
        throw new Error('Could not create booking.');
    }

    try {
        await adjustRideAvailableSeats(rideId, -seatsBooked);
    } catch (error) {
        try {
            await api.patch(`/items/bookings/${booking.id}`, {
                payment_status: 'cancelled',
                status: 'cancelled',
            });
        } catch {
            // best-effort rollback
        }
        throw error;
    }

    return booking;
};

export const markBookingPaid = async (bookingId: string) => {
    const response = await api.patch(`/items/bookings/${bookingId}`, {
        payment_status: 'paid',
    });
    return response.data?.data;
};

export const isCancelledBooking = (booking: {
    payment_status?: string | null;
    status?: string | null;
}) => {
    const payment = (booking.payment_status || '').toLowerCase();
    const status = (booking.status || '').toLowerCase();
    return payment === 'cancelled' || status === 'cancelled';
};

export const filterActiveBookings = <
    T extends { payment_status?: string | null; status?: string | null },
>(
    bookings: T[]
) => bookings.filter((booking) => !isCancelledBooking(booking));

/** Exclude cancelled bookings from Directus list queries. */
const ACTIVE_BOOKING_QUERY = {
    'filter[payment_status][_neq]': 'cancelled',
};

export const isNotificationRead = (value: unknown): boolean =>
    value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';

export type LocationCoords = { lat: number; lng: number };

export const createAppNotification = async (
    recipientPhone: string,
    title: string,
    message: string,
    bookingId?: string
) => {
    const phone = normalizePhone(recipientPhone);
    if (phone.length !== 10) return null;

    try {
        const response = await api.post('/items/app_notifications', {
            recipient_phone: phone,
            title,
            message,
            booking_id: bookingId ? String(bookingId) : null,
            read: false,
        });
        return response.data?.data;
    } catch (error: any) {
        const status = error?.response?.status;
        console.warn(
            'createAppNotification failed:',
            status,
            error?.response?.data || error?.message
        );
        if (status === 403 || status === 404) {
            console.warn('Run: npm run setup-notifications');
        }
        return null;
    }
};

export const requestNearbyPickup = async (params: {
    rideId: string;
    rideOwnerPhone: string;
    riderPhone: string;
    riderName: string;
    riderPickup: string;
    pickupDistanceMiles: number;
    seatsBooked?: number;
    totalPrice?: number;
}) => {
    const ownerPhone = normalizePhone(params.rideOwnerPhone);
    if (ownerPhone.length !== 10) {
        throw new Error('Ride owner phone not available.');
    }

    const request = await createPickupRequest({
        rideId: params.rideId,
        ownerPhone: params.rideOwnerPhone,
        riderPhone: params.riderPhone,
        riderName: params.riderName,
        riderPickup: params.riderPickup,
        pickupDistanceMiles: params.pickupDistanceMiles,
        seatsBooked: params.seatsBooked,
        totalPrice: params.totalPrice,
    });

    const riderPhone = normalizePhone(params.riderPhone);
    const requestId = String(request.id);
    const distanceLabel =
        params.pickupDistanceMiles < 0.1
            ? 'very close'
            : `${params.pickupDistanceMiles.toFixed(1)} mi away`;

    const message =
        `${params.riderName || 'A rider'} (${distanceLabel}) asked if you can pick them up nearby. ` +
        `Their location: ${params.riderPickup}. Open the request to accept or reject.`;

    await createAppNotification(
        ownerPhone,
        'Nearby pickup request',
        message,
        `pickup_request:${requestId}`
    );

    if (riderPhone.length === 10) {
        await createAppNotification(
            riderPhone,
            'Pickup request sent',
            `Your request was sent to the ride owner. They will review your pickup at: ${params.riderPickup}.`,
            `pickup_request:${requestId}`
        );
    }

    return request;
};

export type PickupRequestRecord = {
    id: string | number;
    ride_id: string;
    owner_phone: string;
    rider_phone: string;
    rider_name?: string | null;
    rider_pickup?: string | null;
    pickup_distance_miles?: number | null;
    seats_booked?: number | null;
    total_price?: number | null;
    booking_id?: string | null;
    status?: string | null;
};

export const createPickupRequest = async (params: {
    rideId: string;
    ownerPhone: string;
    riderPhone: string;
    riderName: string;
    riderPickup: string;
    pickupDistanceMiles: number;
    seatsBooked?: number;
    totalPrice?: number;
}) => {
    const response = await api.post('/items/pickup_requests', {
        ride_id: String(params.rideId),
        owner_phone: normalizePhone(params.ownerPhone),
        rider_phone: normalizePhone(params.riderPhone),
        rider_name: params.riderName,
        rider_pickup: params.riderPickup,
        junction_point: params.riderPickup,
        junction_lat: null,
        junction_lng: null,
        pickup_distance_miles: params.pickupDistanceMiles,
        seats_booked: Math.max(1, params.seatsBooked ?? 1),
        total_price: params.totalPrice ?? 0,
        status: 'pending',
    });
    const record = response.data?.data;
    if (!record?.id) {
        throw new Error('Could not create pickup request.');
    }
    return record as PickupRequestRecord;
};

export const getPickupRequestById = async (id: string): Promise<PickupRequestRecord | null> => {
    try {
        const response = await api.get(`/items/pickup_requests/${id}`);
        return response.data?.data || null;
    } catch {
        return null;
    }
};

export const getPendingPickupRequestsForOwner = async (phone: string) => {
    const normalized = normalizePhone(phone);
    if (normalized.length !== 10) return [];

    try {
        const response = await api.get('/items/pickup_requests', {
            params: {
                'filter[owner_phone][_eq]': normalized,
                'filter[status][_eq]': 'pending',
                sort: '-id',
                limit: 50,
                fields: '*',
            },
        });
        return (response.data?.data || []) as PickupRequestRecord[];
    } catch (error) {
        console.warn('getPendingPickupRequestsForOwner failed:', error);
        return [];
    }
};

export const getPickupRequestsForRider = async (phone: string, status = 'pending') => {
    const normalized = normalizePhone(phone);
    if (normalized.length !== 10) return [];

    try {
        const response = await api.get('/items/pickup_requests', {
            params: {
                'filter[rider_phone][_eq]': normalized,
                'filter[status][_eq]': status,
                sort: '-id',
                limit: 50,
                fields: '*',
            },
        });
        return (response.data?.data || []) as PickupRequestRecord[];
    } catch (error) {
        console.warn('getPickupRequestsForRider failed:', error);
        return [];
    }
};

export const acceptPickupRequest = async (requestId: string, ownerPhone: string) => {
    const request = await getPickupRequestById(requestId);
    if (!request) throw new Error('Pickup request not found.');
    if (normalizePhone(request.owner_phone) !== normalizePhone(ownerPhone)) {
        throw new Error('Not allowed to accept this request.');
    }
    if (request.status !== 'pending') {
        throw new Error('This request was already handled.');
    }

    const ride = await getRideById(String(request.ride_id));
    if (!ride) throw new Error('Ride not found.');

    const seatsBooked = Math.max(1, Number(request.seats_booked) || 1);
    const pricePerSeat = Number(ride.price_per_seat) || 0;
    const totalPrice = Number(request.total_price) || pricePerSeat * seatsBooked;

    const booking = await createBooking({
        ride_id: String(request.ride_id),
        rider_name: request.rider_name || request.rider_phone,
        rider_phone: request.rider_phone,
        seats_booked: seatsBooked,
        total_price: totalPrice,
        payment_status: 'pending',
    });

    await api.patch(`/items/pickup_requests/${requestId}`, {
        status: 'accepted',
        booking_id: String(booking.id),
    });

    const riderPhone = normalizePhone(request.rider_phone);
    if (riderPhone.length === 10) {
        await createAppNotification(
            riderPhone,
            'Ride confirmed',
            `Your ride was booked! Pickup at: ${request.rider_pickup || 'your location'}. Tap to pay ₹${totalPrice}.`,
            String(booking.id)
        );
    }

    return { request, booking };
};

export const rejectPickupRequest = async (requestId: string, ownerPhone: string) => {
    const request = await getPickupRequestById(requestId);
    if (!request) throw new Error('Pickup request not found.');
    if (normalizePhone(request.owner_phone) !== normalizePhone(ownerPhone)) {
        throw new Error('Not allowed to reject this request.');
    }
    if (request.status !== 'pending') {
        throw new Error('This request was already handled.');
    }

    await api.patch(`/items/pickup_requests/${requestId}`, { status: 'rejected' });

    const riderPhone = normalizePhone(request.rider_phone);
    if (riderPhone.length === 10) {
        await createAppNotification(
            riderPhone,
            'Pickup request declined',
            `The ride owner could not pick you up. Try another nearby ride.`,
            String(request.ride_id)
        );
    }

    return request;
};

export const cancelPickupRequest = async (requestId: string, riderPhone: string) => {
    const request = await getPickupRequestById(requestId);
    if (!request) throw new Error('Pickup request not found.');
    if (normalizePhone(request.rider_phone) !== normalizePhone(riderPhone)) {
        throw new Error('Not allowed to cancel this request.');
    }
    if (request.status !== 'pending') {
        throw new Error('This request can no longer be cancelled.');
    }

    await api.patch(`/items/pickup_requests/${requestId}`, { status: 'cancelled' });

    const ownerPhone = normalizePhone(request.owner_phone);
    if (ownerPhone.length === 10) {
        await createAppNotification(
            ownerPhone,
            'Pickup request cancelled',
            `${request.rider_name || 'A rider'} cancelled their nearby pickup request.`,
            String(request.ride_id)
        );
    }

    return request;
};

export const startRide = async (rideId: string, ownerPhone: string) => {
    const ride = await getRideById(rideId);
    if (!ride) throw new Error('Ride not found.');
    if (normalizePhone(ride.driver_name || '') !== normalizePhone(ownerPhone)) {
        throw new Error('Only the ride owner can start the ride.');
    }

    await api.patch(`/items/rides/${rideId}`, {
        trip_status: 'in_progress',
        driver_location_updated_at: new Date().toISOString(),
    });

    const bookings = await getBookingsForRide(rideId);
    for (const booking of filterActiveBookings(bookings)) {
        const riderPhone = normalizePhone(String((booking as { rider_phone?: string }).rider_phone || ''));
        if (riderPhone.length !== 10) continue;
        await createAppNotification(
            riderPhone,
            'Ride started',
            `Your driver has started the ride. Open live tracking to see their location.`,
            `ride_live:${rideId}`
        );
    }

    return ride;
};

export const completeRide = async (rideId: string, ownerPhone: string) => {
    const ride = await getRideById(rideId);
    if (!ride) throw new Error('Ride not found.');
    if (normalizePhone(ride.driver_name || '') !== normalizePhone(ownerPhone)) {
        throw new Error('Only the ride owner can end the ride.');
    }

    await api.patch(`/items/rides/${rideId}`, {
        trip_status: 'completed',
        driver_lat: null,
        driver_lng: null,
        driver_location_updated_at: new Date().toISOString(),
    });

    return ride;
};

export const updateDriverLocation = async (rideId: string, lat: number, lng: number) => {
    await api.patch(`/items/rides/${rideId}`, {
        driver_lat: lat,
        driver_lng: lng,
        driver_location_updated_at: new Date().toISOString(),
    });
};

export const getRideLiveTracking = async (rideId: string) => {
    try {
        const response = await api.get(`/items/rides/${rideId}`, {
            params: {
                fields:
                    'id,from_location,to_location,from_lat,from_lng,to_lat,to_lng,trip_status,driver_lat,driver_lng,driver_location_updated_at,driver_name,departure_time',
            },
        });
        return response.data?.data || null;
    } catch {
        return null;
    }
};

export const parseNotificationReference = (bookingId?: string | null) => {
    const raw = String(bookingId || '');
    if (raw.startsWith('pickup_request:')) {
        return { type: 'pickup_request' as const, id: raw.replace('pickup_request:', '') };
    }
    if (raw.startsWith('ride_live:')) {
        return { type: 'ride_live' as const, id: raw.replace('ride_live:', '') };
    }
    if (raw) {
        return { type: 'booking_or_ride' as const, id: raw };
    }
    return null;
};

export const getNotificationsForUser = async (phone: string, includeRead = true) => {
    const normalized = normalizePhone(phone);
    if (normalized.length !== 10) return [];

    const baseParams: Record<string, string | number> = {
        'filter[recipient_phone][_eq]': normalized,
        sort: '-id',
        limit: 50,
    };
    if (!includeRead) {
        baseParams['filter[read][_eq]'] = 'false';
    }

    try {
        const response = await api.get('/items/app_notifications', {
            params: {
                ...baseParams,
                fields: 'id,title,message,booking_id,read',
            },
        });
        return response.data?.data || [];
    } catch (error: any) {
        console.warn('getNotificationsForUser fields query failed, retrying:', error?.response?.data || error?.message);
        try {
            const response = await api.get('/items/app_notifications', {
                params: { ...baseParams, fields: '*' },
            });
            return response.data?.data || [];
        } catch (retryError: any) {
            const status = retryError?.response?.status;
            if (status === 403 || status === 404) {
                console.warn(
                    'getNotificationsForUser failed — run: npm run setup-notifications',
                    retryError?.response?.data || retryError?.message
                );
            } else {
                console.warn('getNotificationsForUser failed:', retryError);
            }
            return [];
        }
    }
};

export const getUnreadNotificationCount = async (phone: string) => {
    const normalized = normalizePhone(phone);
    if (normalized.length !== 10) return 0;

    try {
        const response = await api.get('/items/app_notifications', {
            params: {
                'filter[recipient_phone][_eq]': normalized,
                'filter[read][_eq]': 'false',
                'aggregate[count]': 'id',
            },
        });
        const count = response.data?.data?.[0]?.count?.id;
        return Number(count) || 0;
    } catch {
        return 0;
    }
};

export const markAllNotificationsRead = async (phone: string) => {
    const normalized = normalizePhone(phone);
    if (normalized.length !== 10) return;

    try {
        const unread = await getNotificationsForUser(normalized, false);
        await Promise.all(
            unread
                .filter((n: { id?: string | number; read?: unknown }) => !isNotificationRead(n.read))
                .map((n: { id: string | number }) =>
                    api.patch(`/items/app_notifications/${n.id}`, { read: true })
                )
        );
    } catch (error) {
        console.warn('markAllNotificationsRead failed:', error);
    }
};

export const markNotificationRead = async (notificationId: string) => {
    try {
        await api.patch(`/items/app_notifications/${notificationId}`, { read: true });
    } catch (error) {
        console.warn('markNotificationRead failed:', error);
    }
};

const notifyBookingCancellation = async (
    booking: Record<string, unknown>,
    cancelledByPhone?: string
) => {
    const rideRef = booking.ride_id;
    const ride =
        typeof rideRef === 'object' && rideRef !== null
            ? (rideRef as Record<string, unknown>)
            : await getRideById(resolveRelationId(rideRef) || '');

    const riderPhone = normalizePhone(String(booking.rider_phone || ''));
    const ownerPhone = normalizePhone(String(ride?.driver_name || ''));
    const canceller = normalizePhone(cancelledByPhone || '');
    const bookingId = String(booking.id || '');
    const seats = Math.max(1, Number(booking.seats_booked) || 1);
    const route = `${ride?.from_location || 'Pickup'} → ${ride?.to_location || 'Destination'}`;
    const riderName = String(booking.rider_name || 'A rider').trim() || 'A rider';

    const notifyRecipient = async (
        recipientPhone: string,
        title: string,
        message: string
    ) => {
        if (recipientPhone.length !== 10) return;
        await createAppNotification(recipientPhone, title, message, bookingId);

        const user = await fetchAppUserProfile({ phone: recipientPhone });
        const email = user?.email ? normalizeEmail(String(user.email)) : '';
        if (email && isEmailVerifiedFlag(user?.email_verified)) {
            await sendTransactionalEmail(
                email,
                title,
                `<div style="font-family: Arial, sans-serif; max-width: 600px;">
                    <h2 style="color: #1a73e8;">🚗 CarpoolApp</h2>
                    <p>${message}</p>
                    <p>Open the app → My Rides for details.</p>
                </div>`
            );
        }
    };

    if (canceller === riderPhone && ownerPhone) {
        await notifyRecipient(
            ownerPhone,
            'Booking cancelled',
            `${riderName} cancelled ${seats} seat(s) on ${route}.`
        );
    } else if (canceller === ownerPhone && riderPhone) {
        await notifyRecipient(
            riderPhone,
            'Booking cancelled by owner',
            `Your booking for ${seats} seat(s) on ${route} was cancelled by the ride owner.`
        );
    } else if (riderPhone && ownerPhone) {
        const otherPhone = canceller === riderPhone ? ownerPhone : riderPhone;
        await notifyRecipient(
            otherPhone,
            'Booking cancelled',
            `Booking for ${seats} seat(s) on ${route} was cancelled.`
        );
    } else if (riderPhone) {
        await notifyRecipient(
            riderPhone,
            'Booking cancelled',
            `Your booking for ${seats} seat(s) on ${route} has been cancelled.`
        );
    }
};

export const cancelBooking = async (bookingId: string, cancelledByPhone?: string) => {
    const id = String(bookingId);
    if (!id) throw new Error('Booking not found.');

    const existing = await getBookingById(id);
    if (!existing) throw new Error('Booking not found.');
    if (isCancelledBooking(existing)) return existing;

    const rideId = resolveRelationId(existing.ride_id);
    const seatsBooked = Math.max(1, Number(existing.seats_booked) || 1);

    let cancelled: unknown;
    try {
        const response = await api.patch(`/items/bookings/${id}`, {
            payment_status: 'cancelled',
            status: 'cancelled',
        });
        cancelled = response.data?.data;
    } catch (error: any) {
        const message = error?.response?.data?.errors?.[0]?.message || '';
        if (message.toLowerCase().includes('status')) {
            const response = await api.patch(`/items/bookings/${id}`, {
                payment_status: 'cancelled',
            });
            cancelled = response.data?.data;
        } else {
            throw error;
        }
    }

    if (rideId) {
        await adjustRideAvailableSeats(rideId, seatsBooked);
    }

    try {
        await notifyBookingCancellation(existing as Record<string, unknown>, cancelledByPhone);
    } catch (error) {
        console.warn('Cancellation notification failed:', error);
    }

    try {
        const linked = await api.get('/items/pickup_requests', {
            params: {
                'filter[booking_id][_eq]': id,
                limit: 1,
                fields: 'id,status',
            },
        });
        const pickupRequest = linked.data?.data?.[0];
        if (pickupRequest?.id && pickupRequest.status === 'accepted') {
            await api.patch(`/items/pickup_requests/${pickupRequest.id}`, { status: 'cancelled' });
        }
    } catch {
        // pickup_requests collection may be missing
    }

    return cancelled;
};

export const getBookingById = async (id: string) => {
    const response = await api.get(`/items/bookings/${id}?fields=*,ride_id.*`);
    return response.data.data;
};

export const verifyBookingCarNumber = async (
    bookingId: string,
    riderPhone: string,
    status: 'correct' | 'different'
) => {
    const booking = await getBookingById(bookingId);
    if (!booking) throw new Error('Booking not found.');
    if (normalizePhone(String(booking.rider_phone || '')) !== normalizePhone(riderPhone)) {
        throw new Error('Not allowed to verify this booking.');
    }
    const response = await api.patch(`/items/bookings/${bookingId}`, {
        car_number_verified_by_rider: status === 'correct',
        car_number_verification_note: status,
        car_number_verified_at: new Date().toISOString(),
    });
    return response.data?.data || booking;
};

export const getRideById = async (id: string) => {
    const response = await api.get(`/items/rides/${id}`);
    return response.data.data;
};

export type UserStats = {
    ridesTaken: number;
    ridesOffered: number;
    saved: number;
};

export const getUserStats = async (phone: string): Promise<UserStats> => {
    const normalized = normalizePhone(phone);
    if (!normalized) {
        return { ridesTaken: 0, ridesOffered: 0, saved: 0 };
    }

    try {
        const [bookingsResponse, ridesResponse] = await Promise.all([
            api.get('/items/bookings', {
                params: {
                    'filter[rider_phone][_eq]': normalized,
                    ...ACTIVE_BOOKING_QUERY,
                    fields: 'id,total_price,payment_status,status',
                    limit: 100,
                },
            }),
            api.get('/items/rides', {
                params: {
                    'filter[driver_name][_eq]': normalized,
                    fields: 'id',
                    limit: 100,
                },
            }),
        ]);

        const bookings = filterActiveBookings(
            (bookingsResponse.data?.data || []) as Array<{
                total_price?: number | string;
                payment_status?: string | null;
                status?: string | null;
            }>
        );
        const rides = ridesResponse.data?.data || [];

        const saved = bookings.reduce(
            (sum, booking) => sum + (Number(booking.total_price) || 0),
            0
        );

        return {
            ridesTaken: bookings.length,
            ridesOffered: rides.length,
            saved,
        };
    } catch (error) {
        // Keep dashboard usable when backend is temporarily unreachable.
        console.warn('getUserStats failed, returning empty stats:', error);
        return { ridesTaken: 0, ridesOffered: 0, saved: 0 };
    }
};

export const getBookingsForRide = async (rideId: string | number) => {
    const id = String(rideId);
    if (!id) return [];

    try {
        const response = await api.get('/items/bookings', {
            params: {
                'filter[ride_id][_eq]': id,
                ...ACTIVE_BOOKING_QUERY,
                fields:
                    'id,ride_id,rider_name,rider_phone,seats_booked,total_price,payment_status,status,date_created',
                sort: '-date_created',
                limit: 50,
            },
        });
        return filterActiveBookings(response.data?.data || []);
    } catch (error) {
        console.warn('getBookingsForRide failed:', error);
        return [];
    }
};

/** Active bookings on rides offered by this owner (driver_name = phone). */
export const getBookingsForOwnerRides = async (ownerPhone: string) => {
    const normalized = normalizePhone(ownerPhone);
    if (!normalized) return [];

    const rides = await getUserOfferedRides(normalized);
    const rideIds = rides.map((r: { id?: string | number }) => String(r.id)).filter(Boolean);
    if (rideIds.length === 0) return [];

    try {
        const response = await api.get('/items/bookings', {
            params: {
                'filter[ride_id][_in]': rideIds.join(','),
                ...ACTIVE_BOOKING_QUERY,
                fields:
                    'id,ride_id,rider_name,rider_phone,seats_booked,total_price,payment_status,status,date_created',
                sort: '-date_created',
                limit: 100,
            },
        });
        return filterActiveBookings(response.data?.data || []);
    } catch (error) {
        console.warn('getBookingsForOwnerRides failed:', error);
        return [];
    }
};

export const getUserBookings = async (phone: string) => {
    const normalized = normalizePhone(phone);
    if (!normalized) return [];

    const params = {
        'filter[rider_phone][_eq]': normalized,
        ...ACTIVE_BOOKING_QUERY,
        sort: '-date_created',
        limit: 50,
    };

    try {
        const response = await api.get('/items/bookings', {
            params: {
                ...params,
                fields:
                    'id,ride_id,ride_id.from_location,ride_id.to_location,ride_id.driver_name,total_price,seats_booked,payment_status,status,date_created,rider_name,rider_phone',
            },
        });
        return filterActiveBookings(response.data?.data || []);
    } catch (error) {
        console.warn('getUserBookings detailed fields failed, retrying:', error);
        const response = await api.get('/items/bookings', {
            params: { ...params, fields: '*' },
        });
        return filterActiveBookings(response.data?.data || []);
    }
};

export const getUserOfferedRides = async (phone: string) => {
    const normalized = normalizePhone(phone);
    if (!normalized) return [];

    const params = {
        'filter[driver_name][_eq]': normalized,
        sort: '-date_created',
        limit: 50,
    };

    try {
        const response = await api.get('/items/rides', {
            params: {
                ...params,
                fields:
                    'id,from_location,to_location,price_per_seat,available_seats,status,departure_time,date_created,driver_name,trip_status,driver_lat,driver_lng',
            },
        });
        return response.data?.data || [];
    } catch (error) {
        console.warn('getUserOfferedRides detailed fields failed, retrying:', error);
        const response = await api.get('/items/rides', {
            params: { ...params, fields: '*' },
        });
        return response.data?.data || [];
    }
};

export const getFuelPrices = async () => {
    const fallbackDate = new Date().toLocaleDateString('en-IN');
    const fallback = [
        { id: 'fallback-petrol', fuel_type: 'Petrol', price: 105, last_updated: fallbackDate },
        { id: 'fallback-diesel', fuel_type: 'Diesel', price: 92, last_updated: fallbackDate },
        { id: 'fallback-cng', fuel_type: 'CNG', price: 78, last_updated: fallbackDate },
    ];
    try {
        const response = await api.get('/items/fuel_prices', { timeout: 8000 });
        const rows = response.data?.data;
        if (!Array.isArray(rows) || rows.length === 0) return fallback;
        return rows;
    } catch (error) {
        console.warn('getFuelPrices failed; using fallback values:', error);
        return fallback;
    }
};

const CAR_CATALOG_FALLBACK: Array<{ brand: string; model: string }> = [
    { brand: 'Maruti Suzuki', model: 'Alto K10' },
    { brand: 'Maruti Suzuki', model: 'Baleno' },
    { brand: 'Maruti Suzuki', model: 'Brezza' },
    { brand: 'Maruti Suzuki', model: 'Celerio' },
    { brand: 'Maruti Suzuki', model: 'Dzire' },
    { brand: 'Maruti Suzuki', model: 'Ertiga' },
    { brand: 'Maruti Suzuki', model: 'Fronx' },
    { brand: 'Maruti Suzuki', model: 'Grand Vitara' },
    { brand: 'Maruti Suzuki', model: 'Ignis' },
    { brand: 'Maruti Suzuki', model: 'Invicto' },
    { brand: 'Maruti Suzuki', model: 'Jimny' },
    { brand: 'Maruti Suzuki', model: 'S-Presso' },
    { brand: 'Maruti Suzuki', model: 'Swift' },
    { brand: 'Maruti Suzuki', model: 'Wagon R' },
    { brand: 'Maruti Suzuki', model: 'XL6' },
    { brand: 'Hyundai', model: 'Aura' },
    { brand: 'Hyundai', model: 'Creta' },
    { brand: 'Hyundai', model: 'Exter' },
    { brand: 'Hyundai', model: 'Grand i10 Nios' },
    { brand: 'Hyundai', model: 'Ioniq 5' },
    { brand: 'Hyundai', model: 'Tucson' },
    { brand: 'Hyundai', model: 'Venue' },
    { brand: 'Hyundai', model: 'Verna' },
    { brand: 'Hyundai', model: 'i20' },
    { brand: 'Tata', model: 'Altroz' },
    { brand: 'Tata', model: 'Curvv' },
    { brand: 'Tata', model: 'Harrier' },
    { brand: 'Tata', model: 'Nexon' },
    { brand: 'Tata', model: 'Punch' },
    { brand: 'Tata', model: 'Safari' },
    { brand: 'Tata', model: 'Tiago' },
    { brand: 'Tata', model: 'Tigor' },
    { brand: 'Mahindra', model: 'Bolero' },
    { brand: 'Mahindra', model: 'Bolero Neo' },
    { brand: 'Mahindra', model: 'Scorpio N' },
    { brand: 'Mahindra', model: 'Scorpio Classic' },
    { brand: 'Mahindra', model: 'Thar' },
    { brand: 'Mahindra', model: 'XUV 3XO' },
    { brand: 'Mahindra', model: 'XUV400' },
    { brand: 'Mahindra', model: 'XUV700' },
    { brand: 'Kia', model: 'Carens' },
    { brand: 'Kia', model: 'Carnival' },
    { brand: 'Kia', model: 'Seltos' },
    { brand: 'Kia', model: 'Sonet' },
    { brand: 'Kia', model: 'EV6' },
    { brand: 'Toyota', model: 'Camry' },
    { brand: 'Toyota', model: 'Fortuner' },
    { brand: 'Toyota', model: 'Glanza' },
    { brand: 'Toyota', model: 'Hilux' },
    { brand: 'Toyota', model: 'Hyryder' },
    { brand: 'Toyota', model: 'Innova Crysta' },
    { brand: 'Toyota', model: 'Innova Hycross' },
    { brand: 'Toyota', model: 'Rumion' },
    { brand: 'Honda', model: 'Amaze' },
    { brand: 'Honda', model: 'City' },
    { brand: 'Honda', model: 'City e:HEV' },
    { brand: 'Honda', model: 'Elevate' },
    { brand: 'Skoda', model: 'Kodiaq' },
    { brand: 'Skoda', model: 'Kushaq' },
    { brand: 'Skoda', model: 'Slavia' },
    { brand: 'Volkswagen', model: 'Taigun' },
    { brand: 'Volkswagen', model: 'Tiguan' },
    { brand: 'Volkswagen', model: 'Virtus' },
    { brand: 'Renault', model: 'Kiger' },
    { brand: 'Renault', model: 'Kwid' },
    { brand: 'Renault', model: 'Triber' },
    { brand: 'Nissan', model: 'Magnite' },
    { brand: 'MG', model: 'Astor' },
    { brand: 'MG', model: 'Comet EV' },
    { brand: 'MG', model: 'Gloster' },
    { brand: 'MG', model: 'Hector' },
    { brand: 'MG', model: 'Hector Plus' },
    { brand: 'MG', model: 'ZS EV' },
    { brand: 'BYD', model: 'Atto 3' },
    { brand: 'BYD', model: 'e6' },
    { brand: 'BYD', model: 'Seal' },
    { brand: 'Jeep', model: 'Compass' },
    { brand: 'Jeep', model: 'Meridian' },
    { brand: 'Citroen', model: 'Basalt' },
    { brand: 'Citroen', model: 'C3' },
    { brand: 'Citroen', model: 'C3 Aircross' },
    { brand: 'Citroen', model: 'eC3' },
    { brand: 'BMW', model: '2 Series Gran Coupe' },
    { brand: 'BMW', model: '3 Series' },
    { brand: 'BMW', model: '5 Series' },
    { brand: 'BMW', model: '7 Series' },
    { brand: 'BMW', model: 'i4' },
    { brand: 'BMW', model: 'iX' },
    { brand: 'BMW', model: 'X1' },
    { brand: 'BMW', model: 'X3' },
    { brand: 'BMW', model: 'X5' },
    { brand: 'Mercedes-Benz', model: 'A-Class Limousine' },
    { brand: 'Mercedes-Benz', model: 'C-Class' },
    { brand: 'Mercedes-Benz', model: 'E-Class' },
    { brand: 'Mercedes-Benz', model: 'EQB' },
    { brand: 'Mercedes-Benz', model: 'EQS' },
    { brand: 'Mercedes-Benz', model: 'GLA' },
    { brand: 'Mercedes-Benz', model: 'GLC' },
    { brand: 'Mercedes-Benz', model: 'GLE' },
    { brand: 'Audi', model: 'A4' },
    { brand: 'Audi', model: 'A6' },
    { brand: 'Audi', model: 'Q3' },
    { brand: 'Audi', model: 'Q5' },
    { brand: 'Audi', model: 'Q7' },
    { brand: 'Audi', model: 'Q8 e-tron' },
];

export const getCarCatalog = async (): Promise<Array<{ brand: string; model: string }>> => {
    try {
        const response = await api.get('/items/car_catalog', {
            params: {
                fields: 'brand,model',
                sort: 'brand,model',
                limit: 2000,
            },
        });
        const rows = response.data?.data || [];
        if (!Array.isArray(rows) || rows.length === 0) return CAR_CATALOG_FALLBACK;
        return rows;
    } catch (error) {
        console.warn('getCarCatalog failed, using fallback:', error);
        return CAR_CATALOG_FALLBACK;
    }
};

export const getCarBrands = async (): Promise<string[]> => {
    const rows = await getCarCatalog();
    return [...new Set(rows.map((r) => String(r.brand || '').trim()).filter(Boolean))].sort();
};

export const getCarModelsByBrand = async (brand: string): Promise<string[]> => {
    const rows = await getCarCatalog();
    const normalized = brand.trim().toLowerCase();
    return [
        ...new Set(
            rows
                .filter((r) => String(r.brand || '').trim().toLowerCase() === normalized)
                .map((r) => String(r.model || '').trim())
                .filter(Boolean)
        ),
    ].sort();
};

export const calculateSuggestedPrice = async (
    from: string,
    to: string,
    petrolPrice: number
): Promise<number> => {
    try {
        const response = await fetch(
            `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(from)}&destination=${encodeURIComponent(to)}&key=${GOOGLE_MAPS_API_KEY}`
        );
        const data = await response.json();
        if (data.routes && data.routes.length > 0) {
            const distanceMeters = data.routes[0].legs[0].distance.value;
            const distanceKm = distanceMeters / 1000;
            const mileage = 15;
            const litresUsed = distanceKm / mileage;
            const fuelCost = litresUsed * petrolPrice;
            return Math.ceil(fuelCost * 1.2);
        }
        return 0;
    } catch (error) {
        return 0;
    }
};