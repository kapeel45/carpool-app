import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchAppUserProfile, mergeSessionFromUser } from './api';

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

/** Load latest profile from Directus and merge into the local session (never wipe verified email on partial fetch). */
export const refreshSessionFromServer = async () => {
    const existing = await getSession();
    if (!existing?.loggedIn) return existing;

    const user = await fetchAppUserProfile({
        userId: existing.userId,
        phone: existing.phone,
    });

    if (!user) {
        console.warn('refreshSessionFromServer: could not load user from Directus');
        return existing;
    }

    const merged = mergeSessionFromUser(existing, user);
    await saveSession(merged);
    return merged;
};