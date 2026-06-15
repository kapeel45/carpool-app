import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RideMap from './components/RideMap';
import SeatSelector from './components/SeatSelector';
import {
    cancelBooking,
    createBooking,
    getAvailableSeats,
    getBookingById,
    getRideById,
    isCancelledBooking,
    normalizePhone,
    resolveDisplayName,
    resolveRelationId,
} from './config/api';
import { getSession } from './config/session';

type BookingDetails = {
    from: string;
    to: string;
    time: string;
    pricePerSeat: number;
    driver: string;
    driverPhone: string;
    availableSeats: number;
    seatsBooked: number;
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

const buildDetailsFromRide = async (
    ride: any,
    options?: { pricePerSeat?: number; paymentStatus?: string; seatsBooked?: number }
) => {
    const driverRaw = ride?.driver_name || '';
    const driverName = await resolveDisplayName(driverRaw, 'Owner');
    const pricePerSeat = options?.pricePerSeat ?? (Number(ride?.price_per_seat) || 0);
    return {
        from: ride?.from_location || 'Pickup',
        to: ride?.to_location || 'Destination',
        time: ride?.departure_time || '',
        pricePerSeat,
        driver: driverName,
        driverPhone: normalizePhone(driverRaw) || driverRaw,
        availableSeats: getAvailableSeats(ride),
        seatsBooked: options?.seatsBooked ?? 1,
        paymentStatus: options?.paymentStatus || 'pending',
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
    const [activeBookingId, setActiveBookingId] = useState(bookingId);
    const [bookingCancelled, setBookingCancelled] = useState(false);
    const [loadedBooking, setLoadedBooking] = useState<any>(null);
    const [isOwnerViewer, setIsOwnerViewer] = useState(false);
    const [seatsToBook, setSeatsToBook] = useState(1);
    const [confirming, setConfirming] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const loadDetails = async () => {
            setLoading(true);
            try {
                if (bookingId) {
                    const booking = await getBookingById(bookingId);
                    if (!cancelled && booking && isCancelledBooking(booking)) {
                        setBookingCancelled(true);
                    }
                    const rideRef = booking?.ride_id;
                    const ride =
                        typeof rideRef === 'object' && rideRef !== null
                            ? rideRef
                            : await getRideById(resolveRelationId(rideRef) || '');
                    const seatsBooked = Math.max(1, Number(booking?.seats_booked) || 1);
                    const pricePerSeat =
                        Number(ride?.price_per_seat) ||
                        Math.round(Number(booking?.total_price) / seatsBooked) ||
                        0;
                    const nextDetails = await buildDetailsFromRide(ride, {
                        pricePerSeat,
                        paymentStatus: booking?.payment_status || 'pending',
                        seatsBooked,
                    });
                    if (!cancelled) {
                        setDetails(nextDetails);
                        setSeatsToBook(seatsBooked);
                        setLoadedBooking(booking);
                        if (booking?.id) setActiveBookingId(String(booking.id));
                        const session = await getSession();
                        const driverPhone = normalizePhone(String(ride?.driver_name || ''));
                        setIsOwnerViewer(
                            Boolean(session?.phone) && driverPhone === normalizePhone(session.phone)
                        );
                    }
                    return;
                }

                if (rideId) {
                    const ride = await getRideById(rideId);
                    const pricePerSeat =
                        parseInt(paramAsString(params.price), 10) || Number(ride?.price_per_seat) || 0;
                    const nextDetails = await buildDetailsFromRide(ride, { pricePerSeat });
                    if (!cancelled) {
                        setDetails(nextDetails);
                        setSeatsToBook(1);
                    }
                    return;
                }

                const driverRaw = paramAsString(params.driverPhone) || paramAsString(params.driver);
                const driverName = driverRaw
                    ? await resolveDisplayName(driverRaw, paramAsString(params.driver) || 'Owner')
                    : paramAsString(params.driver) || 'Owner';
                const availableSeats = parseInt(paramAsString(params.seats), 10) || 1;

                if (!cancelled) {
                    setDetails({
                        from: paramAsString(params.from) || 'Pickup',
                        to: paramAsString(params.to) || 'Destination',
                        time: paramAsString(params.time),
                        pricePerSeat: parseInt(paramAsString(params.price), 10) || 0,
                        driver: driverName,
                        driverPhone: normalizePhone(driverRaw) || driverRaw,
                        availableSeats,
                        seatsBooked: 1,
                        paymentStatus: 'pending',
                    });
                    setSeatsToBook(1);
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

    const handleConfirmBooking = async () => {
        if (!rideId || bookingDone || viewOnly) return;

        const available = details?.availableSeats ?? 0;
        if (available < 1) {
            Alert.alert('Ride full', 'No seats available on this ride.');
            return;
        }

        const seats = Math.min(Math.max(1, seatsToBook), available);
        setConfirming(true);
        try {
            const session = await getSession();
            if (!session?.loggedIn) {
                Alert.alert('Login Required', 'Please log in to book a ride.');
                router.push('/login');
                return;
            }
            const pricePerSeat = details?.pricePerSeat || 0;
            const booking = await createBooking({
                ride_id: rideId,
                rider_name: session?.name?.trim() || session?.phone,
                rider_phone: session?.phone,
                seats_booked: seats,
                total_price: pricePerSeat * seats,
                payment_status: 'pending',
            });
            if (booking?.id) setActiveBookingId(String(booking.id));
            setDetails((prev) =>
                prev
                    ? {
                          ...prev,
                          availableSeats: Math.max(0, prev.availableSeats - seats),
                          seatsBooked: seats,
                      }
                    : prev
            );
            setBookingDone(true);
        } catch (error: any) {
            const msg =
                error?.response?.data?.errors?.[0]?.message ||
                error?.message ||
                'Could not book this ride.';
            Alert.alert('Booking failed', msg);
        } finally {
            setConfirming(false);
        }
    };

    const handleCancel = () => {
        const idToCancel = activeBookingId || bookingId;
        if (!idToCancel) {
            Alert.alert('Error', 'Could not find this booking to cancel.');
            return;
        }

        Alert.alert(
            isOwnerViewer ? 'Cancel rider booking?' : 'Cancel Booking?',
            isOwnerViewer
                ? 'The rider will be notified that their booking was cancelled.'
                : 'Are you sure you want to cancel this booking?',
            [
                { text: 'No, Keep It', style: 'cancel' },
                {
                    text: 'Yes, Cancel',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const session = await getSession();
                            await cancelBooking(idToCancel, session?.phone);
                            setBookingCancelled(true);
                            setLoadedBooking((prev: any) =>
                                prev
                                    ? { ...prev, payment_status: 'cancelled', status: 'cancelled' }
                                    : prev
                            );
                            Alert.alert(
                                'Cancelled',
                                isOwnerViewer
                                    ? 'The booking was cancelled and the rider was notified.'
                                    : 'Your booking has been cancelled.',
                                [{ text: 'OK', onPress: () => router.replace('/myrides') }]
                            );
                        } catch (error: any) {
                            const msg =
                                error?.response?.data?.errors?.[0]?.message ||
                                error?.message ||
                                'Could not cancel booking. Try again.';
                            Alert.alert('Error', msg);
                        }
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

    const displaySeats = bookingDone ? (details?.seatsBooked ?? seatsToBook) : seatsToBook;
    const maxSeats = details?.availableSeats ?? 1;
    const totalPrice = (details?.pricePerSeat || 0) * displaySeats;
    const showSeatPicker = !viewOnly && !bookingDone && !bookingCancelled && Boolean(rideId);
    const showCancelButton =
        Boolean(bookingId || activeBookingId) &&
        !bookingCancelled &&
        (!loadedBooking || !isCancelledBooking(loadedBooking)) &&
        (viewOnly || bookingDone || isOwnerViewer);

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

                    {bookingDone ? (
                        <View style={styles.successBanner}>
                            <Text style={styles.successIcon}>✅</Text>
                            <Text style={styles.successTitle}>Ride Booked!</Text>
                            <Text style={styles.successSub}>
                                {displaySeats} seat{displaySeats === 1 ? '' : 's'} confirmed
                            </Text>
                        </View>
                    ) : showSeatPicker ? (
                        <View style={styles.card}>
                            <Text style={styles.sectionTitle}>How many seats?</Text>
                            <Text style={styles.seatSub}>
                                Default is 1 — use + / − to change before confirming
                            </Text>
                            <View style={styles.seatPickerCenter}>
                                <SeatSelector
                                    value={Math.min(seatsToBook, Math.max(1, maxSeats))}
                                    max={Math.max(1, maxSeats)}
                                    onChange={setSeatsToBook}
                                    disabled={confirming}
                                    label=""
                                />
                            </View>
                            <Text style={styles.totalLine}>
                                Total: ₹{totalPrice} ({displaySeats} × ₹{details?.pricePerSeat || 0})
                            </Text>
                            <TouchableOpacity
                                style={[styles.confirmButton, confirming && styles.confirmButtonDisabled]}
                                onPress={handleConfirmBooking}
                                disabled={confirming || maxSeats < 1}
                            >
                                {confirming ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <Text style={styles.confirmButtonText}>Confirm booking</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    ) : null}

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
                                <Text style={styles.driverMeta}>
                                    💺 {maxSeats} seat{maxSeats === 1 ? '' : 's'} available
                                </Text>
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
                            <Text style={styles.paymentPrice}>₹{details?.pricePerSeat || 0}</Text>
                        </View>
                        <View style={styles.divider} />
                        <View style={styles.paymentRow}>
                            <Text style={styles.paymentLabel}>Seats booked</Text>
                            <Text style={styles.paymentPrice}>{displaySeats}</Text>
                        </View>
                        <View style={styles.divider} />
                        <View style={styles.paymentRow}>
                            <Text style={styles.paymentLabel}>Total</Text>
                            <Text style={styles.paymentPrice}>₹{totalPrice}</Text>
                        </View>
                        <View style={styles.divider} />
                        <View style={styles.paymentRow}>
                            <Text style={styles.paymentLabel}>Payment Status</Text>
                            <Text style={styles.paymentStatus}>{paymentStatusLabel}</Text>
                        </View>
                    </View>

                    {showCancelButton ? (
                        <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
                            <Text style={styles.cancelButtonText}>
                                {isOwnerViewer ? 'Cancel Rider Booking' : 'Cancel Booking'}
                            </Text>
                        </TouchableOpacity>
                    ) : bookingCancelled || (loadedBooking && isCancelledBooking(loadedBooking)) ? (
                        <View style={styles.cancelledBanner}>
                            <Text style={styles.cancelledText}>This booking was cancelled.</Text>
                        </View>
                    ) : null}
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
    seatSub: { fontSize: 13, color: '#666', marginBottom: 16, marginTop: -8 },
    seatPickerCenter: { alignItems: 'center', marginBottom: 16 },
    totalLine: {
        fontSize: 15,
        fontWeight: '700',
        color: '#1a73e8',
        textAlign: 'center',
        marginBottom: 16,
    },
    confirmButton: {
        backgroundColor: '#1a73e8',
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
    },
    confirmButtonDisabled: { opacity: 0.7 },
    confirmButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
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
    cancelledBanner: {
        backgroundColor: '#fdecea',
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
        marginTop: 4,
    },
    cancelledText: { color: '#c62828', fontSize: 15, fontWeight: '600' },
});
