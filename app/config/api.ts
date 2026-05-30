import axios from 'axios';

const API_URL = 'http://192.168.1.25:8055';
const GOOGLE_MAPS_API_KEY = 'AIzaSyBhjfn1ZfqiR4zSGT8clhe2Yc-X8FYifF8';

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
            const pricePerSeat = Math.ceil(fuelCost * 1.2);
            return pricePerSeat;
        }
        return 0;
    } catch (error) {
        return 0;
    }
};

export const api = axios.create({
    baseURL: API_URL,
});

export const getRides = async () => {
    const response = await api.get('/items/rides');
    return response.data.data;
};

export const createBooking = async (bookingData: any) => {
    const response = await api.post('/items/bookings', bookingData);
    return response.data.data;
};

export const createRide = async (rideData: any) => {
    const response = await api.post('/items/rides', rideData);
    return response.data.data;
};

export const getFuelPrices = async () => {
    const response = await api.get('/items/fuel_prices');
    return response.data.data;
};