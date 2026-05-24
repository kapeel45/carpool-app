import { useState } from 'react';
import { FlatList, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

const mockRides = [
    { id: '1', driver: 'Rahul S.', from: 'Wakad', to: 'Hinjewadi', time: '9:00 AM', seats: 2, price: 80, rating: 4.8 },
    { id: '2', driver: 'Priya M.', from: 'Baner', to: 'Hinjewadi', time: '9:15 AM', seats: 1, price: 60, rating: 4.9 },
    { id: '3', driver: 'Amit K.', from: 'Aundh', to: 'Hinjewadi', time: '9:30 AM', seats: 3, price: 70, rating: 4.7 },
];

export default function SearchScreen() {
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [searched, setSearched] = useState(false);

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Find a Ride</Text>

                <View style={styles.inputBox}>
                    <Text style={styles.dot}>🟢</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="From where?"
                        value={from}
                        onChangeText={setFrom}
                        placeholderTextColor="#999"
                    />
                </View>

                <View style={styles.inputBox}>
                    <Text style={styles.dot}>🔴</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Going to?"
                        value={to}
                        onChangeText={setTo}
                        placeholderTextColor="#999"
                    />
                </View>

                <TouchableOpacity
                    style={styles.searchButton}
                    onPress={() => setSearched(true)}
                >
                    <Text style={styles.searchText}>Search Rides 🔍</Text>
                </TouchableOpacity>
            </View>

            {searched && (
                <FlatList
                    data={mockRides}
                    keyExtractor={item => item.id}
                    contentContainerStyle={{ padding: 16 }}
                    renderItem={({ item }) => (
                        <TouchableOpacity style={styles.rideCard}>
                            <View style={styles.rideTop}>
                                <Text style={styles.driverName}>🧑 {item.driver}</Text>
                                <Text style={styles.price}>₹{item.price}</Text>
                            </View>
                            <View style={styles.rideMiddle}>
                                <Text style={styles.route}>{item.from} → {item.to}</Text>
                                <Text style={styles.rating}>⭐ {item.rating}</Text>
                            </View>
                            <View style={styles.rideBottom}>
                                <Text style={styles.meta}>🕐 {item.time}</Text>
                                <Text style={styles.meta}>💺 {item.seats} seats left</Text>
                                <TouchableOpacity style={styles.bookButton}>
                                    <Text style={styles.bookText}>Book</Text>
                                </TouchableOpacity>
                            </View>
                        </TouchableOpacity>
                    )}
                />
            )}

            {!searched && (
                <View style={styles.empty}>
                    <Text style={styles.emptyIcon}>🚗</Text>
                    <Text style={styles.emptyText}>Enter your route to find rides</Text>
                </View>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    header: { backgroundColor: '#1a73e8', padding: 20, paddingTop: 48, gap: 12 },
    title: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginBottom: 8 },
    inputBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 12 },
    dot: { fontSize: 12, marginRight: 8 },
    input: { flex: 1, padding: 14, fontSize: 15 },
    searchButton: { backgroundColor: '#fff', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 4 },
    searchText: { color: '#1a73e8', fontWeight: 'bold', fontSize: 15 },
    rideCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, elevation: 2 },
    rideTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    driverName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
    price: { fontSize: 18, fontWeight: 'bold', color: '#1a73e8' },
    rideMiddle: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
    route: { fontSize: 14, color: '#555' },
    rating: { fontSize: 14, color: '#f59e0b' },
    rideBottom: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    meta: { fontSize: 13, color: '#666' },
    bookButton: { marginLeft: 'auto', backgroundColor: '#1a73e8', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8 },
    bookText: { color: '#fff', fontWeight: 'bold' },
    empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyIcon: { fontSize: 64, marginBottom: 16 },
    emptyText: { fontSize: 16, color: '#999' },
});