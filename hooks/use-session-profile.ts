import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { getSession, refreshSessionFromServer } from '@/app/config/session';

export function useSessionProfile(refreshOnFocus = true) {
    const [name, setName] = useState('');
    const [photoUrl, setPhotoUrl] = useState<string | null>(null);
    const [loggedIn, setLoggedIn] = useState(false);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            // Paint avatar immediately from cached session, then refresh in background.
            const cached = await getSession();
            if (cached?.loggedIn) {
                setLoggedIn(true);
                setName(cached.name?.trim() || '');
                setPhotoUrl(cached.profilePhotoUrl || null);
            } else {
                setLoggedIn(false);
                setName('');
                setPhotoUrl(null);
            }

            setLoading(false);

            if (!refreshOnFocus || !cached?.loggedIn) return;

            const fresh = await refreshSessionFromServer();
            if (fresh?.loggedIn) {
                setLoggedIn(true);
                setName(fresh.name?.trim() || '');
                setPhotoUrl(fresh.profilePhotoUrl || null);
            }
        } catch {
            const session = await getSession();
            setLoggedIn(Boolean(session?.loggedIn));
            setName(session?.name?.trim() || '');
            setPhotoUrl(session?.profilePhotoUrl || null);
        } finally {
            setLoading(false);
        }
    }, [refreshOnFocus]);

    useFocusEffect(
        useCallback(() => {
            refresh();
        }, [refresh])
    );

    return { name, photoUrl, loggedIn, loading, refresh };
}
