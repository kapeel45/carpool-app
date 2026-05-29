import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getFuelPrices } from '../config/api';

export default function HomeScreen() {
  const router = useRouter();
  const [fuelPrices, setFuelPrices] = useState<any[]>([]);

  useEffect(() => {
    const loadFuelPrices = async () => {
      try {
        const data = await getFuelPrices();
        setFuelPrices(data);
      } catch (error) {
        console.error('Error loading fuel prices:', error);
      }
    };
    loadFuelPrices();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.greeting}>Good day! 👋</Text>
        <Text style={styles.title}>Where are you going?</Text>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.findButton} onPress={() => router.push('/login')}>
          <Text style={styles.buttonIcon}>🔍</Text>
          <Text style={styles.buttonTitle}>Find a Ride</Text>
          <Text style={styles.buttonSub}>Search available carpools</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.offerButton} onPress={() => router.push('/offer')}>
          <Text style={styles.buttonIcon}>🚗</Text>
          <Text style={styles.offerButtonTitle}>Offer a Ride</Text>
          <Text style={styles.offerButtonSub}>Share your commute</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity onPress={() => router.push('/myrides')}>
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.statLabel}>Rides Taken</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.statLabel}>Rides Offered</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>₹0</Text>
            <Text style={styles.statLabel}>Saved</Text>
          </View>
        </View>
        <View style={styles.fuelContainer}>
          <Text style={styles.fuelTitle}>⛽ Pune Fuel Prices</Text>
          <View style={styles.fuelRow}>
            {fuelPrices.map((fuel: any) => (
              <View
                key={fuel.id}
                style={[
                  styles.fuelCard,
                  fuel.fuel_type === 'Petrol' && styles.petrolCard,
                  fuel.fuel_type === 'Diesel' && styles.dieselCard,
                  fuel.fuel_type === 'CNG' && styles.cngCard,
                ]}
              >
                <Text style={styles.fuelIcon}>
                  {fuel.fuel_type === 'Petrol' ? '🔴' : fuel.fuel_type === 'Diesel' ? '🟡' : '🟢'}
                </Text>
                <Text style={styles.fuelType}>{fuel.fuel_type}</Text>
                <Text style={styles.fuelPrice}>₹{fuel.price}</Text>
                <Text style={styles.fuelUpdated}>{fuel.last_updated}</Text>
              </View>
            ))}
          </View>
        </View>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fuelContainer: { margin: 20, marginTop: 0 },
  fuelTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 12 },
  fuelRow: { flexDirection: 'row', gap: 10 },
  fuelCard: { flex: 1, borderRadius: 16, padding: 14, alignItems: 'center', elevation: 2 },
  petrolCard: { backgroundColor: '#fff0f0' },
  dieselCard: { backgroundColor: '#fffde7' },
  cngCard: { backgroundColor: '#f0fff4' },
  fuelIcon: { fontSize: 24, marginBottom: 4 },
  fuelType: { fontSize: 13, fontWeight: '600', color: '#333' },
  fuelPrice: { fontSize: 18, fontWeight: 'bold', color: '#1a73e8', marginTop: 4 },
  fuelUpdated: { fontSize: 10, color: '#999', marginTop: 4 },
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { padding: 24, backgroundColor: '#1a73e8', paddingTop: 48 },
  greeting: { color: '#fff', fontSize: 16, opacity: 0.9 },
  title: { color: '#fff', fontSize: 26, fontWeight: 'bold', marginTop: 4 },
  buttonContainer: { padding: 20, gap: 16, marginTop: 8 },
  findButton: { backgroundColor: '#fff', borderRadius: 16, padding: 24, elevation: 3, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8 },
  offerButton: { backgroundColor: '#1a73e8', borderRadius: 16, padding: 24, elevation: 3 },
  buttonIcon: { fontSize: 32, marginBottom: 8 },
  buttonTitle: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  buttonSub: { fontSize: 14, color: '#666', marginTop: 4 },
  offerButtonTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  offerButtonSub: { fontSize: 14, color: '#fff', opacity: 0.85, marginTop: 4 },
  statsRow: { flexDirection: 'row', margin: 20, backgroundColor: '#fff', borderRadius: 16, padding: 20, justifyContent: 'space-around', elevation: 2 },
  statBox: { alignItems: 'center' },
  statNumber: { fontSize: 24, fontWeight: 'bold', color: '#1a73e8' },
  statLabel: { fontSize: 12, color: '#666', marginTop: 4 },
});