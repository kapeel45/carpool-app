import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import LocationInput from './components/LocationInput';
import { calculateSuggestedPrice, createRide, getFuelPrices } from './config/api';

export default function OfferRideScreen() {

    const [loading, setLoading] = useState(false);

    const router = useRouter();
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [time, setTime] = useState('');
    const [seats, setSeats] = useState('2');
    const [price, setPrice] = useState('');
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [selectedTime, setSelectedTime] = useState(new Date());
    const [suggestedPrice, setSuggestedPrice] = useState<number | null>(null);
    const [calculating, setCalculating] = useState(false);
    const [petrolPrice, setPetrolPrice] = useState(104.89);

    useEffect(() => {
        const loadPetrolPrice = async () => {
            try {
                const prices = await getFuelPrices();
                const petrol = prices.find((p: any) => p.fuel_type === 'Petrol');
                if (petrol) setPetrolPrice(petrol.price);
            } catch (error) {
                console.error('Could not load petrol price');
            }
        };
        loadPetrolPrice();
    }, []);

    useEffect(() => {
        const autoCalculate = async () => {
            if (from && to && seats) {
                setCalculating(true);
                try {
                    const suggested = await calculateSuggestedPrice(
                        from, to, parseInt(seats), petrolPrice
                    );
                    if (suggested > 0) {
                        setSuggestedPrice(suggested);
                        setPrice(suggested.toString());
                    }
                } catch (error) {
                    console.error('Price calculation failed');
                } finally {
                    setCalculating(false);
                }
            }
        };
        autoCalculate();
    }, [from, to, seats, petrolPrice]);

    // Convert "9:00 AM" or "14:30" to ISO 8601 datetime (today's date)
    const parseTimeToISO = (timeStr: string): string => {
        const now = new Date();
        const [timePart, meridiem] = timeStr.trim().split(' ');
        let [hours, minutes] = timePart.split(':').map(Number);
        if (meridiem) {
            if (meridiem.toUpperCase() === 'PM' && hours !== 12) hours += 12;
            if (meridiem.toUpperCase() === 'AM' && hours === 12) hours = 0;
        }
        now.setHours(hours || 0, minutes || 0, 0, 0);
        return now.toISOString();
    };

    const handlePublish = async () => {
        if (!from || !to || !time || !price) {
            Alert.alert('Error', 'Please fill in all details.');
            return;
        }
        setLoading(true);
        try {
            await createRide({
                from_location: from,
                to_location: to,
                departure_time: parseTimeToISO(time),
                available_seats: parseInt(seats),
                price_per_seat: parseInt(price),
                driver_name: 'Test Driver',
                status: 'active'
            });
            Alert.alert('Success 🎉', 'Your ride has been published!', [
                { text: 'OK', onPress: () => router.replace('/') }
            ]);
        } catch (error: any) {
            const msg = error?.response?.data?.errors?.[0]?.message || 'Could not post ride. Try again.';
            console.error('createRide error:', error?.response?.data || error);
            Alert.alert('Error', msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAwareScrollView contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled={true}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <Text style={styles.backText}>← Back</Text>
                    </TouchableOpacity>
                    <Text style={styles.title}>Offer a Ride</Text>
                    <Text style={styles.sub}>Share your commute, earn money</Text>
                </View>

                <View style={styles.form}>
                    <Text style={styles.label}>🟢 Starting Point</Text>
                    <View style={{ zIndex: 20 }}>
                        <LocationInput
                            placeholder="e.g. Wakad, Pune"
                            onLocationSelect={(address) => setFrom(address)}
                        />
                    </View>

                    <Text style={styles.label}>🔴 Destination</Text>
                    <View style={{ zIndex: 10 }}>
                        <LocationInput
                            placeholder="e.g. Hinjewadi Phase 1"
                            onLocationSelect={(address) => setTo(address)}
                        />
                    </View>

                    <View style={styles.row}>
                        <View style={styles.halfWidth}>
                            <Text style={styles.label}>🕐 Departure Time</Text>
                            <TouchableOpacity
                                style={styles.input}
                                onPress={() => setShowTimePicker(true)}
                            >
                                <Text style={{ fontSize: 16, color: time ? '#333' : '#999' }}>
                                    {time || 'Select departure time'}
                                </Text>
                            </TouchableOpacity>
                            {showTimePicker && (
                                <DateTimePicker
                                    value={selectedTime}
                                    mode="time"
                                    is24Hour={false}
                                    display="spinner"
                                    onValueChange={(event, date) => {
                                        setShowTimePicker(false);
                                        if (date) {
                                            setSelectedTime(date);
                                            const hours = date.getHours();
                                            const minutes = date.getMinutes();
                                            const ampm = hours >= 12 ? 'PM' : 'AM';
                                            const formattedHours = hours % 12 || 12;
                                            const formattedMinutes = minutes < 10 ? `0${minutes}` : minutes;
                                            setTime(`${formattedHours}:${formattedMinutes} ${ampm}`);
                                        }
                                    }}
                                />
                            )}
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
                    {calculating && (
                        <View style={styles.calculatingBox}>
                            <ActivityIndicator size="small" color="#1a73e8" />
                            <Text style={styles.calculatingText}>
                                Calculating based on distance & petrol price...
                            </Text>
                        </View>
                    )}

                    {suggestedPrice && !calculating && (
                        <View style={styles.suggestionBox}>
                            <Text style={styles.suggestionText}>
                                💡 Suggested: ₹{suggestedPrice} per seat
                            </Text>
                            <Text style={styles.suggestionSub}>
                                Based on ₹{petrolPrice}/L petrol • 15km/L mileage
                            </Text>
                        </View>
                    )}

                    <TextInput
                        style={styles.input}
                        placeholder="Auto-calculated or enter manually"
                        placeholderTextColor="#999"
                        keyboardType="number-pad"
                        value={price}
                        onChangeText={setPrice}
                    />

                    <View style={styles.earningBox}>
                        <Text style={styles.earningLabel}>Potential Earning</Text>
                        <Text style={styles.earningAmount}>
                            ₹{price && seats ? parseInt(price) * parseInt(seats) : 0}
                        </Text>
                        <Text style={styles.earningNote}>if all seats filled</Text>
                    </View>

                    <TouchableOpacity
                        style={[styles.publishButton, loading && styles.buttonDisabled]}
                        onPress={handlePublish}
                        disabled={loading}>
                        {loading
                            ? <ActivityIndicator color="#fff" />
                            : <Text style={styles.publishButtonText}>Publish Ride 🚗</Text>
                        }
                    </TouchableOpacity>
                </View>
            </KeyboardAwareScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    buttonDisabled: { backgroundColor: '#93b8f5' },
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
    calculatingBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        padding: 12,
        backgroundColor: '#f0f5ff',
        borderRadius: 12,
        marginBottom: 8
    },
    calculatingText: {
        color: '#1a73e8',
        fontSize: 13
    },
    suggestionBox: {
        backgroundColor: '#e8f5e9',
        borderRadius: 12,
        padding: 12,
        marginBottom: 8
    },
    suggestionText: {
        color: '#2e7d32',
        fontWeight: 'bold',
        fontSize: 14
    },
    suggestionSub: {
        color: '#66bb6a',
        fontSize: 12,
        marginTop: 4
    },
    earningBox: {
        backgroundColor: '#e8f5e9',
        borderRadius: 16,
        padding: 20,
        alignItems: 'center',
        marginTop: 8,
        marginBottom: 8
    },
    earningLabel: {
        fontSize: 14,
        color: '#2e7d32'
    },
    earningAmount: {
        fontSize: 36,
        fontWeight: 'bold',
        color: '#2e7d32',
        marginVertical: 4
    },
    earningNote: {
        fontSize: 12,
        color: '#66bb6a'
    },
});