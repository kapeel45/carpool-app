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
    return departure > Date.now();
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

    const hasResendKey =
        Boolean(RESEND_API_KEY) &&
        !RESEND_API_KEY.includes('your-resend') &&
        !RESEND_API_KEY.includes('1234567890') &&
        RESEND_API_KEY.startsWith('re_');

    if (hasResendKey) {
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

export const buildSessionFromUser = (user: {
    id: string | number;
    phone?: string;
    name?: string | null;
    gender?: string | null;
    email?: string | null;
    email_verified?: boolean;
    car_model?: string | null;
    car_number?: string | null;
    car_color?: string | null;
}) => ({
    loggedIn: true,
    userId: user.id,
    phone: user.phone,
    name: user.name?.trim() || '',
    gender: user.gender,
    email: user.email,
    emailVerified: user.email_verified,
    carModel: user.car_model,
    carNumber: user.car_number,
    carColor: user.car_color,
});

/** Fields that exist on a typical app_users collection (omit optional columns like gender). */
const USER_READ_FIELDS = 'id,phone,name,mpin,email,email_verified,car_model,car_number,car_color';
const USER_READ_FIELDS_MINIMAL = 'id,phone,name,mpin';

export const getUserById = async (userId: string | number) => {
    const id = String(userId);
    if (!id) return null;

    for (const fields of [USER_READ_FIELDS, USER_READ_FIELDS_MINIMAL]) {
        try {
            const response = await api.get(`/items/app_users/${id}`, { params: { fields } });
            return response.data?.data ?? null;
        } catch (error) {
            console.warn(`getUserById(${id}) fields=${fields} failed:`, error);
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

    const filterParams = {
        'filter[phone][_eq]': normalized,
        limit: 1,
    };

    for (const fields of [USER_READ_FIELDS, USER_READ_FIELDS_MINIMAL]) {
        try {
            const response = await api.get('/items/app_users', {
                params: { ...filterParams, fields },
            });
            const user = response.data?.data?.[0];
            if (!user) return null;
            if (excludeUserId && String(user.id) === String(excludeUserId)) return null;
            return user;
        } catch (error) {
            console.warn(`findUserByPhone fields=${fields} failed:`, error);
        }
    }
    return null;
};

export const assertPhoneAvailable = async (phone: string, forUserId?: string) => {
    const other = await findUserByPhone(phone, forUserId);
    if (other) {
        throw new Error('This phone number is already registered. Log in with that number instead.');
    }
};

export const resolveOwnerInfo = async (value?: string) => {
    if (!value) return { name: 'Owner', gender: undefined as string | undefined };
    const normalized = normalizePhone(value);
    if (normalized.length === 10) {
        const user = await findUserByPhone(normalized);
        if (user) {
            return {
                name: getDisplayName(user.name) || 'Owner',
                gender: user.gender as string | undefined,
            };
        }
        return { name: 'Owner', gender: undefined };
    }
    return { name: value, gender: undefined };
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

export const updateUserProfile = async (userId: string, data: any) => {
    const payload = { ...data };
    if (payload.email != null && payload.email !== '') {
        payload.email = normalizeEmail(String(payload.email));
        assertOfficialWorkEmail(payload.email);
        await assertEmailAvailable(payload.email, userId);
    }
    const response = await api.patch(`/items/app_users/${userId}`, payload);
    return response.data.data;
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

export const cancelBooking = async (bookingId: string) => {
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

    return cancelled;
};

export const getBookingById = async (id: string) => {
    const response = await api.get(`/items/bookings/${id}?fields=*,ride_id.*`);
    return response.data.data;
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
        console.error('getUserStats failed:', error);
        throw error;
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
                    'id,ride_id,total_price,seats_booked,payment_status,status,date_created,rider_name,rider_phone',
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
                    'id,from_location,to_location,price_per_seat,available_seats,status,departure_time,date_created,driver_name',
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
    const response = await api.get('/items/fuel_prices');
    return response.data.data;
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