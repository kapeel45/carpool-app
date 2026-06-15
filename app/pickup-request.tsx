import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Linking,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProfileNavButton from './components/ProfileNavButton';
import {
    acceptPickupRequest,
    getPickupRequestById,
    getRideById,
    rejectPickupRequest,
    resolveDisplayName,
} from './config/api';
import { getSession } from './config/session';

export default function PickupRequestScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const params = useLocalSearchParams<{ requestId?: string }>();
    const requestId =
        typeof params.requestId === 'string' ? params.requestId : params.requestId?.[0] || '';

    const [loading, setLoading] = useState(true);
    const [acting, setActing] = useState(false);
    const [request, setRequest] = useState<Awaited<ReturnType<typeof getPickupRequestById>>>(null);
    const [rideRoute, setRideRoute] = useState('');

    useEffect(() => {
        const load = async () => {
            if (!requestId) {
                setLoading(false);
                return;
            }
            setLoading(true);
            try {
                const data = await getPickupRequestById(requestId);
                setRequest(data);
                if (data?.ride_id) {
                    const ride = await getRideById(String(data.ride_id));
                    if (ride) {
                        setRideRoute(`${ride.from_location} → ${ride.to_location}`);
                    }
                }
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [requestId]);

    const handleAccept = async () => {
        const session = await getSession();
        if (!session?.phone) {
            Alert.alert('Login required', 'Please log in first.');
            return;
        }
        setActing(true);
        try {
            await acceptPickupRequest(requestId, session.phone);
            Alert.alert('Accepted', 'The rider was notified and the ride is now booked. They can pay from their booking.', [
                { text: 'OK', onPress: () => router.back() },
            ]);
        } catch (error: any) {
            Alert.alert('Error', error?.message || 'Could not accept request.');
        } finally {
            setActing(false);
        }
    };

    const handleReject = async () => {
        const session = await getSession();
        if (!session?.phone) {
            Alert.alert('Login required', 'Please log in first.');
            return;
        }
        Alert.alert('Decline pickup?', 'The rider will be notified that this pickup is not possible.', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Decline',
                style: 'destructive',
                onPress: async () => {
                    setActing(true);
                    try {
                        await rejectPickupRequest(requestId, session.phone);
                        Alert.alert('Declined', 'The rider was notified.', [
                            { text: 'OK', onPress: () => router.back() },
                        ]);
                    } catch (error: any) {
                        Alert.alert('Error', error?.message || 'Could not decline request.');
                    } finally {
                        setActing(false);
                    }
                },
            },
        ]);
    };

    const status = request?.status || 'pending';
    const isPending = status === 'pending';

    const handleCallRider = () => {
        const digits = String(request?.rider_phone || '').replace(/\D/g, '').slice(-10);
        if (digits.length === 10) {
            Linking.openURL(`tel:${digits}`);
        } else {
            Alert.alert('Unavailable', 'Rider phone number not available.');
        }
    };

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton} hitSlop={12}>
                    <Text style={styles.backText}>← Back</Text>
                </TouchableOpacity>
                <View style={styles.headerRow}>
                    <View style={styles.headerText}>
                        <Text style={styles.title}>Pickup request</Text>
                        <Text style={styles.subtitle}>Nearby pickup request from a rider</Text>
                    </View>
                    <ProfileNavButton size={40} variant="light" />
                </View>
            </View>

            {loading ? (
                <ActivityIndicator size="large" color="#1a73e8" style={styles.loader} />
            ) : !request ? (
                <View style={styles.empty}>
                    <Text style={styles.emptyText}>Pickup request not found.</Text>
                </View>
            ) : (
                <ScrollView contentContainerStyle={styles.content}>
                    <View style={styles.card}>
                        <Text style={styles.statusBadge}>
                            {status === 'accepted'
                                ? '✅ Accepted'
                                : status === 'rejected'
                                  ? '❌ Declined'
                                  : '⏳ Pending'}
                        </Text>
                        <Text style={styles.label}>Rider</Text>
                        <Text style={styles.value}>
                            {request.rider_name ||
                                resolveDisplayName(request.rider_phone) ||
                                request.rider_phone}
                        </Text>

                        <Text style={styles.label}>Their pickup</Text>
                        <Text style={styles.value}>{request.rider_pickup || '—'}</Text>

                        {rideRoute ? (
                            <>
                                <Text style={styles.label}>Your ride</Text>
                                <Text style={styles.value}>{rideRoute}</Text>
                            </>
                        ) : null}

                        {request.pickup_distance_miles != null ? (
                            <Text style={styles.meta}>
                                Rider is about {Number(request.pickup_distance_miles).toFixed(1)} mi from
                                your route start
                            </Text>
                        ) : null}
                    </View>

                    {isPending ? (
                        <View style={styles.actions}>
                            <TouchableOpacity style={styles.callButton} onPress={handleCallRider}>
                                <Text style={styles.callButtonText}>📞 Call rider</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.acceptButton, acting && styles.buttonDisabled]}
                                onPress={handleAccept}
                                disabled={acting}
                            >
                                {acting ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <Text style={styles.acceptText}>Accept pickup</Text>
                                )}
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.rejectButton, acting && styles.buttonDisabled]}
                                onPress={handleReject}
                                disabled={acting}
                            >
                                <Text style={styles.rejectText}>Decline</Text>
                            </TouchableOpacity>
                        </View>
                    ) : null}
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    header: {
        backgroundColor: '#1a73e8',
        paddingHorizontal: 24,
        paddingBottom: 24,
    },
    backButton: { marginBottom: 12 },
    backText: { color: '#fff', fontSize: 16, fontWeight: '600' },
    headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
    headerText: { flex: 1 },
    title: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
    subtitle: { color: '#fff', opacity: 0.9, marginTop: 4 },
    loader: { marginTop: 40 },
    empty: { padding: 24, alignItems: 'center' },
    emptyText: { color: '#666' },
    content: { padding: 20, paddingBottom: 40 },
    card: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
    },
    statusBadge: {
        alignSelf: 'flex-start',
        backgroundColor: '#e8f0fe',
        color: '#1a73e8',
        fontWeight: '700',
        fontSize: 13,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        overflow: 'hidden',
        marginBottom: 16,
    },
    label: { fontSize: 12, color: '#666', marginTop: 12, marginBottom: 4 },
    value: { fontSize: 15, color: '#333', lineHeight: 22 },
    meta: { fontSize: 13, color: '#666', marginTop: 16 },
    actions: { gap: 12 },
    callButton: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#1a73e8',
    },
    callButtonText: { color: '#1a73e8', fontWeight: '700', fontSize: 16 },
    acceptButton: {
        backgroundColor: '#34a853',
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
    },
    acceptText: { color: '#fff', fontWeight: '700', fontSize: 16 },
    rejectButton: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#ddd',
    },
    rejectText: { color: '#d32f2f', fontWeight: '600', fontSize: 16 },
    buttonDisabled: { opacity: 0.7 },
});
