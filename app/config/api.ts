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

export const resolveDisplayName = async (value?: string, fallback = 'Owner') => {
    if (!value) return fallback;
    const normalized = normalizePhone(value);
    if (normalized.length === 10 && value.replace(/\D/g, '') === normalized) {
        try {
            const user = await findUserByPhone(normalized);
            if (user?.name) return user.name;
            return `+91 ${normalized}`;
        } catch {
            return `+91 ${normalized}`;
        }
    }
    return value;
};

export const findUserByPhone = async (phone: string, excludeUserId?: string) => {
    const normalized = normalizePhone(phone);
    if (normalized.length !== 10) return null;

    try {
        const response = await api.get('/items/app_users', {
            params: {
                'filter[phone][_eq]': normalized,
                fields: 'id,phone,name,mpin,email,email_verified,gender,car_model,car_number,car_color',
                limit: 1,
            },
        });
        const user = response.data?.data?.[0];
        if (!user) return null;
        if (excludeUserId && String(user.id) === String(excludeUserId)) return null;
        return user;
    } catch (error) {
        console.warn('findUserByPhone failed:', error);
        return null;
    }
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
                name: user.name || `+91 ${normalized}`,
                gender: user.gender as string | undefined,
            };
        }
        return { name: `+91 ${normalized}`, gender: undefined };
    }
    return { name: value, gender: undefined };
};

export const createUser = async (phone: string) => {
    const normalized = normalizePhone(phone);
    if (normalized.length !== 10) {
        throw new Error('Enter a valid 10-digit mobile number.');
    }
    const existing = await findUserByPhone(normalized);
    if (existing) return existing;

    try {
        const response = await api.post('/items/app_users', {
            phone: normalized,
            total_rides: 0,
            total_earnings: 0,
            status: 'active',
        });
        return response.data.data;
    } catch (error: any) {
        const message = error?.response?.data?.errors?.[0]?.message || '';
        if (message.toLowerCase().includes('unique') || message.toLowerCase().includes('duplicate')) {
            const existingAfterRace = await findUserByPhone(normalized);
            if (existingAfterRace) return existingAfterRace;
        }
        throw error;
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

export const createBooking = async (bookingData: any) => {
    const response = await api.post('/items/bookings', {
        ...bookingData,
        rider_phone: normalizePhone(bookingData.rider_phone || ''),
    });
    return response.data.data;
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
                    fields: 'id,total_price',
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

        const bookings = bookingsResponse.data?.data || [];
        const rides = ridesResponse.data?.data || [];

        const saved = bookings.reduce(
            (sum: number, booking: { total_price?: number | string }) =>
                sum + (Number(booking.total_price) || 0),
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
        sort: '-date_created',
        limit: 50,
    };

    try {
        const response = await api.get('/items/bookings', {
            params: {
                ...params,
                fields:
                    'id,ride_id,total_price,seats_booked,payment_status,date_created,rider_name,rider_phone',
            },
        });
        return response.data?.data || [];
    } catch (error) {
        console.warn('getUserBookings detailed fields failed, retrying:', error);
        const response = await api.get('/items/bookings', {
            params: { ...params, fields: '*' },
        });
        return response.data?.data || [];
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