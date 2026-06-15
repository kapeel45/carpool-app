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
            const session = refreshOnFocus
                ? (await refreshSessionFromServer()) || (await getSession())
                : await getSession();

            if (session?.loggedIn) {
                setLoggedIn(true);
                setName(session.name?.trim() || '');
                setPhotoUrl(session.profilePhotoUrl || null);
            } else {
                setLoggedIn(false);
                setName('');
                setPhotoUrl(null);
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
