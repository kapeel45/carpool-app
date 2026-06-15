import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NotificationBell from './components/NotificationBell';
import {
    cancelBooking,
    getBookingsForOwnerRides,
    getDisplayName,
    getRideIdsWithActiveBookings,
    getRides,
    getUserBookings,
    getUserOfferedRides,
    isCancelledBooking,
    normalizePhone,
    resolveDisplayName,
    resolveRelationId,
} from './config/api';
import { getSession } from './config/session';
import { useUserStats } from '@/hooks/use-user-stats';

type RiderBooking = {
    bookingId: string;
    riderName: string;
    riderPhone: string;
    seats: number;
    price: number;
};

type RideItem = {
    id: string;
    type: 'rider' | 'owner';
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
    bookingId?: string;
    canEdit?: boolean;
    riderBookings?: RiderBooking[];
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
    const [userPhone, setUserPhone] = useState('');
    const [cancellingId, setCancellingId] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);

    const handleCancelBooking = (ride: RideItem, bookingId?: string) => {
        const id = bookingId || ride.bookingId;
        if (!id) {
            Alert.alert('Error', 'Could not find this booking to cancel.');
            return;
        }

        const isOwner = ride.type === 'owner';
        Alert.alert(
            'Cancel Booking?',
            isOwner
                ? 'Cancel this rider\'s booking? The rider will be notified.'
                : 'Are you sure you want to cancel? The ride owner will be notified.',
            [
                { text: 'No, Keep It', style: 'cancel' },
                {
                    text: 'Yes, Cancel',
                    style: 'destructive',
                    onPress: async () => {
                        setCancellingId(id);
                        try {
                            await cancelBooking(id, userPhone);
                            setReloadKey((k) => k + 1);
                            Alert.alert(
                                'Cancelled',
                                isOwner
                                    ? 'The booking was cancelled and the rider was notified.'
                                    : 'Your booking has been cancelled.'
                            );
                        } catch (error: any) {
                            const msg =
                                error?.response?.data?.errors?.[0]?.message ||
                                error?.message ||
                                'Could not cancel booking. Try again.';
                            Alert.alert('Error', msg);
                        } finally {
                            setCancellingId(null);
                        }
                    },
                },
            ]
        );
    };

    useFocusEffect(
        useCallback(() => {
            const loadRides = async () => {
                setLoading(true);
                try {
                    const session = await getSession();
                    if (!session?.phone) {
                        setUserName('');
                        setUserPhone('');
                        setUpcomingRides([]);
                        setPastRides([]);
                        return;
                    }

                    setUserPhone(session.phone);
                    setUserName(getDisplayName(session.name));

                    const [bookings, offeredRides, allRides, ridesWithBookings, ownerBookings] =
                        await Promise.all([
                            getUserBookings(session.phone),
                            getUserOfferedRides(session.phone),
                            getRides(),
                            getRideIdsWithActiveBookings(),
                            getBookingsForOwnerRides(session.phone),
                        ]);

                    const ownerBookingsByRide = new Map<string, RiderBooking[]>();
                    for (const booking of ownerBookings) {
                        const rideIdStr = resolveRelationId(booking.ride_id) || '';
                        if (!rideIdStr) continue;
                        const list = ownerBookingsByRide.get(rideIdStr) || [];
                        list.push({
                            bookingId: String(booking.id),
                            riderName: String(booking.rider_name || 'Rider').trim() || 'Rider',
                            riderPhone: normalizePhone(String(booking.rider_phone || '')),
                            seats: Math.max(1, Number(booking.seats_booked) || 1),
                            price: Number(booking.total_price) || 0,
                        });
                        ownerBookingsByRide.set(rideIdStr, list);
                    }

                    const nameCache = new Map<string, string>();
                    const getOwnerLabel = async (raw?: string) => {
                        const key = raw || '';
                        if (nameCache.has(key)) return nameCache.get(key)!;
                        const label = await resolveDisplayName(raw, 'Owner');
                        nameCache.set(key, label);
                        return label;
                    };

                    const now = Date.now();
                    const items: RideItem[] = [];

                    for (const booking of bookings) {
                        if (isCancelledBooking(booking)) continue;

                        const rideRef = booking.ride_id;
                        const rideFromRelation =
                            typeof rideRef === 'object' && rideRef !== null ? rideRef : null;
                        const rideIdStr = resolveRelationId(rideRef);
                        const ride =
                            rideFromRelation ||
                            allRides.find((r: any) => r.id?.toString() === rideIdStr);
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
                            driver: await getOwnerLabel(driverRaw),
                            driverPhone: normalizePhone(driverRaw) || driverRaw,
                            price: Number(booking.total_price) || 0,
                            pricePerSeat: Number(ride?.price_per_seat) || Number(booking.total_price) || 0,
                            seats: Math.max(1, Number(booking.seats_booked) || 1),
                            status: isUpcoming ? 'confirmed' : 'completed',
                            rideId: rideIdStr || ride?.id?.toString(),
                            bookingId: String(booking.id),
                        });
                    }

                    for (const ride of offeredRides) {
                        const departure = ride.departure_time;
                        const isUpcoming = departure ? new Date(departure).getTime() >= now : true;
                        const seats = Number(ride.available_seats) || 0;
                        const pricePerSeat = Number(ride.price_per_seat) || 0;
                        const rideIdStr = ride.id?.toString() || '';
                        const riderBookings = ownerBookingsByRide.get(rideIdStr) || [];
                        items.push({
                            id: `ride-${ride.id}`,
                            type: 'owner',
                            from: ride.from_location || 'Pickup',
                            to: ride.to_location || 'Destination',
                            time: formatRideTime(departure),
                            departureTime: departure || '',
                            driver: getDisplayName(session.name) || 'You',
                            driverPhone: session.phone,
                            price: seats * pricePerSeat,
                            pricePerSeat,
                            seats,
                            status: isUpcoming ? 'confirmed' : 'completed',
                            rideId: rideIdStr,
                            canEdit: isUpcoming && rideIdStr.length > 0 && !ridesWithBookings.has(rideIdStr),
                            riderBookings,
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
        }, [reloadKey])
    );

    const RideCard = ({ ride }: { ride: RideItem }) => (
        <View style={styles.card}>
            <View style={styles.cardTop}>
                <View style={styles.typeBadge}>
                    <Text style={styles.typeText}>{ride.type === 'owner' ? '🚗 Owner' : '👤 Rider'}</Text>
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
                    {ride.type === 'owner' ? `🧑 ${ride.driver}` : `🧑 Owner: ${ride.driver}`}
                </Text>
            </View>

            {ride.type === 'rider' && (
                <View style={styles.actionRow}>
                    <TouchableOpacity
                        style={styles.viewButton}
                        onPress={() =>
                            router.push({
                                pathname: '/booking',
                                params: {
                                    viewOnly: 'true',
                                    bookingId: ride.bookingId || '',
                                },
                            })
                        }
                    >
                        <Text style={styles.viewButtonText}>View Booking</Text>
                    </TouchableOpacity>
                    {ride.status === 'confirmed' && ride.bookingId ? (
                        <TouchableOpacity
                            style={[
                                styles.cancelButton,
                                cancellingId === ride.bookingId && styles.cancelButtonDisabled,
                            ]}
                            onPress={() => handleCancelBooking(ride)}
                            disabled={cancellingId === ride.bookingId}
                        >
                            {cancellingId === ride.bookingId ? (
                                <ActivityIndicator color="#d32f2f" size="small" />
                            ) : (
                                <Text style={styles.cancelButtonText}>Cancel</Text>
                            )}
                        </TouchableOpacity>
                    ) : null}
                </View>
            )}

            {ride.type === 'owner' && ride.riderBookings && ride.riderBookings.length > 0 ? (
                <View style={styles.bookingsSection}>
                    <Text style={styles.bookingsTitle}>
                        Booked riders ({ride.riderBookings.length})
                    </Text>
                    {ride.riderBookings.map((booking) => (
                        <View key={booking.bookingId} style={styles.riderBookingRow}>
                            <View style={styles.riderBookingInfo}>
                                <Text style={styles.riderName}>{booking.riderName}</Text>
                                <Text style={styles.riderMeta}>
                                    {booking.seats} seat{booking.seats === 1 ? '' : 's'} • ₹{booking.price}
                                </Text>
                            </View>
                            {ride.status === 'confirmed' ? (
                                <TouchableOpacity
                                    style={[
                                        styles.ownerCancelButton,
                                        cancellingId === booking.bookingId && styles.cancelButtonDisabled,
                                    ]}
                                    onPress={() => handleCancelBooking(ride, booking.bookingId)}
                                    disabled={cancellingId === booking.bookingId}
                                >
                                    {cancellingId === booking.bookingId ? (
                                        <ActivityIndicator color="#d32f2f" size="small" />
                                    ) : (
                                        <Text style={styles.cancelButtonText}>Cancel</Text>
                                    )}
                                </TouchableOpacity>
                            ) : null}
                        </View>
                    ))}
                </View>
            ) : null}

            {ride.type === 'owner' && ride.canEdit && ride.rideId ? (
                <TouchableOpacity
                    style={styles.editButton}
                    onPress={() =>
                        router.push({
                            pathname: '/offer',
                            params: { rideId: ride.rideId },
                        })
                    }
                >
                    <Text style={styles.editButtonText}>Edit ride ✏️</Text>
                </TouchableOpacity>
            ) : ride.type === 'owner' && ride.status === 'confirmed' && !ride.riderBookings?.length ? (
                <Text style={styles.editHint}>No bookings yet — you can still edit this ride</Text>
            ) : ride.type === 'owner' && ride.status === 'confirmed' && ride.riderBookings?.length ? (
                <Text style={styles.editHint}>Bookings exist — editing is locked</Text>
            ) : null}
        </View>
    );

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton} hitSlop={12}>
                    <Text style={styles.backText}>← Back</Text>
                </TouchableOpacity>
                <View style={styles.headerRow}>
                    <View style={styles.headerText}>
                        <Text style={styles.title}>My Rides</Text>
                        <Text style={styles.subtitle}>
                            {userName ? `Hi ${userName} • your bookings and offered rides` : 'Your bookings and offered rides'}
                        </Text>
                    </View>
                    <NotificationBell />
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
    headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
    headerText: { flex: 1, paddingRight: 12 },
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
    statLabel: { fontSize: 12, color: '#666', marginTop: 4, textAlign: 'center', minWidth: 56 },
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
    actionRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
    viewButton: {
        backgroundColor: '#1a73e8',
        borderRadius: 10,
        padding: 12,
        alignItems: 'center',
        flex: 1,
    },
    viewButtonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
    cancelButton: {
        borderWidth: 1.5,
        borderColor: '#d32f2f',
        borderRadius: 10,
        padding: 12,
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 96,
        backgroundColor: '#fff',
    },
    ownerCancelButton: {
        borderWidth: 1.5,
        borderColor: '#d32f2f',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: '#fff',
        minWidth: 72,
        alignItems: 'center',
    },
    cancelButtonDisabled: { opacity: 0.6 },
    cancelButtonText: { color: '#d32f2f', fontWeight: '600', fontSize: 14 },
    bookingsSection: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#eee',
    },
    bookingsTitle: { fontSize: 14, fontWeight: '700', color: '#333', marginBottom: 10 },
    riderBookingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#f8f9fa',
        borderRadius: 10,
        padding: 12,
        marginBottom: 8,
    },
    riderBookingInfo: { flex: 1, paddingRight: 10 },
    riderName: { fontSize: 15, fontWeight: '600', color: '#333' },
    riderMeta: { fontSize: 12, color: '#666', marginTop: 2 },
    editButton: {
        borderWidth: 1.5,
        borderColor: '#1a73e8',
        borderRadius: 10,
        padding: 12,
        alignItems: 'center',
        marginTop: 12,
        backgroundColor: '#fff',
    },
    editButtonText: { color: '#1a73e8', fontWeight: '600', fontSize: 15 },
    editHint: { fontSize: 12, color: '#888', marginTop: 10, fontStyle: 'italic' },
});
