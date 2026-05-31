import axios from 'axios';

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

export const sendEmailOTP = async (email: string, userId: string) => {
    // Generate 6 digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Save OTP to Directus
    // Add 5.5 hours offset for IST + 30 min expiry
    const expiresAt = new Date(Date.now() + (5.5 * 60 + 10) * 60 * 1000);

    await api.post('/items/email_otps', {
        email,
        otp,
        user_id: userId,
        expires_at: expiresAt.toISOString(),
        used: false,
        status: 'active'
    });

    // Send email via Resend
    const emailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            from: 'CarpoolApp <onboarding@resend.dev>',
            to: email,
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
            `
        })
    });

    const emailData = await emailResponse.json();
    if (!emailResponse.ok) throw new Error('Failed to send email');
    return { success: true, otp };
};

export const verifyEmailOTP = async (email: string, otp: string, userId: string) => {
    const response = await fetch(
        `${API_URL}/items/email_otps?filter[email][_eq]=${email}&filter[otp][_eq]=${otp}&filter[used][_eq]=false&sort=-date_created&limit=1`,
        {
            headers: {
                'Authorization': `Bearer ${ADMIN_TOKEN}`,
                'Content-Type': 'application/json'
            }
        }
    );
    const data = await response.json();
    const otpRecord = data.data?.[0];

    if (!otpRecord) return { success: false, message: 'Invalid OTP' };

    // Fix timezone issue - compare timestamps properly
    const expiresAt = new Date(otpRecord.expires_at).getTime();
    const now = new Date().getTime();

    console.log('Expires at:', new Date(otpRecord.expires_at).toISOString());
    console.log('Now:', new Date().toISOString());
    console.log('Diff minutes:', (expiresAt - now) / 60000);

    if (now > expiresAt) {
        return { success: false, message: 'OTP expired. Please request a new one.' };
    }

    // Mark OTP as used
    await api.patch(`/items/email_otps/${otpRecord.id}`, { used: true });

    // Mark user email as verified
    await api.patch(`/items/app_users/${userId}`, { email_verified: true });

    return { success: true };
};

export const normalizePhone = (phone: string) => phone.replace(/\D/g, '').slice(-10);

export const resolveDisplayName = async (value?: string, fallback = 'Driver') => {
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

export const findUserByPhone = async (phone: string) => {
    const normalized = normalizePhone(phone);
    const response = await fetch(
        `${API_URL}/items/app_users?filter[phone][_eq]=${encodeURIComponent(normalized)}&fields=id,phone,name,mpin,email,email_verified,car_model,car_number,car_color&limit=1`,
        {
            headers: {
                'Authorization': `Bearer ${ADMIN_TOKEN}`,
                'Content-Type': 'application/json'
            }
        }
    );
    if (!response.ok) {
        throw new Error('Failed to look up user');
    }
    const data = await response.json();
    const users = data.data;
    return users && users.length > 0 ? users[0] : null;
};
export const createUser = async (phone: string) => {
    const normalized = normalizePhone(phone);
    const existing = await findUserByPhone(normalized);
    if (existing) return existing;

    const response = await api.post('/items/app_users', {
        phone: normalized,
        total_rides: 0,
        total_earnings: 0,
        status: 'active'
    });
    return response.data.data;
};

export const updateUserProfile = async (userId: string, data: any) => {
    const response = await api.patch(`/items/app_users/${userId}`, data);
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
    const response = await api.post('/items/bookings', bookingData);
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

    const [bookingsResponse, ridesResponse] = await Promise.all([
        api.get(
            `/items/bookings?filter[rider_phone][_eq]=${encodeURIComponent(normalized)}&fields=id,total_price`
        ),
        api.get(
            `/items/rides?filter[driver_name][_eq]=${encodeURIComponent(normalized)}&fields=id,price_per_seat,available_seats`
        ),
    ]);

    const bookings = bookingsResponse.data.data || [];
    const rides = ridesResponse.data.data || [];

    const saved = bookings.reduce(
        (sum: number, booking: any) => sum + (Number(booking.total_price) || 0),
        0
    );

    return {
        ridesTaken: bookings.length,
        ridesOffered: rides.length,
        saved,
    };
};

export const getUserBookings = async (phone: string) => {
    const normalized = normalizePhone(phone);
    if (!normalized) return [];

    const response = await api.get(
        `/items/bookings?filter[rider_phone][_eq]=${encodeURIComponent(normalized)}&sort=-date_created`
    );
    return response.data.data || [];
};

export const getUserOfferedRides = async (phone: string) => {
    const normalized = normalizePhone(phone);
    if (!normalized) return [];

    const response = await api.get(
        `/items/rides?filter[driver_name][_eq]=${encodeURIComponent(normalized)}&sort=-date_created`
    );
    return response.data.data || [];
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