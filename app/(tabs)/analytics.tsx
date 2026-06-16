import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProfileNavButton from '@/app/components/ProfileNavButton';
import RideOwnerRow from '@/app/components/RideOwnerRow';
import {
    getClientDriverHireRequests,
    getDriverHireRequestsForDriver,
    parseRideDepartureTime,
    getUserBookings,
    getUserOfferedRides,
    resolveOwnerInfo,
} from '@/app/config/api';
import { formatHireTripDate } from '@/app/config/driver-hire';
import { getSession, refreshSessionFromServer } from '@/app/config/session';
import { useUserStats } from '@/hooks/use-user-stats';
import type { DriverHireRequest, OwnerInfo } from '@/app/config/api';

const formatRideDateTime = (value?: string | null) => {
    const ts = parseRideDepartureTime(value);
    if (Number.isNaN(ts)) return 'Time not available';
    return new Date(ts).toLocaleString('en-IN', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });
};

export default function AnalyticsScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { stats, loading, error: statsError, refresh } = useUserStats();
    const [bookings, setBookings] = useState<any[]>([]);
    const [offeredRides, setOfferedRides] = useState<any[]>([]);
    const [myPhotoUrl, setMyPhotoUrl] = useState<string | null>(null);
    const [myName, setMyName] = useState('');
    const [bookingOwnerInfo, setBookingOwnerInfo] = useState<Record<string, OwnerInfo>>({});
    const [hireRequestsSent, setHireRequestsSent] = useState<DriverHireRequest[]>([]);
    const [hireRequestsReceived, setHireRequestsReceived] = useState<DriverHireRequest[]>([]);
    const [activePanel, setActivePanel] = useState<'carpool' | 'hire'>('carpool');
    const [activityLoading, setActivityLoading] = useState(true);
    const [activityError, setActivityError] = useState<string | null>(null);

    useFocusEffect(
        useCallback(() => {
            const loadActivity = async () => {
                setActivityLoading(true);
                setActivityError(null);
                try {
                    const session = await refreshSessionFromServer();
                    if (session?.phone) {
                        setMyName(session.name?.trim() || '');
                        setMyPhotoUrl(session.profilePhotoUrl || null);
                        const [userBookings, userRides, sentRequests, receivedRequests] = await Promise.all([
                            getUserBookings(session.phone),
                            getUserOfferedRides(session.phone),
                            getClientDriverHireRequests(session.phone),
                            getDriverHireRequestsForDriver(session.phone),
                        ]);
                        setBookings(userBookings);
                        setOfferedRides(userRides);
                        setHireRequestsSent(sentRequests);
                        setHireRequestsReceived(receivedRequests);

                        const ownerMap: Record<string, OwnerInfo> = {};
                        for (const booking of userBookings) {
                            const rideRef = booking.ride_id;
                            const ride =
                                typeof rideRef === 'object' && rideRef !== null ? rideRef : null;
                            const driverRaw = ride?.driver_name || '';
                            if (driverRaw && !ownerMap[driverRaw]) {
                                ownerMap[driverRaw] = await resolveOwnerInfo(driverRaw);
                            }
                        }
                        setBookingOwnerInfo(ownerMap);
                    } else {
                    setBookings([]);
                    setOfferedRides([]);
                    setHireRequestsSent([]);
                    setHireRequestsReceived([]);
                    setMyPhotoUrl(null);
                    setMyName('');
                    setBookingOwnerInfo({});
                    }
                } catch (err) {
                    console.error('Failed to load analytics activity:', err);
                    setBookings([]);
                    setOfferedRides([]);
                    setHireRequestsSent([]);
                    setHireRequestsReceived([]);
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
        refreshSessionFromServer().then(async (refreshedSession) => {
            const session = refreshedSession || (await getSession());
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
                    const [sentReqs, recvReqs] = await Promise.all([
                        getClientDriverHireRequests(session.phone),
                        getDriverHireRequestsForDriver(session.phone),
                    ]);
                    setHireRequestsSent(sentReqs);
                    setHireRequestsReceived(recvReqs);
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
                <View style={styles.headerRow}>
                    <View style={styles.headerText}>
                        <Text style={styles.title}>Analytics</Text>
                        <Text style={styles.subtitle}>Your carpool activity overview</Text>
                    </View>
                    <ProfileNavButton size={40} variant="light" />
                </View>
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

                {/* Panel tabs */}
                <View style={styles.panelRow}>
                    <TouchableOpacity
                        style={[styles.panelTab, activePanel === 'carpool' && styles.panelTabActive]}
                        onPress={() => setActivePanel('carpool')}
                    >
                        <Text style={[styles.panelTabText, activePanel === 'carpool' && styles.panelTabTextActive]}>
                            Carpool history
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.panelTab, activePanel === 'hire' && styles.panelTabActive]}
                        onPress={() => setActivePanel('hire')}
                    >
                        <Text style={[styles.panelTabText, activePanel === 'hire' && styles.panelTabTextActive]}>
                            Driver hire
                        </Text>
                    </TouchableOpacity>
                </View>

                {activePanel === 'carpool' ? (
                    <>
                        <Text style={styles.sectionTitle}>Rides booked by you</Text>
                        {activityLoading ? (
                            <ActivityIndicator size="small" color="#1a73e8" style={styles.sectionLoader} />
                        ) : bookings.length === 0 ? (
                            <View style={styles.emptyCard}>
                                <Text style={styles.emptyText}>No bookings yet. Find a ride to get started.</Text>
                            </View>
                        ) : (
                            bookings.map((booking) => {
                                const rideRef = booking.ride_id;
                                const ride = typeof rideRef === 'object' && rideRef !== null ? rideRef : null;
                                const driverRaw = ride?.driver_name || '';
                                const owner = bookingOwnerInfo[driverRaw] || { name: 'Ride owner', photoUrl: null };
                                const route =
                                    ride?.from_location && ride?.to_location
                                        ? `${ride.from_location} → ${ride.to_location}`
                                        : undefined;
                                return (
                                    <View key={booking.id} style={styles.card}>
                                        <RideOwnerRow
                                            name={owner.name}
                                            photoUrl={owner.photoUrl}
                                            subtitle={undefined}
                                            size={36}
                                        />
                                        <View style={styles.pointBox}>
                                            <Text style={styles.pointLabel}>START POINT</Text>
                                            <Text style={styles.pointValue}>
                                                {ride?.from_location || 'Not available'}
                                            </Text>
                                        </View>
                                        <View style={styles.pointBox}>
                                            <Text style={styles.pointLabel}>DESTINATION</Text>
                                            <Text style={styles.pointValue}>
                                                {ride?.to_location || 'Not available'}
                                            </Text>
                                        </View>
                                        <Text style={styles.cardMeta}>
                                            ₹{booking.total_price} • {booking.seats_booked || 1} seat(s)
                                        </Text>
                                        <Text style={styles.cardDateTime}>
                                            {formatRideDateTime(ride?.departure_time)}
                                        </Text>
                                        <Text style={styles.cardSub}>{booking.payment_status || 'pending'}</Text>
                                    </View>
                                );
                            })
                        )}

                        <Text style={styles.sectionTitle}>Rides offered by you</Text>
                        {activityLoading ? (
                            <ActivityIndicator size="small" color="#1a73e8" style={styles.sectionLoader} />
                        ) : offeredRides.length === 0 ? (
                            <View style={styles.emptyCard}>
                                <Text style={styles.emptyText}>No rides offered yet. Publish a ride from home.</Text>
                            </View>
                        ) : (
                            offeredRides.map((ride) => (
                                <View key={ride.id} style={styles.card}>
                                    <RideOwnerRow
                                        name={myName || 'You'}
                                        photoUrl={myPhotoUrl}
                                        subtitle={undefined}
                                        size={36}
                                    />
                                    <View style={styles.pointBox}>
                                        <Text style={styles.pointLabel}>START POINT</Text>
                                        <Text style={styles.pointValue}>
                                            {ride.from_location || 'Not available'}
                                        </Text>
                                    </View>
                                    <View style={styles.pointBox}>
                                        <Text style={styles.pointLabel}>DESTINATION</Text>
                                        <Text style={styles.pointValue}>
                                            {ride.to_location || 'Not available'}
                                        </Text>
                                    </View>
                                    <Text style={styles.cardMeta}>
                                        ₹{ride.price_per_seat}/seat • {ride.available_seats} seats
                                    </Text>
                                    <Text style={styles.cardDateTime}>
                                        {formatRideDateTime(ride.departure_time)}
                                    </Text>
                                    <Text style={styles.cardSub}>{ride.status || 'active'}</Text>
                                </View>
                            ))
                        )}
                    </>
                ) : (
                    <>
                        <Text style={styles.sectionTitle}>Hire requests you sent</Text>
                        {activityLoading ? (
                            <ActivityIndicator size="small" color="#1a73e8" style={styles.sectionLoader} />
                        ) : hireRequestsSent.length === 0 ? (
                            <View style={styles.emptyCard}>
                                <Text style={styles.emptyText}>No hire requests sent yet.</Text>
                            </View>
                        ) : (
                            hireRequestsSent.map((req) => (
                                <TouchableOpacity
                                    key={String(req.id)}
                                    style={styles.card}
                                    onPress={() =>
                                        router.push({
                                            pathname: '/hire-request',
                                            params: { requestId: String(req.id) },
                                        })
                                    }
                                >
                                    <Text style={styles.hireCardDriver}>
                                        Driver: {req.driver_name || req.driver_phone}
                                    </Text>
                                    <Text style={styles.cardMeta}>
                                        {formatHireTripDate(req.trip_date)} · {Number(req.hours) || 8}h · est. ₹
                                        {Number(req.estimated_total || 0).toLocaleString('en-IN')}
                                    </Text>
                                    <Text style={[styles.cardSub, req.status === 'accepted' && styles.statusAccepted, req.status === 'rejected' && styles.statusRejected]}>
                                        {req.status || 'pending'}
                                    </Text>
                                </TouchableOpacity>
                            ))
                        )}

                        <Text style={styles.sectionTitle}>Hire requests you received</Text>
                        {activityLoading ? (
                            <ActivityIndicator size="small" color="#1a73e8" style={styles.sectionLoader} />
                        ) : hireRequestsReceived.length === 0 ? (
                            <View style={styles.emptyCard}>
                                <Text style={styles.emptyText}>No hire requests received yet.</Text>
                            </View>
                        ) : (
                            hireRequestsReceived.map((req) => (
                                <TouchableOpacity
                                    key={String(req.id)}
                                    style={styles.card}
                                    onPress={() =>
                                        router.push({
                                            pathname: '/hire-request',
                                            params: { requestId: String(req.id) },
                                        })
                                    }
                                >
                                    <Text style={styles.hireCardDriver}>
                                        Client: {req.client_name || req.client_phone}
                                    </Text>
                                    <Text style={styles.cardMeta}>
                                        {formatHireTripDate(req.trip_date)} · {Number(req.hours) || 8}h · est. ₹
                                        {Number(req.estimated_total || 0).toLocaleString('en-IN')}
                                    </Text>
                                    <Text style={[styles.cardSub, req.status === 'accepted' && styles.statusAccepted, req.status === 'rejected' && styles.statusRejected]}>
                                        {req.status || 'pending'}
                                    </Text>
                                </TouchableOpacity>
                            ))
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
    headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
    headerText: { flex: 1, paddingRight: 12 },
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
    pointBox: {
        backgroundColor: '#f8fafc',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 8,
        marginTop: 8,
        borderWidth: 1,
        borderColor: '#e5edf7',
    },
    pointLabel: { fontSize: 10, color: '#6b7280', fontWeight: '700', letterSpacing: 0.4 },
    pointValue: { fontSize: 13, color: '#1f2937', marginTop: 4 },
    cardMeta: { fontSize: 14, color: '#1a73e8', fontWeight: '600' },
    cardDateTime: { fontSize: 12, color: '#555', marginTop: 4 },
    cardSub: { fontSize: 12, color: '#666', marginTop: 4, textTransform: 'capitalize' },
    panelRow: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        borderRadius: 12,
        marginBottom: 16,
        overflow: 'hidden',
        elevation: 1,
    },
    panelTab: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
    },
    panelTabActive: {
        backgroundColor: '#1a73e8',
    },
    panelTabText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#666',
    },
    panelTabTextActive: {
        color: '#fff',
    },
    hireCardDriver: { fontSize: 15, fontWeight: '600', color: '#333', marginBottom: 4 },
    statusAccepted: { color: '#2e7d32' },
    statusRejected: { color: '#c62828' },
});
