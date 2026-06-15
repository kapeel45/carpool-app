import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NotificationBell from '../components/NotificationBell';
import { getFuelPrices, getDisplayName } from '../config/api';
import { getSession } from '../config/session';
import { useUserStats } from '@/hooks/use-user-stats';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [fuelPrices, setFuelPrices] = useState<any[]>([]);
  const [userName, setUserName] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const { stats, loading: statsLoading } = useUserStats();

  useFocusEffect(
    useCallback(() => {
      const checkSession = async () => {
        const session = await getSession();
        if (session?.loggedIn) {
          setUserName(getDisplayName(session.name, session.phone));
          setIsLoggedIn(true);
        } else {
          setUserName('');
          setIsLoggedIn(false);
        }
      };
      checkSession();
    }, [])
  );

  const handleFindRide = () => {
    router.push(isLoggedIn ? '/search' : '/login');
  };

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
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.greeting}>
              {userName ? `Welcome back! 👋 ${userName}` : 'Good day! 👋'}
            </Text>
            <Text style={styles.title}>Where are you going?</Text>
          </View>
          <View style={styles.headerActions}>
            {isLoggedIn ? <NotificationBell /> : null}
            <TouchableOpacity onPress={() => router.push('/profile')}>
              <View style={styles.profileIcon}>
                <Text style={styles.profileIconText}>👤</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.findButton} onPress={handleFindRide}>
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
          {statsLoading ? (
            <ActivityIndicator size="small" color="#1a73e8" style={styles.statsLoader} />
          ) : (
            <>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>{stats.ridesTaken}</Text>
                <Text style={styles.statLabel}>Taken</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>{stats.ridesOffered}</Text>
                <Text style={styles.statLabel}>Offered</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>₹{stats.saved}</Text>
                <Text style={styles.statLabel}>Saved</Text>
              </View>
            </>
          )}
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
      </ScrollView>
    </View>
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
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  header: {
    backgroundColor: '#1a73e8',
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerText: { flex: 1, paddingRight: 12 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  greeting: { color: '#fff', fontSize: 16, opacity: 0.9 },
  title: { color: '#fff', fontSize: 26, fontWeight: 'bold', marginTop: 4 },
  buttonContainer: { padding: 20, gap: 16 },
  findButton: { backgroundColor: '#fff', borderRadius: 16, padding: 24, elevation: 3, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8 },
  offerButton: { backgroundColor: '#1a73e8', borderRadius: 16, padding: 24, elevation: 3 },
  buttonIcon: { fontSize: 32, marginBottom: 8 },
  buttonTitle: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  buttonSub: { fontSize: 14, color: '#666', marginTop: 4 },
  offerButtonTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  offerButtonSub: { fontSize: 14, color: '#fff', opacity: 0.85, marginTop: 4 },
  statsRow: { flexDirection: 'row', margin: 20, backgroundColor: '#fff', borderRadius: 16, padding: 20, justifyContent: 'space-around', elevation: 2 },
  statBox: { alignItems: 'center', flex: 1 },
  statsLoader: { flex: 1, paddingVertical: 8 },
  statNumber: { fontSize: 24, fontWeight: 'bold', color: '#1a73e8' },
  statLabel: { fontSize: 12, color: '#666', marginTop: 4, textAlign: 'center', minWidth: 56 },
  profileIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  profileIconText: { fontSize: 22 },
});