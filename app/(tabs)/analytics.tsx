import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getUserBookings, getUserOfferedRides } from '@/app/config/api';
import { getSession } from '@/app/config/session';
import { useUserStats } from '@/hooks/use-user-stats';

export default function AnalyticsScreen() {
    const insets = useSafeAreaInsets();
    const { stats, loading, error: statsError, refresh } = useUserStats();
    const [bookings, setBookings] = useState<any[]>([]);
    const [offeredRides, setOfferedRides] = useState<any[]>([]);
    const [activityLoading, setActivityLoading] = useState(true);
    const [activityError, setActivityError] = useState<string | null>(null);

    useFocusEffect(
        useCallback(() => {
            const loadActivity = async () => {
                setActivityLoading(true);
                setActivityError(null);
                try {
                    const session = await getSession();
                    if (session?.phone) {
                        const [userBookings, userRides] = await Promise.all([
                            getUserBookings(session.phone),
                            getUserOfferedRides(session.phone),
                        ]);
                        setBookings(userBookings);
                        setOfferedRides(userRides);
                    } else {
                        setBookings([]);
                        setOfferedRides([]);
                    }
                } catch (err) {
                    console.error('Failed to load analytics activity:', err);
                    setBookings([]);
                    setOfferedRides([]);
                    setActivityError('Could not load ride history. Tap retry below.');
                } finally {
                    setActivityLoading(false);
                }
            };
            loadActivity();
        }, [])
    );

    const loadError = statsError || activityError;

    const handleRetry = () => {
        refresh();
        setActivityLoading(true);
        setActivityError(null);
        getSession().then(async (session) => {
            if (!session?.phone) {
                setActivityLoading(false);
                return;
            }
            try {
                const [userBookings, userRides] = await Promise.all([
                    getUserBookings(session.phone),
                    getUserOfferedRides(session.phone),
                ]);
                setBookings(userBookings);
                setOfferedRides(userRides);
            } catch {
                setActivityError('Could not load ride history. Tap retry below.');
            } finally {
                setActivityLoading(false);
            }
        });
    };

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
                <Text style={styles.title}>Analytics</Text>
                <Text style={styles.subtitle}>Your carpool activity overview</Text>
            </View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {loadError ? (
                    <View style={styles.errorCard}>
                        <Text style={styles.errorText}>{loadError}</Text>
                        <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
                            <Text style={styles.retryText}>Retry</Text>
                        </TouchableOpacity>
                    </View>
                ) : null}

                {loading ? (
                    <ActivityIndicator size="large" color="#1a73e8" style={styles.loader} />
                ) : (
                    <View style={styles.statsRow}>
                        <View style={styles.statBox}>
                            <Text style={styles.statNumber}>{stats.ridesTaken}</Text>
                            <Text style={styles.statLabel}>Taken</Text>
                        </View>
                        <View style={styles.statBox}>
                            <Text style={styles.statNumber}>{stats.ridesOffered}</Text>
                            <Text style={styles.statLabel}>Offered</Text>
                        </View>
                        <View style={styles.statBox}>
                            <Text style={styles.statNumber}>₹{stats.saved}</Text>
                            <Text style={styles.statLabel}>Saved</Text>
                        </View>
                    </View>
                )}

                <Text style={styles.sectionTitle}>Recent Bookings</Text>
                {activityLoading ? (
                    <ActivityIndicator size="small" color="#1a73e8" style={styles.sectionLoader} />
                ) : bookings.length === 0 ? (
                    <View style={styles.emptyCard}>
                        <Text style={styles.emptyText}>No bookings yet. Find a ride to get started.</Text>
                    </View>
                ) : (
                    bookings.map((booking) => (
                        <View key={booking.id} style={styles.card}>
                            <Text style={styles.cardTitle}>🧑 Booking</Text>
                            <Text style={styles.cardMeta}>
                                ₹{booking.total_price} • {booking.seats_booked || 1} seat(s)
                            </Text>
                            <Text style={styles.cardSub}>{booking.payment_status || 'pending'}</Text>
                        </View>
                    ))
                )}

                <Text style={styles.sectionTitle}>Published by you</Text>
                {activityLoading ? (
                    <ActivityIndicator size="small" color="#1a73e8" style={styles.sectionLoader} />
                ) : offeredRides.length === 0 ? (
                    <View style={styles.emptyCard}>
                        <Text style={styles.emptyText}>No rides offered yet. Publish a ride from home.</Text>
                    </View>
                ) : (
                    offeredRides.map((ride) => (
                        <View key={ride.id} style={styles.card}>
                            <Text style={styles.cardTitle}>🚗 {ride.from_location} → {ride.to_location}</Text>
                            <Text style={styles.cardMeta}>
                                ₹{ride.price_per_seat}/seat • {ride.available_seats} seats
                            </Text>
                            <Text style={styles.cardSub}>{ride.status || 'active'}</Text>
                        </View>
                    ))
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    scroll: { flex: 1 },
    scrollContent: { padding: 20, paddingBottom: 24 },
    header: {
        backgroundColor: '#1a73e8',
        paddingHorizontal: 24,
        paddingBottom: 24,
    },
    title: { color: '#fff', fontSize: 26, fontWeight: 'bold' },
    subtitle: { color: '#fff', fontSize: 16, opacity: 0.9, marginTop: 4 },
    loader: { marginVertical: 24 },
    statsRow: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 20,
        justifyContent: 'space-around',
        elevation: 2,
        marginBottom: 20,
    },
    statBox: { alignItems: 'center' },
    statNumber: { fontSize: 24, fontWeight: 'bold', color: '#1a73e8' },
    statLabel: { fontSize: 12, color: '#666', marginTop: 4, textAlign: 'center', minWidth: 56 },
    sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 12 },
    sectionLoader: { marginBottom: 16 },
    emptyCard: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 20,
    },
    emptyText: { color: '#666', fontSize: 14, textAlign: 'center' },
    errorCard: {
        backgroundColor: '#fdecea',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#f5c6c2',
    },
    errorText: { color: '#c62828', fontSize: 14, textAlign: 'center', marginBottom: 12 },
    retryButton: {
        backgroundColor: '#1a73e8',
        borderRadius: 8,
        paddingVertical: 10,
        alignItems: 'center',
    },
    retryText: { color: '#fff', fontWeight: '600', fontSize: 14 },
    card: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        elevation: 1,
    },
    cardTitle: { fontSize: 15, fontWeight: '600', color: '#333', marginBottom: 4 },
    cardMeta: { fontSize: 14, color: '#1a73e8', fontWeight: '600' },
    cardSub: { fontSize: 12, color: '#666', marginTop: 4, textTransform: 'capitalize' },
});
