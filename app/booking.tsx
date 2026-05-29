import { useRouter } from 'expo-router';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function BookingScreen() {
    const router = useRouter();


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
                            { text: 'OK', onPress: () => router.replace('/') }
                        ]);
                    }
                }
            ]
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.replace('/')} style={styles.backButton}>
                        <Text style={styles.backText}>← Home</Text>
                    </TouchableOpacity>
                    <Text style={styles.title}>Booking Details</Text>
                </View>

                <View style={styles.successBanner}>
                    <Text style={styles.successIcon}>✅</Text>
                    <Text style={styles.successTitle}>Ride Booked!</Text>
                    <Text style={styles.successSub}>Your seat is confirmed</Text>
                </View>

                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Trip Details</Text>

                    <View style={styles.row}>
                        <Text style={styles.rowIcon}>🟢</Text>
                        <View>
                            <Text style={styles.rowLabel}>Pickup</Text>
                            <Text style={styles.rowValue}>Wakad, Pune</Text>
                        </View>
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.row}>
                        <Text style={styles.rowIcon}>🔴</Text>
                        <View>
                            <Text style={styles.rowLabel}>Drop</Text>
                            <Text style={styles.rowValue}>Hinjewadi Phase 1</Text>
                        </View>
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.row}>
                        <Text style={styles.rowIcon}>🕐</Text>
                        <View>
                            <Text style={styles.rowLabel}>Departure</Text>
                            <Text style={styles.rowValue}>9:00 AM, Today</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Driver Details</Text>
                    <View style={styles.driverRow}>
                        <View style={styles.avatar}>
                            <Text style={styles.avatarText}>R</Text>
                        </View>
                        <View style={styles.driverInfo}>
                            <Text style={styles.driverName}>Rahul Sharma</Text>
                            <Text style={styles.driverMeta}>⭐ 4.8 • Honda City • MH12 AB 1234</Text>
                        </View>
                    </View>
                    <TouchableOpacity
                        style={styles.callButton}
                        onPress={() => Alert.alert('Calling Driver', 'Connecting call to Rahul Sharma...')}
                    >
                        <Text style={styles.callText}>📞 Call Driver</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Payment Details</Text>
                    <View style={styles.paymentRow}>
                        <Text style={styles.paymentLabel}>Price per seat</Text>
                        <Text style={styles.paymentPrice}>₹80</Text>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.paymentRow}>
                        <Text style={styles.paymentLabel}>Payment Status</Text>
                        <Text style={styles.paymentStatus}>Paid via Wallet</Text>
                    </View>
                </View>

                <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
                    <Text style={styles.cancelButtonText}>Cancel Ride Booking ❌</Text>
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    scrollContent: { paddingBottom: 40 },
    header: { backgroundColor: '#1a73e8', padding: 24, paddingTop: 48 },
    backButton: { marginBottom: 12 },
    backText: { color: '#fff', fontSize: 16, fontWeight: 'bold', opacity: 0.9 },
    title: { color: '#fff', fontSize: 26, fontWeight: 'bold' },
    successBanner: { backgroundColor: '#e6f4fe', padding: 24, alignItems: 'center', margin: 20, borderRadius: 16, borderLeftWidth: 5, borderLeftColor: '#1a73e8' },
    successIcon: { fontSize: 36, marginBottom: 8 },
    successTitle: { fontSize: 20, fontWeight: 'bold', color: '#1a73e8' },
    successSub: { fontSize: 14, color: '#666', marginTop: 4 },
    card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginHorizontal: 20, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
    sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 16 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    rowIcon: { fontSize: 16 },
    rowLabel: { fontSize: 12, color: '#666' },
    rowValue: { fontSize: 15, fontWeight: '600', color: '#333', marginTop: 2 },
    divider: { height: 1, backgroundColor: '#eee', marginVertical: 12 },
    driverRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
    avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#f0f5ff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#1a73e8' },
    avatarText: { fontSize: 18, fontWeight: 'bold', color: '#1a73e8' },
    driverInfo: { flex: 1 },
    driverName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
    driverMeta: { fontSize: 12, color: '#666', marginTop: 4 },
    callButton: { backgroundColor: '#1a73e8', borderRadius: 12, padding: 14, alignItems: 'center' },
    callText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
    paymentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    paymentLabel: { fontSize: 14, color: '#666' },
    paymentPrice: { fontSize: 16, fontWeight: 'bold', color: '#333' },
    paymentStatus: { fontSize: 14, fontWeight: 'bold', color: '#2e7d32' },
    cancelButton: { marginHorizontal: 20, marginTop: 8, borderWidth: 1.5, borderColor: '#d32f2f', borderRadius: 12, padding: 16, alignItems: 'center' },
    cancelButtonText: { color: '#d32f2f', fontSize: 16, fontWeight: 'bold' },
});