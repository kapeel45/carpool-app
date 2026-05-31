import AsyncStorage from '@react-native-async-storage/async-storage';

export const saveSession = async (userData: any) => {
    try {
        await AsyncStorage.setItem('user_session', JSON.stringify(userData));
    } catch (error) {
        console.error('Error saving session:', error);
    }
};

export const getSession = async () => {
    try {
        const session = await AsyncStorage.getItem('user_session');
        return session ? JSON.parse(session) : null;
    } catch (error) {
        return null;
    }
};

export const clearSession = async () => {
    try {
        await AsyncStorage.removeItem('user_session');
    } catch (error) {
        console.error('Error clearing session:', error);
    }
};