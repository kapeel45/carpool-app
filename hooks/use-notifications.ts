import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { getNotificationsForUser, getUnreadNotificationCount, isNotificationRead } from '@/app/config/api';
import { getSession } from '@/app/config/session';

export type AppNotification = {
    id: string;
    title: string;
    message: string;
    bookingId?: string;
    read: boolean;
};

export function useNotifications() {
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const session = await getSession();
            if (!session?.phone) {
                setNotifications([]);
                setUnreadCount(0);
                return;
            }

            const [items, count] = await Promise.all([
                getNotificationsForUser(session.phone, true),
                getUnreadNotificationCount(session.phone),
            ]);

            setNotifications(
                items.map((n: any) => ({
                    id: String(n.id),
                    title: n.title || 'Notification',
                    message: n.message || '',
                    bookingId: n.booking_id ? String(n.booking_id) : undefined,
                    read: isNotificationRead(n.read),
                }))
            );
            setUnreadCount(count);
        } catch (error) {
            console.error('Failed to load notifications:', error);
            setNotifications([]);
            setUnreadCount(0);
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            refresh();
        }, [refresh])
    );

    return { notifications, unreadCount, loading, refresh };
}
