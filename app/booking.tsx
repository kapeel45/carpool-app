import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RideMap from './components/RideMap';
import { createBooking, getBookingById, getRideById, normalizePhone, resolveDisplayName, resolveRelationId } from './config/api';
import { getSession } from './config/session';

type BookingDetails = {
    from: string;
    to: string;
    time: string;
    price: string;
    driver: string;
    driverPhone: string;
    seats: string;
    paymentStatus: string;
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

const paramAsString = (value: string | string[] | undefined) => {
    if (Array.isArray(value)) return value[0] || '';
    return value || '';
};

const buildDetailsFromRide = async (ride: any, priceOverride?: string, paymentStatus = 'pending') => {
    const driverRaw = ride?.driver_name || '';
    const driverName = await resolveDisplayName(driverRaw, 'Owner');
    return {
        from: ride?.from_location || 'Pickup',
        to: ride?.to_location || 'Destination',
        time: ride?.departure_time || '',
        price: priceOverride || String(ride?.price_per_seat || ''),
        driver: driverName,
        driverPhone: normalizePhone(driverRaw) || driverRaw,
        seats: String(ride?.available_seats || 1),
        paymentStatus,
    };
};

export default function BookingScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const params = useLocalSearchParams<{
        from?: string;
        to?: string;
        time?: string;
        price?: string;
        driver?: string;
        driverPhone?: string;
        seats?: string;
        rideId?: string;
        bookingId?: string;
        viewOnly?: string;
    }>();

    const viewOnly = paramAsString(params.viewOnly) === 'true';
    const bookingId = paramAsString(params.bookingId);
    const rideId = paramAsString(params.rideId);

    const [details, setDetails] = useState<BookingDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [bookingDone, setBookingDone] = useState(viewOnly);

    useEffect(() => {
        let cancelled = false;

        const loadDetails = async () => {
            setLoading(true);
            try {
                if (bookingId) {
                    const booking = await getBookingById(bookingId);
                    const rideRef = booking?.ride_id;
                    const ride =
                        typeof rideRef === 'object' && rideRef !== null
                            ? rideRef
                            : await getRideById(resolveRelationId(rideRef) || '');
                    const nextDetails = await buildDetailsFromRide(
                        ride,
                        String(ride?.price_per_seat || booking?.total_price || ''),
                        booking?.payment_status || 'pending'
                    );
                    if (!cancelled) setDetails(nextDetails);
                    return;
                }

                if (rideId) {
                    const ride = await getRideById(rideId);
                    const nextDetails = await buildDetailsFromRide(
                        ride,
                        paramAsString(params.price) || undefined
                    );
                    if (!cancelled) setDetails(nextDetails);
                    return;
                }

                const driverRaw = paramAsString(params.driverPhone) || paramAsString(params.driver);
                const driverName = driverRaw
                    ? await resolveDisplayName(driverRaw, paramAsString(params.driver) || 'Owner')
                    : paramAsString(params.driver) || 'Owner';

                if (!cancelled) {
                    setDetails({
                        from: paramAsString(params.from) || 'Pickup',
                        to: paramAsString(params.to) || 'Destination',
                        time: paramAsString(params.time),
                        price: paramAsString(params.price),
                        driver: driverName,
                        driverPhone: normalizePhone(driverRaw) || driverRaw,
                        seats: paramAsString(params.seats) || '1',
                        paymentStatus: 'pending',
                    });
                }
            } catch (error) {
                console.error('Failed to load booking details:', error);
                if (!cancelled) {
                    Alert.alert('Error', 'Could not load booking details.');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        loadDetails();
        return () => {
            cancelled = true;
        };
    }, [bookingId, rideId]);

    useEffect(() => {
        if (viewOnly || !rideId || bookingDone) return;

        const saveBooking = async () => {
            try {
                const session = await getSession();
                await createBooking({
                    ride_id: rideId,
                    rider_name: session?.name || session?.phone,
                    rider_phone: session?.phone,
                    seats_booked: 1,
                    total_price: parseInt(paramAsString(params.price), 10),
                    payment_status: 'pending',
                });
                setBookingDone(true);
            } catch (error) {
                console.error('Booking save error:', error);
            }
        };
        saveBooking();
    }, [viewOnly, rideId, bookingDone]);

    const handleCancel = () => {
        Alert.alert(
            'Cancel Booking?',
            'Are you sure you want to cancel this booking?',
            [
                { text: 'No, Keep It', style: 'cancel' },
                {
                    text: 'Yes, Cancel',
                    style: 'destructive',
                    onPress: () => {
                        Alert.alert('Cancelled', 'Your booking has been cancelled.', [
                            { text: 'OK', onPress: () => router.replace('/') },
                        ]);
                    },
                },
            ]
        );
    };

    const handleCall = () => {
        const phone = details?.driverPhone || '';
        const digits = phone.replace(/\D/g, '').slice(-10);
        if (digits.length === 10) {
            Linking.openURL(`tel:${digits}`);
        } else {
            Alert.alert('Unavailable', 'Ride owner phone not available.');
        }
    };

    const displayTime = details?.time ? formatRideTime(details.time) : 'Time TBD';
    const paymentStatusLabel =
        details?.paymentStatus === 'paid'
            ? 'Paid'
            : details?.paymentStatus === 'pending'
              ? 'Pending'
              : details?.paymentStatus || 'Pending';

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton} hitSlop={12}>
                    <Text style={styles.backText}>← Back</Text>
                </TouchableOpacity>
                <View style={styles.headerText}>
                    <Text style={styles.title}>Booking Details</Text>
                    <Text style={styles.subtitle}>Your confirmed carpool trip</Text>
                </View>
            </View>

            {loading ? (
                <ActivityIndicator size="large" color="#1a73e8" style={styles.loader} />
            ) : (
                <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.mapCard}>
                        <RideMap
                            fromLocation={details?.from || ''}
                            toLocation={details?.to || ''}
                            height={180}
                        />
                    </View>

                    <View style={styles.successBanner}>
                        <Text style={styles.successIcon}>✅</Text>
                        <Text style={styles.successTitle}>Ride Booked!</Text>
                        <Text style={styles.successSub}>Your seat is confirmed</Text>
                    </View>

                    <View style={styles.card}>
                        <Text style={styles.sectionTitle}>Trip Details</Text>
                        <View style={styles.row}>
                            <View style={styles.dotGreen} />
                            <View style={styles.rowContent}>
                                <Text style={styles.rowLabel}>Pickup</Text>
                                <Text style={styles.rowValue}>{details?.from || '—'}</Text>
                            </View>
                        </View>
                        <View style={styles.divider} />
                        <View style={styles.row}>
                            <View style={styles.dotRed} />
                            <View style={styles.rowContent}>
                                <Text style={styles.rowLabel}>Drop</Text>
                                <Text style={styles.rowValue}>{details?.to || '—'}</Text>
                            </View>
                        </View>
                        <View style={styles.divider} />
                        <View style={styles.row}>
                            <Text style={styles.rowEmoji}>🕐</Text>
                            <View style={styles.rowContent}>
                                <Text style={styles.rowLabel}>Departure</Text>
                                <Text style={styles.rowValue}>{displayTime}</Text>
                            </View>
                        </View>
                    </View>

                    <View style={styles.card}>
                        <Text style={styles.sectionTitle}>Ride Owner</Text>
                        <View style={styles.driverRow}>
                            <View style={styles.avatar}>
                                <Text style={styles.avatarText}>
                                    {details?.driver ? details.driver[0].toUpperCase() : 'O'}
                                </Text>
                            </View>
                            <View style={styles.driverInfo}>
                                <Text style={styles.driverName}>{details?.driver || 'Owner'}</Text>
                                <Text style={styles.driverMeta}>💺 {details?.seats || '1'} seats available</Text>
                                {details?.driverPhone ? (
                                    <Text style={styles.driverPhone}>📱 +91 {details.driverPhone}</Text>
                                ) : null}
                            </View>
                        </View>
                        <TouchableOpacity style={styles.callButton} onPress={handleCall}>
                            <Text style={styles.callText}>📞 Call Owner</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.card}>
                        <Text style={styles.sectionTitle}>Payment Details</Text>
                        <View style={styles.paymentRow}>
                            <Text style={styles.paymentLabel}>Price per seat</Text>
                            <Text style={styles.paymentPrice}>₹{details?.price || '0'}</Text>
                        </View>
                        <View style={styles.divider} />
                        <View style={styles.paymentRow}>
                            <Text style={styles.paymentLabel}>Payment Status</Text>
                            <Text style={styles.paymentStatus}>{paymentStatusLabel}</Text>
                        </View>
                    </View>

                    <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
                        <Text style={styles.cancelButtonText}>Cancel Booking</Text>
                    </TouchableOpacity>
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    scroll: { flex: 1 },
    scrollContent: { padding: 20, paddingBottom: 32 },
    loader: { marginTop: 40 },
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
    mapCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        overflow: 'hidden',
        marginBottom: 16,
        elevation: 2,
    },
    successBanner: {
        backgroundColor: '#e8f5e9',
        padding: 20,
        alignItems: 'center',
        borderRadius: 16,
        marginBottom: 16,
    },
    successIcon: { fontSize: 32, marginBottom: 6 },
    successTitle: { fontSize: 18, fontWeight: 'bold', color: '#2e7d32' },
    successSub: { fontSize: 14, color: '#666', marginTop: 4 },
    card: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        elevation: 2,
    },
    sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 16 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    rowContent: { flex: 1 },
    rowEmoji: { fontSize: 16, width: 10, textAlign: 'center' },
    dotGreen: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#34a853' },
    dotRed: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ea4335' },
    rowLabel: { fontSize: 12, color: '#666' },
    rowValue: { fontSize: 15, fontWeight: '600', color: '#333', marginTop: 2 },
    divider: { height: 1, backgroundColor: '#eee', marginVertical: 12 },
    driverRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#f0f5ff',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#1a73e8',
    },
    avatarText: { fontSize: 18, fontWeight: 'bold', color: '#1a73e8' },
    driverInfo: { flex: 1 },
    driverName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
    driverMeta: { fontSize: 12, color: '#666', marginTop: 4 },
    driverPhone: { fontSize: 13, color: '#1a73e8', marginTop: 4, fontWeight: '600' },
    callButton: {
        backgroundColor: '#1a73e8',
        borderRadius: 12,
        padding: 14,
        alignItems: 'center',
    },
    callText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
    paymentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    paymentLabel: { fontSize: 14, color: '#666' },
    paymentPrice: { fontSize: 16, fontWeight: 'bold', color: '#333' },
    paymentStatus: { fontSize: 14, fontWeight: 'bold', color: '#f59e0b' },
    cancelButton: {
        borderWidth: 1.5,
        borderColor: '#d32f2f',
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
        backgroundColor: '#fff',
    },
    cancelButtonText: { color: '#d32f2f', fontSize: 16, fontWeight: 'bold' },
});
