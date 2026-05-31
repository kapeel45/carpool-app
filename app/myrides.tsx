import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getRides, getUserBookings, getUserOfferedRides, normalizePhone, resolveDisplayName } from './config/api';
import { getSession } from './config/session';
import { useUserStats } from '@/hooks/use-user-stats';

type RideItem = {
    id: string;
    type: 'rider' | 'driver';
    from: string;
    to: string;
    time: string;
    departureTime: string;
    driver: string;
    driverPhone: string;
    price: number;
    pricePerSeat: number;
    seats: number;
    status: 'confirmed' | 'completed';
    rideId?: string;
};

const formatRideTime = (value?: string) => {
    if (!value) return 'Time TBD';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('en-IN', {
        weekday: 'short',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });
};

export default function MyRidesScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { stats, loading: statsLoading } = useUserStats();
    const [upcomingRides, setUpcomingRides] = useState<RideItem[]>([]);
    const [pastRides, setPastRides] = useState<RideItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [userName, setUserName] = useState('');

    useFocusEffect(
        useCallback(() => {
            const loadRides = async () => {
                setLoading(true);
                try {
                    const session = await getSession();
                    if (!session?.phone) {
                        setUserName('');
                        setUpcomingRides([]);
                        setPastRides([]);
                        return;
                    }

                    setUserName(session.name || session.phone);

                    const [bookings, offeredRides, allRides] = await Promise.all([
                        getUserBookings(session.phone),
                        getUserOfferedRides(session.phone),
                        getRides(),
                    ]);

                    const nameCache = new Map<string, string>();
                    const getDriverLabel = async (raw?: string) => {
                        const key = raw || '';
                        if (nameCache.has(key)) return nameCache.get(key)!;
                        const label = await resolveDisplayName(raw, 'Driver');
                        nameCache.set(key, label);
                        return label;
                    };

                    const now = Date.now();
                    const items: RideItem[] = [];

                    for (const booking of bookings) {
                        const ride = allRides.find(
                            (r: any) => r.id?.toString() === booking.ride_id?.toString()
                        );
                        const departure = ride?.departure_time;
                        const isUpcoming = departure ? new Date(departure).getTime() >= now : true;
                        const driverRaw = ride?.driver_name || '';
                        items.push({
                            id: `booking-${booking.id}`,
                            type: 'rider',
                            from: ride?.from_location || 'Pickup',
                            to: ride?.to_location || 'Destination',
                            time: formatRideTime(departure),
                            departureTime: departure || '',
                            driver: await getDriverLabel(driverRaw),
                            driverPhone: normalizePhone(driverRaw) || driverRaw,
                            price: Number(booking.total_price) || 0,
                            pricePerSeat: Number(ride?.price_per_seat) || Number(booking.total_price) || 0,
                            seats: Number(ride?.available_seats) || 1,
                            status: isUpcoming ? 'confirmed' : 'completed',
                            rideId: ride?.id?.toString(),
                        });
                    }

                    for (const ride of offeredRides) {
                        const departure = ride.departure_time;
                        const isUpcoming = departure ? new Date(departure).getTime() >= now : true;
                        const seats = Number(ride.available_seats) || 0;
                        const pricePerSeat = Number(ride.price_per_seat) || 0;
                        items.push({
                            id: `ride-${ride.id}`,
                            type: 'driver',
                            from: ride.from_location || 'Pickup',
                            to: ride.to_location || 'Destination',
                            time: formatRideTime(departure),
                            departureTime: departure || '',
                            driver: session.name || 'You',
                            driverPhone: session.phone,
                            price: seats * pricePerSeat,
                            pricePerSeat,
                            seats,
                            status: isUpcoming ? 'confirmed' : 'completed',
                            rideId: ride.id?.toString(),
                        });
                    }

                    setUpcomingRides(items.filter((item) => item.status === 'confirmed'));
                    setPastRides(items.filter((item) => item.status === 'completed'));
                } catch (error) {
                    console.error('Failed to load my rides:', error);
                    setUpcomingRides([]);
                    setPastRides([]);
                } finally {
                    setLoading(false);
                }
            };
            loadRides();
        }, [])
    );

    const RideCard = ({ ride }: { ride: RideItem }) => (
        <View style={styles.card}>
            <View style={styles.cardTop}>
                <View style={styles.typeBadge}>
                    <Text style={styles.typeText}>{ride.type === 'driver' ? '🚗 Driver' : '👤 Rider'}</Text>
                </View>
                <View style={[styles.statusBadge, ride.status === 'confirmed' ? styles.statusConfirmed : styles.statusCompleted]}>
                    <Text style={styles.statusText}>
                        {ride.status === 'confirmed' ? '✅ Upcoming' : '☑️ Completed'}
                    </Text>
                </View>
            </View>

            <View style={styles.routeRow}>
                <View style={styles.routeDetails}>
                    <Text style={styles.routeText}>🟢 {ride.from}</Text>
                    <Text style={styles.routeLine}>|</Text>
                    <Text style={styles.routeText}>🔴 {ride.to}</Text>
                </View>
                <Text style={styles.price}>₹{ride.price}</Text>
            </View>

            <View style={styles.cardBottom}>
                <Text style={styles.meta}>🕐 {ride.time}</Text>
                <Text style={styles.meta}>
                    {ride.type === 'driver' ? `🧑 ${ride.driver}` : `🧑 Driver: ${ride.driver}`}
                </Text>
            </View>

            {ride.type === 'rider' && ride.status === 'confirmed' && ride.rideId && (
                <TouchableOpacity
                    style={styles.viewButton}
                    onPress={() =>
                        router.push({
                            pathname: '/booking',
                            params: {
                                viewOnly: 'true',
                                rideId: ride.rideId,
                                from: ride.from,
                                to: ride.to,
                                time: ride.departureTime || ride.time,
                                price: String(ride.pricePerSeat || ride.price),
                                driver: ride.driver,
                                driverPhone: ride.driverPhone,
                                seats: String(ride.seats || 1),
                            },
                        })
                    }
                >
                    <Text style={styles.viewButtonText}>View Booking →</Text>
                </TouchableOpacity>
            )}
        </View>
    );

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton} hitSlop={12}>
                    <Text style={styles.backText}>← Back</Text>
                </TouchableOpacity>
                <View style={styles.headerText}>
                    <Text style={styles.title}>My Rides</Text>
                    <Text style={styles.subtitle}>
                        {userName ? `Hi ${userName} • your bookings and offered rides` : 'Your bookings and offered rides'}
                    </Text>
                </View>
            </View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.statsRow}>
                    {statsLoading ? (
                        <ActivityIndicator size="small" color="#1a73e8" style={styles.statsLoader} />
                    ) : (
                        <>
                            <View style={styles.statBox}>
                                <Text style={styles.statNumber}>{stats.ridesTaken}</Text>
                                <Text style={styles.statLabel}>Rides Taken</Text>
                            </View>
                            <View style={styles.statBox}>
                                <Text style={styles.statNumber}>{stats.ridesOffered}</Text>
                                <Text style={styles.statLabel}>Rides Offered</Text>
                            </View>
                            <View style={styles.statBox}>
                                <Text style={styles.statNumber}>₹{stats.saved}</Text>
                                <Text style={styles.statLabel}>Saved</Text>
                            </View>
                        </>
                    )}
                </View>

                {loading ? (
                    <ActivityIndicator size="large" color="#1a73e8" style={styles.loader} />
                ) : (
                    <>
                        <Text style={styles.sectionTitle}>Upcoming</Text>
                        {upcomingRides.length === 0 ? (
                            <View style={styles.emptyCard}>
                                <Text style={styles.emptyText}>No upcoming rides</Text>
                            </View>
                        ) : (
                            upcomingRides.map((ride) => <RideCard key={ride.id} ride={ride} />)
                        )}

                        <Text style={styles.sectionTitle}>Past Rides</Text>
                        {pastRides.length === 0 ? (
                            <View style={styles.emptyCard}>
                                <Text style={styles.emptyText}>No past rides yet</Text>
                            </View>
                        ) : (
                            pastRides.map((ride) => <RideCard key={ride.id} ride={ride} />)
                        )}
                    </>
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
    backButton: { marginBottom: 12 },
    backText: { color: '#fff', fontSize: 16, fontWeight: '600', opacity: 0.95 },
    headerText: { flex: 1 },
    title: { color: '#fff', fontSize: 26, fontWeight: 'bold' },
    subtitle: { color: '#fff', fontSize: 16, opacity: 0.9, marginTop: 4 },
    statsRow: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 20,
        justifyContent: 'space-around',
        elevation: 2,
        marginBottom: 20,
    },
    statBox: { alignItems: 'center', flex: 1 },
    statsLoader: { flex: 1, paddingVertical: 8 },
    statNumber: { fontSize: 22, fontWeight: 'bold', color: '#1a73e8' },
    statLabel: { fontSize: 12, color: '#666', marginTop: 4, textAlign: 'center' },
    loader: { marginVertical: 32 },
    sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 12 },
    emptyCard: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
    },
    emptyText: { color: '#666', fontSize: 14, textAlign: 'center' },
    card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, elevation: 2 },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
    typeBadge: { backgroundColor: '#f0f5ff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
    typeText: { color: '#1a73e8', fontSize: 13, fontWeight: '600' },
    statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
    statusConfirmed: { backgroundColor: '#e8f5e9' },
    statusCompleted: { backgroundColor: '#f5f5f5' },
    statusText: { fontSize: 13, fontWeight: '600', color: '#333' },
    routeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
    routeDetails: { flex: 1, paddingRight: 12 },
    routeText: { fontSize: 14, color: '#333', fontWeight: '500' },
    routeLine: { color: '#ccc', fontSize: 12, marginVertical: 4 },
    price: { fontSize: 20, fontWeight: 'bold', color: '#1a73e8' },
    cardBottom: { flexDirection: 'row', gap: 16, marginBottom: 4 },
    meta: { fontSize: 13, color: '#666', flex: 1 },
    viewButton: {
        backgroundColor: '#f0f5ff',
        borderRadius: 10,
        padding: 12,
        alignItems: 'center',
        marginTop: 12,
    },
    viewButtonText: { color: '#1a73e8', fontWeight: '600' },
});
