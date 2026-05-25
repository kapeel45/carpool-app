import { useRouter } from 'expo-router';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const upcomingRides = [
    { id: '1', type: 'rider', from: 'Wakad', to: 'Hinjewadi', time: 'Tomorrow, 9:00 AM', driver: 'Rahul S.', price: 80, status: 'confirmed' },
];

const pastRides = [
    { id: '2', type: 'rider', from: 'Baner', to: 'Hinjewadi', time: 'Yesterday, 9:15 AM', driver: 'Priya M.', price: 60, status: 'completed' },
    { id: '3', type: 'driver', from: 'Wakad', to: 'Hinjewadi', time: 'Mon, 9:00 AM', driver: 'You', price: 240, status: 'completed' },
];

export default function MyRidesScreen() {
    const router = useRouter();

    const RideCard = ({ ride }: { ride: typeof upcomingRides[0] }) => (
        <View style={styles.card}>
            <View style={styles.cardTop}>
                <View style={styles.typeBadge}>
                    <Text style={styles.typeText}>{ride.type === 'driver' ? '🚗 Driver' : '👤 Rider'}</Text>
                </View>
                <View style={[styles.statusBadge, ride.status === 'confirmed' ? styles.statusConfirmed : styles.statusCompleted]}>
                    <Text style={styles.statusText}>{ride.status === 'confirmed' ? '✅ Confirmed' : '☑️ Completed'}</Text>
                </View>
            </View>

            <View style={styles.routeRow}>
                <View style={styles.routeDetails}>
                    <Text style={styles.routeText}>🟢 {ride.from}</Text>
                    <Text style={styles.routeLine}>  |</Text>
                    <Text style={styles.routeText}>🔴 {ride.to}</Text>
                </View>
                <Text style={styles.price}>₹{ride.price}</Text>
            </View>

            <View style={styles.cardBottom}>
                <Text style={styles.meta}>🕐 {ride.time}</Text>
                <Text style={styles.meta}>{ride.type === 'driver' ? '👥 3 riders' : `🧑 ${ride.driver}`}</Text>
            </View>

            {ride.status === 'confirmed' && (
                <TouchableOpacity style={styles.viewButton} onPress={() => router.push('/booking')}>
                    <Text style={styles.viewButtonText}>View Booking →</Text>
                </TouchableOpacity>
            )}

            {ride.status === 'completed' && ride.type === 'rider' && (
                <TouchableOpacity style={styles.rateButton}>
                    <Text style={styles.rateButtonText}>⭐ Rate this ride</Text>
                </TouchableOpacity>
            )}
        </View>
    );

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Text style={styles.back}>← Back</Text>
                </TouchableOpacity>
                <Text style={styles.title}>My Rides</Text>
            </View>

            <View style={styles.statsRow}>
                <View style={styles.statBox}>
                    <Text style={styles.statNumber}>2</Text>
                    <Text style={styles.statLabel}>Rides Taken</Text>
                </View>
                <View style={styles.statBox}>
                    <Text style={styles.statNumber}>1</Text>
                    <Text style={styles.statLabel}>Rides Offered</Text>
                </View>
                <View style={styles.statBox}>
                    <Text style={styles.statNumber}>₹240</Text>
                    <Text style={styles.statLabel}>Earned</Text>
                </View>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16 }}>
                <Text style={styles.sectionTitle}>Upcoming</Text>
                {upcomingRides.map(ride => <RideCard key={ride.id} ride={ride} />)}

                <Text style={styles.sectionTitle}>Past Rides</Text>
                {pastRides.map(ride => <RideCard key={ride.id} ride={ride} />)}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    header: { backgroundColor: '#1a73e8', padding: 24, paddingTop: 48 },
    back: { color: '#fff', fontSize: 16, opacity: 0.9, marginBottom: 8 },
    title: { color: '#fff', fontSize: 26, fontWeight: 'bold' },
    statsRow: { flexDirection: 'row', backgroundColor: '#fff', padding: 20, justifyContent: 'space-around', elevation: 2 },
    statBox: { alignItems: 'center' },
    statNumber: { fontSize: 22, fontWeight: 'bold', color: '#1a73e8' },
    statLabel: { fontSize: 12, color: '#666', marginTop: 4 },
    sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 12, marginTop: 8 },
    card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, elevation: 2 },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
    typeBadge: { backgroundColor: '#f0f5ff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
    typeText: { color: '#1a73e8', fontSize: 13, fontWeight: '600' },
    statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
    statusConfirmed: { backgroundColor: '#e8f5e9' },
    statusCompleted: { backgroundColor: '#f5f5f5' },
    statusText: { fontSize: 13, fontWeight: '600', color: '#333' },
    routeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    routeDetails: {},
    routeText: { fontSize: 14, color: '#333', fontWeight: '500' },
    routeLine: { color: '#ccc', fontSize: 12 },
    price: { fontSize: 20, fontWeight: 'bold', color: '#1a73e8' },
    cardBottom: { flexDirection: 'row', gap: 16, marginBottom: 12 },
    meta: { fontSize: 13, color: '#666' },
    viewButton: { backgroundColor: '#f0f5ff', borderRadius: 10, padding: 12, alignItems: 'center' },
    viewButtonText: { color: '#1a73e8', fontWeight: '600' },
    rateButton: { backgroundColor: '#fffde7', borderRadius: 10, padding: 12, alignItems: 'center' },
    rateButtonText: { color: '#f59e0b', fontWeight: '600' },
});