import { useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { markAllNotificationsRead, markNotificationRead } from './config/api';
import { getSession } from './config/session';
import { useNotifications } from '@/hooks/use-notifications';

export default function NotificationsScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { notifications, unreadCount, loading, refresh } = useNotifications();

    const handleOpen = async (notification: (typeof notifications)[0]) => {
        if (!notification.read) {
            await markNotificationRead(notification.id);
            refresh();
        }
        if (notification.bookingId) {
            router.push({
                pathname: '/booking',
                params: { viewOnly: 'true', bookingId: notification.bookingId },
            });
        }
    };

    const handleMarkAllRead = async () => {
        const session = await getSession();
        if (!session?.phone) return;
        await markAllNotificationsRead(session.phone);
        refresh();
    };

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton} hitSlop={12}>
                    <Text style={styles.backText}>← Back</Text>
                </TouchableOpacity>
                <View style={styles.headerRow}>
                    <View style={styles.headerText}>
                        <Text style={styles.title}>Notifications</Text>
                        <Text style={styles.subtitle}>
                            {unreadCount > 0
                                ? `${unreadCount} unread`
                                : 'Booking updates and alerts'}
                        </Text>
                    </View>
                    {unreadCount > 0 ? (
                        <TouchableOpacity onPress={handleMarkAllRead} style={styles.markAllButton}>
                            <Text style={styles.markAllText}>Mark all read</Text>
                        </TouchableOpacity>
                    ) : null}
                </View>
            </View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {loading ? (
                    <ActivityIndicator size="large" color="#1a73e8" style={styles.loader} />
                ) : notifications.length === 0 ? (
                    <View style={styles.emptyCard}>
                        <Text style={styles.emptyIcon}>🔔</Text>
                        <Text style={styles.emptyTitle}>No notifications yet</Text>
                        <Text style={styles.emptyText}>
                            When someone cancels a booking, you will see an alert here.
                        </Text>
                    </View>
                ) : (
                    notifications.map((notification) => (
                        <TouchableOpacity
                            key={notification.id}
                            style={[
                                styles.notificationCard,
                                !notification.read && styles.notificationUnread,
                            ]}
                            onPress={() => handleOpen(notification)}
                            activeOpacity={0.85}
                        >
                            <View style={styles.notificationHeader}>
                                <Text style={styles.notificationTitle}>{notification.title}</Text>
                                {!notification.read ? <View style={styles.unreadDot} /> : null}
                            </View>
                            {notification.message ? (
                                <Text style={styles.notificationMessage}>{notification.message}</Text>
                            ) : (
                                <Text style={styles.notificationMessageMuted}>Tap to view details</Text>
                            )}
                            {notification.bookingId ? (
                                <Text style={styles.viewLink}>View booking →</Text>
                            ) : null}
                        </TouchableOpacity>
                    ))
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    scroll: { flex: 1 },
    scrollContent: { padding: 20, paddingBottom: 32 },
    header: {
        backgroundColor: '#1a73e8',
        paddingHorizontal: 24,
        paddingBottom: 24,
    },
    backButton: { marginBottom: 12 },
    backText: { color: '#fff', fontSize: 16, fontWeight: '600', opacity: 0.95 },
    headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
    headerText: { flex: 1, paddingRight: 12 },
    title: { color: '#fff', fontSize: 26, fontWeight: 'bold' },
    subtitle: { color: '#fff', fontSize: 15, opacity: 0.9, marginTop: 4 },
    markAllButton: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    markAllText: { color: '#fff', fontSize: 13, fontWeight: '600' },
    loader: { marginTop: 40 },
    emptyCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 32,
        alignItems: 'center',
        elevation: 2,
    },
    emptyIcon: { fontSize: 40, marginBottom: 12 },
    emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 8 },
    emptyText: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 20 },
    notificationCard: {
        backgroundColor: '#fff',
        borderRadius: 14,
        padding: 16,
        marginBottom: 12,
        elevation: 1,
    },
    notificationUnread: {
        borderLeftWidth: 4,
        borderLeftColor: '#f59e0b',
        backgroundColor: '#fffdf5',
    },
    notificationHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    notificationTitle: { fontSize: 16, fontWeight: '700', color: '#333', flex: 1 },
    unreadDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#ea4335',
        marginLeft: 8,
    },
    notificationMessage: { fontSize: 14, color: '#555', lineHeight: 20 },
    notificationMessageMuted: { fontSize: 14, color: '#888', lineHeight: 20, fontStyle: 'italic' },
    viewLink: { fontSize: 13, color: '#1a73e8', fontWeight: '600', marginTop: 10 },
});
