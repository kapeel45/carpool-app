import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getRides } from './config/api';

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
  rideBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  meta: { fontSize: 13, color: '#666' },
  bookButton: { backgroundColor: '#1a73e8', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8 },
  bookText: { color: '#fff', fontWeight: 'bold' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 40 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyText: { fontSize: 16, color: '#999' },
});

export default function SearchScreen() {
  const router = useRouter();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [searched, setSearched] = useState(false);
  const [rides, setRides] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    setLoading(true);
    try {
      const data = await getRides();
      setRides(data);
      setSearched(true);
    } catch (error) {
      console.error('Error fetching rides:', error);
    } finally {
      setLoading(false);
    }
  };

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

        <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
          <Text style={styles.searchText}>Search Rides 🔍</Text>
        </TouchableOpacity>
      </View>

      {loading && (
        <ActivityIndicator size="large" color="#1a73e8" style={{ marginTop: 40 }} />
      )}

      {searched && !loading && (
        <FlatList
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
            <TouchableOpacity style={styles.rideCard}>
              <View style={styles.rideTop}>
                <Text style={styles.driverName}>🧑 {item.driver_name}</Text>
                <Text style={styles.price}>₹{item.price_per_seat}</Text>
              </View>
              <View style={styles.rideMiddle}>
                <Text style={styles.route}>{item.from_location} → {item.to_location}</Text>
              </View>
              <View style={styles.rideBottom}>
                <Text style={styles.meta}>💺 {item.available_seats} seats left</Text>
                <TouchableOpacity style={styles.bookButton} onPress={() => router.push('/booking')}>
                  <Text style={styles.bookText}>Book</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
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