import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { getUserStats, UserStats } from '@/app/config/api';
import { getSession } from '@/app/config/session';

const emptyStats: UserStats = {
    ridesTaken: 0,
    ridesOffered: 0,
    saved: 0,
};

export function useUserStats() {
    const [stats, setStats] = useState<UserStats>(emptyStats);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const session = await getSession();
            if (session?.loggedIn && session.phone) {
                setStats(await getUserStats(session.phone));
            } else {
                setStats(emptyStats);
            }
        } catch (error) {
            console.error('Failed to load user stats:', error);
            setStats(emptyStats);
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            refresh();
        }, [refresh])
    );

    return { stats, loading, refresh };
}
