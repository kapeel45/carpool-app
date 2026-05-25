import { useState } from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';

export default function OfferRideScreen() {
    const router = useRouter();
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [time, setTime] = useState('');
    const [seats, setSeats] = useState('2');
    const [price, setPrice] = useState('');

    const handlePublish = () => {
        if (!from || !to || !time || !price) {
            Alert.alert('Error', 'Please fill in all details.');
            return;
        }
        
        Alert.alert(
            'Success 🎉',
            'Your ride has been successfully published!',
            [
                { text: 'OK', onPress: () => router.replace('/') }
            ]
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <Text style={styles.backText}>← Back</Text>
                    </TouchableOpacity>
                    <Text style={styles.title}>Offer a Ride</Text>
                    <Text style={styles.sub}>Share your commute, earn money</Text>
                </View>

                <View style={styles.form}>
                    <Text style={styles.label}>🟢 Starting Point</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="e.g. Wakad, Pune"
                        placeholderTextColor="#999"
                        value={from}
                        onChangeText={setFrom}
                    />

                    <Text style={styles.label}>🔴 Destination</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="e.g. Hinjewadi Phase 1"
                        placeholderTextColor="#999"
                        value={to}
                        onChangeText={setTo}
                    />

                    <View style={styles.row}>
                        <View style={styles.halfWidth}>
                            <Text style={styles.label}>🕐 Departure Time</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="e.g. 9:00 AM"
                                placeholderTextColor="#999"
                                value={time}
                                onChangeText={setTime}
                            />
                        </View>
                        <View style={styles.halfWidth}>
                            <Text style={styles.label}>💺 Available Seats</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="e.g. 2"
                                placeholderTextColor="#999"
                                keyboardType="number-pad"
                                maxLength={1}
                                value={seats}
                                onChangeText={setSeats}
                            />
                        </View>
                    </View>

                    <Text style={styles.label}>💰 Price per Seat (₹)</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="e.g. 80"
                        placeholderTextColor="#999"
                        keyboardType="number-pad"
                        value={price}
                        onChangeText={setPrice}
                    />

                    <TouchableOpacity style={styles.publishButton} onPress={handlePublish}>
                        <Text style={styles.publishButtonText}>Publish Ride 🚗</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    scrollContent: { paddingBottom: 40 },
    header: { backgroundColor: '#1a73e8', padding: 24, paddingTop: 48 },
    backButton: { marginBottom: 16 },
    backText: { color: '#fff', fontSize: 16, fontWeight: 'bold', opacity: 0.9 },
    title: { color: '#fff', fontSize: 26, fontWeight: 'bold' },
    sub: { color: '#fff', fontSize: 14, opacity: 0.85, marginTop: 4 },
    form: { padding: 20, gap: 16 },
    label: { fontSize: 15, fontWeight: '600', color: '#333', marginBottom: 4 },
    input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 14, fontSize: 16, color: '#333' },
    row: { flexDirection: 'row', justifyContent: 'space-between' },
    halfWidth: { width: '48%' },
    publishButton: { backgroundColor: '#1a73e8', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 16, shadowColor: '#1a73e8', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 4 },
    publishButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});