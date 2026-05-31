import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RideMap from './components/RideMap';
import { createBooking } from './config/api';
import { getSession } from './config/session';

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

export default function BookingScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { from, to, time, price, driver, driverPhone, seats, rideId, viewOnly } = useLocalSearchParams<{
        from: string;
        to: string;
        time: string;
        price: string;
        driver: string;
        driverPhone: string;
        seats: string;
        rideId: string;
        viewOnly?: string;
    }>();

    const [bookingDone, setBookingDone] = useState(viewOnly === 'true');
    const phone = driverPhone || driver;
    const displayTime = time ? formatRideTime(time) : 'Time TBD';

    useEffect(() => {
        if (viewOnly === 'true') return;

        const saveBooking = async () => {
            if (bookingDone) return;
            try {
                const session = await getSession();
                await createBooking({
                    ride_id: rideId,
                    rider_name: session?.name || session?.phone,
                    rider_phone: session?.phone,
                    seats_booked: 1,
                    total_price: parseInt(price as string),
                    payment_status: 'pending',
                });
                setBookingDone(true);
            } catch (error) {
                console.error('Booking save error:', error);
            }
        };
        saveBooking();
    }, []);

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
        const digits = (phone || '').replace(/\D/g, '').slice(-10);
        if (digits.length === 10) {
            Linking.openURL(`tel:${digits}`);
        } else {
            Alert.alert('Unavailable', 'Driver phone not available.');
        }
    };

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

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.mapCard}>
                    <RideMap
                        fromLocation={from as string}
                        toLocation={to as string}
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
                            <Text style={styles.rowValue}>{from}</Text>
                        </View>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.row}>
                        <View style={styles.dotRed} />
                        <View style={styles.rowContent}>
                            <Text style={styles.rowLabel}>Drop</Text>
                            <Text style={styles.rowValue}>{to}</Text>
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
                    <Text style={styles.sectionTitle}>Driver Details</Text>
                    <View style={styles.driverRow}>
                        <View style={styles.avatar}>
                            <Text style={styles.avatarText}>
                                {driver ? driver[0].toUpperCase() : 'D'}
                            </Text>
                        </View>
                        <View style={styles.driverInfo}>
                            <Text style={styles.driverName}>{driver || 'Driver'}</Text>
                            <Text style={styles.driverMeta}>💺 {seats || '1'} seats available</Text>
                            {phone ? (
                                <Text style={styles.driverPhone}>📱 +91 {phone}</Text>
                            ) : null}
                        </View>
                    </View>
                    <TouchableOpacity style={styles.callButton} onPress={handleCall}>
                        <Text style={styles.callText}>📞 Call Driver</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Payment Details</Text>
                    <View style={styles.paymentRow}>
                        <Text style={styles.paymentLabel}>Price per seat</Text>
                        <Text style={styles.paymentPrice}>₹{price}</Text>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.paymentRow}>
                        <Text style={styles.paymentLabel}>Payment Status</Text>
                        <Text style={styles.paymentStatus}>Pending</Text>
                    </View>
                </View>

                <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
                    <Text style={styles.cancelButtonText}>Cancel Booking</Text>
                </TouchableOpacity>
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
