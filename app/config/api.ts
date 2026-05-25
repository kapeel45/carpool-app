import axios from 'axios';

const API_URL = 'http://192.168.1.25:8055';

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