import { useRouter } from 'expo-router';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function HomeScreen() {
  const router = useRouter();
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

        <TouchableOpacity style={styles.offerButton} onPress={() => router.push('/search')}>
          <Text style={styles.buttonIcon}>🚗</Text>
          <Text style={styles.buttonTitle}>Offer a Ride</Text>
          <Text style={styles.buttonSub}>Share your commute</Text>
        </TouchableOpacity>
      </View>

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  statsRow: { flexDirection: 'row', margin: 20, backgroundColor: '#fff', borderRadius: 16, padding: 20, justifyContent: 'space-around', elevation: 2 },
  statBox: { alignItems: 'center' },
  statNumber: { fontSize: 24, fontWeight: 'bold', color: '#1a73e8' },
  statLabel: { fontSize: 12, color: '#666', marginTop: 4 },
});