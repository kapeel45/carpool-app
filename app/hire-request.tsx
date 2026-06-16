import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Linking,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProfileNavButton from './components/ProfileNavButton';
import {
    acceptDriverHireRequest,
    cancelDriverHireRequest,
    formatHireConfirmationCode,
    getDisplayName,
    getDriverHireRequestById,
    normalizeHireConfirmationCode,
    normalizePhone,
    rejectDriverHireRequest,
} from './config/api';
import { formatHireTripDate, formatHireTripTime } from './config/driver-hire';
import { getSession } from './config/session';

export default function HireRequestScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const params = useLocalSearchParams<{ requestId?: string }>();
    const requestId =
        typeof params.requestId === 'string' ? params.requestId : params.requestId?.[0] || '';

    const [loading, setLoading] = useState(true);
    const [acting, setActing] = useState(false);
    const [viewerPhone, setViewerPhone] = useState('');
    const [confirmationCode, setConfirmationCode] = useState('');
    const [request, setRequest] = useState<Awaited<ReturnType<typeof getDriverHireRequestById>>>(null);

    useEffect(() => {
        const load = async () => {
            if (!requestId) {
                setLoading(false);
                return;
            }
            setLoading(true);
            try {
                const session = await getSession();
                setViewerPhone(session?.phone || '');
                const data = await getDriverHireRequestById(requestId);
                setRequest(data);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [requestId]);

    const isDriver = normalizePhone(viewerPhone) === normalizePhone(request?.driver_phone || '');
    const isClient = normalizePhone(viewerPhone) === normalizePhone(request?.client_phone || '');
    const status = request?.status || 'pending';
    const isPending = status === 'pending';
    const isAccepted = status === 'accepted';

    const handleAccept = async () => {
        const session = await getSession();
        if (!session?.phone) {
            Alert.alert('Login required', 'Please log in first.');
            return;
        }
        setActing(true);
        try {
            await acceptDriverHireRequest(requestId, session.phone, confirmationCode);
            Alert.alert('Accepted', 'The client was notified. They can now call or message you.', [
                { text: 'OK', onPress: () => router.back() },
            ]);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Could not accept request.';
            Alert.alert('Error', message);
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
        Alert.alert('Decline request?', 'The client will be notified.', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Decline',
                style: 'destructive',
                onPress: async () => {
                    setActing(true);
                    try {
                        await rejectDriverHireRequest(requestId, session.phone);
                        Alert.alert('Declined', 'The client was notified.', [
                            { text: 'OK', onPress: () => router.back() },
                        ]);
                    } catch (error: unknown) {
                        const message = error instanceof Error ? error.message : 'Could not decline request.';
                        Alert.alert('Error', message);
                    } finally {
                        setActing(false);
                    }
                },
            },
        ]);
    };

    const handleCancel = async () => {
        const session = await getSession();
        if (!session?.phone) {
            Alert.alert('Login required', 'Please log in first.');
            return;
        }
        Alert.alert('Cancel trip?', 'This hire will be cancelled and the other person notified.', [
            { text: 'Keep trip', style: 'cancel' },
            {
                text: 'Cancel trip',
                style: 'destructive',
                onPress: async () => {
                    setActing(true);
                    try {
                        await cancelDriverHireRequest(requestId, session.phone);
                        const refreshed = await getDriverHireRequestById(requestId);
                        setRequest(refreshed);
                        Alert.alert('Cancelled', 'The hire was cancelled and the other person notified.');
                    } catch (error: unknown) {
                        const message = error instanceof Error ? error.message : 'Could not cancel trip.';
                        Alert.alert('Error', message);
                    } finally {
                        setActing(false);
                    }
                },
            },
        ]);
    };

    const contactPhone = isDriver ? request?.client_phone : request?.driver_phone;
    const handleCall = () => {
        const digits = normalizePhone(contactPhone || '');
        if (digits.length === 10) Linking.openURL(`tel:+91${digits}`);
    };

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton} hitSlop={12}>
                    <Text style={styles.backText}>← Back</Text>
                </TouchableOpacity>
                <View style={styles.headerRow}>
                    <View style={styles.headerText}>
                        <Text style={styles.title}>Driver hire request</Text>
                        <Text style={styles.subtitle}>
                            {isDriver ? 'Review a client request' : 'Your hire request status'}
                        </Text>
                    </View>
                    <ProfileNavButton size={40} variant="light" />
                </View>
            </View>

            {loading ? (
                <ActivityIndicator size="large" color="#1a73e8" style={styles.loader} />
            ) : !request ? (
                <View style={styles.empty}>
                    <Text style={styles.emptyText}>Hire request not found.</Text>
                </View>
            ) : (
                <ScrollView contentContainerStyle={styles.content}>
                    <View style={styles.card}>
                        <Text style={styles.statusBadge}>
                            {status === 'accepted'
                                ? '✅ Accepted'
                                : status === 'rejected'
                                  ? '❌ Declined'
                                  : status === 'cancelled'
                                    ? 'Cancelled'
                                    : '⏳ Pending'}
                        </Text>

                        <Text style={styles.label}>Start date</Text>
                        <Text style={styles.value}>{formatHireTripDate(request.trip_date)}</Text>

                        {request.start_time ? (
                            <>
                                <Text style={styles.label}>Start time</Text>
                                <Text style={styles.value}>{formatHireTripTime(request.start_time)}</Text>
                            </>
                        ) : null}

                        <Text style={styles.label}>Start ride location</Text>
                        <Text style={styles.value}>{request.start_location || 'Not provided'}</Text>

                        <Text style={styles.label}>End ride location</Text>
                        <Text style={styles.value}>{request.end_location || 'Not provided'}</Text>

                        <Text style={styles.label}>Duration</Text>
                        <Text style={styles.value}>{Number(request.hours) || 8} hours</Text>

                        <Text style={styles.label}>Estimated fare</Text>
                        <Text style={styles.value}>
                            ₹{Number(request.estimated_total || 0).toLocaleString('en-IN')}
                        </Text>

                        {request.route_note ? (
                            <>
                                <Text style={styles.label}>Route / notes</Text>
                                <Text style={styles.value}>{request.route_note}</Text>
                            </>
                        ) : null}

                        <Text style={styles.label}>Client</Text>
                        <Text style={styles.value}>
                            {getDisplayName(request.client_name || '', request.client_phone)}
                        </Text>

                        <Text style={styles.label}>Driver</Text>
                        <Text style={styles.value}>
                            {getDisplayName(request.driver_name || '', request.driver_phone)}
                        </Text>

                        <Text style={styles.label}>Confirmation code</Text>
                        <Text style={styles.value}>{formatHireConfirmationCode(request.confirmation_code)}</Text>
                        {isDriver && isPending ? (
                            <Text style={styles.codeHelper}>
                                Enter this 4-digit code below to accept.
                            </Text>
                        ) : null}
                    </View>

                    {isDriver && isPending ? (
                        <View style={styles.actions}>
                            <Text style={styles.codeLabel}>Enter client's 4-digit code to accept</Text>
                            <TextInput
                                style={styles.codeInput}
                                value={confirmationCode}
                                onChangeText={(value) => setConfirmationCode(normalizeHireConfirmationCode(value))}
                                keyboardType="number-pad"
                                maxLength={4}
                                placeholder="4-digit code"
                            />
                            <TouchableOpacity
                                style={[styles.acceptButton, acting && styles.disabled]}
                                onPress={handleAccept}
                                disabled={acting}
                            >
                                <Text style={styles.acceptText}>{acting ? 'Saving…' : 'Accept request'}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.rejectButton, acting && styles.disabled]}
                                onPress={handleReject}
                                disabled={acting}
                            >
                                <Text style={styles.rejectText}>Decline</Text>
                            </TouchableOpacity>
                        </View>
                    ) : null}

                    {isAccepted && (isDriver || isClient) ? (
                        <>
                            <TouchableOpacity style={styles.callButton} onPress={handleCall}>
                                <Text style={styles.callText}>Call</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.cancelTripButton, acting && styles.disabled]}
                                onPress={handleCancel}
                                disabled={acting}
                            >
                                <Text style={styles.cancelTripText}>
                                    {acting ? 'Cancelling…' : 'Cancel trip'}
                                </Text>
                            </TouchableOpacity>
                        </>
                    ) : null}

                    {isClient && isPending ? (
                        <>
                            <Text style={styles.hint}>
                                Waiting for the driver to accept. Call and message unlock after acceptance.
                            </Text>
                            <TouchableOpacity
                                style={[styles.cancelTripButton, acting && styles.disabled]}
                                onPress={handleCancel}
                                disabled={acting}
                            >
                                <Text style={styles.cancelTripText}>
                                    {acting ? 'Cancelling…' : 'Cancel request'}
                                </Text>
                            </TouchableOpacity>
                        </>
                    ) : null}
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    header: { backgroundColor: '#1a73e8', paddingHorizontal: 20, paddingBottom: 20 },
    backButton: { marginBottom: 8 },
    backText: { color: '#fff', fontSize: 16, fontWeight: '600' },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    headerText: { flex: 1, paddingRight: 12 },
    title: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
    subtitle: { color: '#fff', fontSize: 14, opacity: 0.9, marginTop: 4 },
    loader: { marginTop: 40 },
    empty: { padding: 24, alignItems: 'center' },
    emptyText: { fontSize: 16, color: '#666' },
    content: { padding: 16, paddingBottom: 32 },
    card: {
        backgroundColor: '#fff',
        borderRadius: 14,
        padding: 18,
        marginBottom: 16,
    },
    statusBadge: { fontSize: 16, fontWeight: '700', marginBottom: 16 },
    label: { fontSize: 12, fontWeight: '700', color: '#888', marginTop: 12, textTransform: 'uppercase' },
    value: { fontSize: 16, color: '#333', marginTop: 4, lineHeight: 22 },
    codeHelper: { fontSize: 12, color: '#666', marginTop: 4 },
    actions: { gap: 10 },
    codeLabel: { fontSize: 13, fontWeight: '600', color: '#555' },
    codeInput: {
        backgroundColor: '#fff',
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 18,
        color: '#333',
        borderWidth: 1,
        borderColor: '#dfe1e5',
        letterSpacing: 5,
        fontWeight: '700',
    },
    acceptButton: {
        backgroundColor: '#1a73e8',
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
    },
    acceptText: { color: '#fff', fontWeight: '700', fontSize: 16 },
    rejectButton: {
        backgroundColor: '#fff',
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#e57373',
    },
    rejectText: { color: '#c62828', fontWeight: '700', fontSize: 16 },
    callButton: {
        backgroundColor: '#e8f0fe',
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
        marginTop: 8,
    },
    callText: { color: '#1a73e8', fontWeight: '700', fontSize: 16 },
    cancelTripButton: {
        backgroundColor: '#fff',
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
        marginTop: 10,
        borderWidth: 1,
        borderColor: '#e57373',
    },
    cancelTripText: { color: '#c62828', fontWeight: '700', fontSize: 16 },
    disabled: { opacity: 0.6 },
    hint: { fontSize: 14, color: '#666', textAlign: 'center', marginTop: 16, lineHeight: 20 },
});
