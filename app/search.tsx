import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import LocationInput from './components/LocationInput';
import RideMap from './components/RideMap';
import { getRides } from './config/api';

export default function SearchScreen() {
    const router = useRouter();
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [rides, setRides] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);

    useEffect(() => {
        const loadAllRides = async () => {
            setLoading(true);
            try {
                const data = await getRides();
                setRides(data);
                setSearched(true);
            } catch (error) {
                console.error('Error loading rides:', error);
            } finally {
                setLoading(false);
            }
        };
        loadAllRides();
    }, []);

    const handleSearch = async () => {
        if (!from || !to) {
            Alert.alert('Missing Info', 'Please enter both pickup and destination.');
            return;
        }
        setLoading(true);
        try {
            const data = await getRides();
            const filtered = data.filter((ride: any) => {
                const rideFrom = ride.from_location?.toLowerCase() || '';
                const rideTo = ride.to_location?.toLowerCase() || '';
                const searchFrom = from.toLowerCase().trim();
                const searchTo = to.toLowerCase().trim();
                return rideFrom.includes(searchFrom) && rideTo.includes(searchTo);
            });
            setRides(filtered);
            setSearched(true);
        } catch (error) {
            Alert.alert('Error', 'Could not fetch rides. Try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>

            {/* HEADER - fixed at top */}
            <View style={styles.header}>
                <Text style={styles.title}>Find a Ride</Text>
            </View>

            {/* SEARCH INPUTS - outside header so dropdowns have space */}
            <View style={styles.searchContainer}>
                <View style={styles.inputRow}>
                    <Text style={styles.dot}>🟢</Text>
                    <View style={{ flex: 1, zIndex: 20 }}>
                        <LocationInput
                            placeholder="From where?"
                            onLocationSelect={(address) => setFrom(address)}
                        />
                    </View>
                </View>

                <View style={styles.inputRow}>
                    <Text style={styles.dot}>🔴</Text>
                    <View style={{ flex: 1, zIndex: 10 }}>
                        <LocationInput
                            placeholder="Going to?"
                            onLocationSelect={(address) => setTo(address)}
                        />
                    </View>
                </View>

                <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
                    <Text style={styles.searchText}>Search Rides 🔍</Text>
                </TouchableOpacity>
            </View>

            {/* RESULTS */}
            {loading && (
                <ActivityIndicator size="large" color="#1a73e8" style={{ marginTop: 40 }} />
            )}

            {searched && !loading && (
                <FlatList
                    keyboardShouldPersistTaps="handled"
                    data={rides}
                    keyExtractor={item => item.id.toString()}
                    contentContainerStyle={{ padding: 16 }}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Text style={styles.emptyIcon}>🚗</Text>
                            <Text style={styles.emptyText}>No rides found for this route</Text>
                        </View>
                    }
                    renderItem={({ item }) => (
                        <View style={styles.rideCard}>
                            <View style={styles.rideTop}>
                                <Text style={styles.driverName}>🧑 {item.driver_name}</Text>
                                <Text style={styles.price}>₹{item.price_per_seat}</Text>
                            </View>
                            <View style={styles.rideMiddle}>
                                <Text style={styles.route}>{item.from_location} → {item.to_location}</Text>
                            </View>
                            <View style={styles.rideBottom}>
                                <Text style={styles.meta}>💺 {item.available_seats} seats left</Text>
                                <TouchableOpacity
                                    style={styles.bookButton}
                                    onPress={() => router.push({
                                        pathname: '/booking',
                                        params: {
                                            rideId: item.id,
                                            from: item.from_location,
                                            to: item.to_location,
                                            time: item.departure_time,
                                            price: item.price_per_seat,
                                            driver: item.driver_name,
                                            seats: item.available_seats
                                        }
                                    })}>
                                    <Text style={styles.bookText}>Book</Text>
                                </TouchableOpacity>
                            </View>
                            <RideMap
                                fromLocation={item.from_location}
                                toLocation={item.to_location}
                                viaPoints={item.via_points ? item.via_points.split(',') : []}
                                height={150}
                            />
                        </View>
                    )}
                />
            )}

            {!searched && !loading && (
                <View style={styles.empty}>
                    <Text style={styles.emptyIcon}>🚗</Text>
                    <Text style={styles.emptyText}>Enter your route to find rides</Text>
                </View>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5', overflow: 'visible' },
    header: { backgroundColor: '#1a73e8', padding: 20, paddingTop: 48 },
    title: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
    searchContainer: {
        backgroundColor: '#fff',
        padding: 16,
        paddingBottom: 12,
        elevation: 4,
        zIndex: 9999,
        overflow: 'visible',
    },
    inputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 35 },
    dot: { fontSize: 14, marginRight: 8 },
    searchButton: { backgroundColor: '#1a73e8', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 12 },
    searchText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
    rideCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, elevation: 2 },
    rideTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    driverName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
    price: { fontSize: 18, fontWeight: 'bold', color: '#1a73e8' },
    rideMiddle: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 21 },
    route: { fontSize: 14, color: '#555', flex: 1, flexWrap: 'wrap' },
    rideBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    meta: { fontSize: 13, color: '#666' },
    bookButton: { backgroundColor: '#1a73e8', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8 },
    bookText: { color: '#fff', fontWeight: 'bold' },
    empty: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 40 },
    emptyIcon: { fontSize: 64, marginBottom: 16 },
    emptyText: { fontSize: 16, color: '#999' },
});