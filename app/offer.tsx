import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LocationInput from './components/LocationInput';
import ProfileNavButton from './components/ProfileNavButton';
import {
    calculateSuggestedPrice,
    countActiveBookingsForRide,
    createRide,
    getAvailableSeats,
    getFuelPrices,
    getRideById,
    normalizePhone,
    updateRide,
} from './config/api';
import { canOfferRides } from './config/api';
import { getSession, refreshSessionFromServer } from './config/session';

export default function OfferRideScreen() {
    const [loading, setLoading] = useState(false);
    const [loadingRide, setLoadingRide] = useState(false);

    const router = useRouter();
    const insets = useSafeAreaInsets();
    const params = useLocalSearchParams<{ rideId?: string }>();
    const editRideId = typeof params.rideId === 'string' ? params.rideId : params.rideId?.[0] || '';
    const isEditMode = Boolean(editRideId);
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [time, setTime] = useState('');
    const [dateLabel, setDateLabel] = useState('');
    const [seats, setSeats] = useState('2');
    const [price, setPrice] = useState('');
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [departureDateTime, setDepartureDateTime] = useState(() => {
        const d = new Date();
        d.setSeconds(0, 0);
        d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15);
        if (d.getMinutes() === 60) {
            d.setMinutes(0);
            d.setHours(d.getHours() + 1);
        }
        return d;
    });
    const [pickerValue, setPickerValue] = useState(new Date());
    const [suggestedPrice, setSuggestedPrice] = useState<number | null>(null);
    const [calculating, setCalculating] = useState(false);
    const [petrolPrice, setPetrolPrice] = useState(104.89);
    const [driverPhone, setDriverPhone] = useState('');

    useEffect(() => {
        const loadUser = async () => {
            const session = await getSession();
            if (session) setDriverPhone(session.phone);
        };
        loadUser();
    }, []);

    useEffect(() => {
        const checkVerification = async () => {
            const session = await refreshSessionFromServer();
            if (!canOfferRides(session)) {
                const needsEmail = !session?.emailVerified;
                const needsCar =
                    !String(session?.carModel || '').trim() ||
                    !String(session?.carNumber || '').trim();
                Alert.alert(
                    'Complete your profile',
                    needsEmail
                        ? 'Verify your work email in Profile to offer rides.'
                        : needsCar
                          ? 'Your email is verified. Open Profile, add car model & number, tap Save, then try again.'
                          : 'Complete your profile with official email and car details to offer rides.',
                    [
                        { text: 'Go to Profile', onPress: () => router.replace('/profile') },
                        { text: 'Cancel', onPress: () => router.back() },
                    ]
                );
            }
        };
        checkVerification();
    }, []);

    useEffect(() => {
        if (!editRideId) return;

        const loadRideForEdit = async () => {
            setLoadingRide(true);
            try {
                const session = await getSession();
                const ride = await getRideById(editRideId);
                if (!ride) {
                    Alert.alert('Not found', 'This ride could not be loaded.');
                    router.back();
                    return;
                }

                const ownerPhone = normalizePhone(ride.driver_name || '');
                if (session?.phone && ownerPhone && ownerPhone !== normalizePhone(session.phone)) {
                    Alert.alert('Not allowed', 'You can only edit your own rides.');
                    router.back();
                    return;
                }

                const bookings = await countActiveBookingsForRide(editRideId);
                if (bookings > 0) {
                    Alert.alert(
                        'Cannot edit',
                        'Someone has already booked this ride. Editing is only allowed before any bookings.'
                    );
                    router.back();
                    return;
                }

                const departure = ride.departure_time ? new Date(ride.departure_time) : new Date();
                if (!Number.isNaN(departure.getTime())) {
                    setDepartureDateTime(departure);
                    setDateLabel(formatDate(departure));
                    setTime(formatTime(departure));
                }

                setFrom(ride.from_location || '');
                setTo(ride.to_location || '');
                setSeats(String(getAvailableSeats(ride) || 1));
                setPrice(String(ride.price_per_seat || ''));
                setSuggestedPrice(Number(ride.price_per_seat) || null);
            } catch (error) {
                console.error('Failed to load ride for edit:', error);
                Alert.alert('Error', 'Could not load ride details.');
                router.back();
            } finally {
                setLoadingRide(false);
            }
        };

        loadRideForEdit();
    }, [editRideId]);

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
            if (from && to) {
                setCalculating(true);
                try {
                    const suggested = await calculateSuggestedPrice(from, to, petrolPrice);
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
    }, [from, to, petrolPrice]);

    const formatDate = (date: Date) =>
        date.toLocaleDateString('en-IN', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        });

    const formatTime = (date: Date) => {
        const hours = date.getHours();
        const minutes = date.getMinutes();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const formattedHours = hours % 12 || 12;
        const formattedMinutes = minutes < 10 ? `0${minutes}` : minutes;
        return `${formattedHours}:${formattedMinutes} ${ampm}`;
    };

    const openDatePicker = () => {
        setPickerValue(departureDateTime);
        setShowDatePicker(true);
    };

    const openTimePicker = () => {
        setPickerValue(departureDateTime);
        setShowTimePicker(true);
    };

    const applySelectedDate = (date: Date) => {
        const next = new Date(departureDateTime);
        next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        if (next < startOfToday) {
            Alert.alert('Invalid Date', 'Please select today or a future date.');
            return;
        }
        if (time && next < new Date()) {
            Alert.alert('Invalid Date', 'This date and time are in the past. Pick a later time.');
            return;
        }
        setDepartureDateTime(next);
        setDateLabel(formatDate(next));
    };

    const applySelectedTime = (date: Date) => {
        const next = new Date(departureDateTime);
        next.setHours(date.getHours(), date.getMinutes(), 0, 0);
        if (next < new Date()) {
            Alert.alert('Invalid Time', 'Please select a future date and time.');
            return;
        }
        setDepartureDateTime(next);
        setTime(formatTime(next));
        setDateLabel(formatDate(next));
    };

    const handleDateChange = (event: any, date?: Date) => {
        if (Platform.OS === 'android') {
            setShowDatePicker(false);
        }
        if (event.type === 'dismissed' || !date) return;
        applySelectedDate(date);
    };

    const handleTimeChange = (event: any, date?: Date) => {
        if (Platform.OS === 'android') {
            setShowTimePicker(false);
        }
        if (event.type === 'dismissed' || !date) return;
        applySelectedTime(date);
    };

    const confirmIosDate = () => {
        applySelectedDate(pickerValue);
        setShowDatePicker(false);
    };

    const confirmIosTime = () => {
        applySelectedTime(pickerValue);
        setShowTimePicker(false);
    };

    const handlePublish = async () => {
        if (!from || !to || !dateLabel || !time || !price) {
            Alert.alert('Error', 'Please fill in route, date, time, and price.');
            return;
        }
        if (departureDateTime < new Date()) {
            Alert.alert('Error', 'Departure must be in the future.');
            return;
        }

        const seatCount = parseInt(seats, 10);
        const pricePerSeat = parseInt(price, 10);
        if (!seatCount || seatCount < 1) {
            Alert.alert('Error', 'Enter at least 1 available seat.');
            return;
        }
        if (!pricePerSeat || pricePerSeat < 1) {
            Alert.alert('Error', 'Enter a valid price per seat.');
            return;
        }

        setLoading(true);
        try {
            const payload = {
                from_location: from,
                to_location: to,
                departure_time: departureDateTime.toISOString(),
                available_seats: seatCount,
                price_per_seat: pricePerSeat,
            };

            if (isEditMode && editRideId) {
                const bookings = await countActiveBookingsForRide(editRideId);
                if (bookings > 0) {
                    Alert.alert(
                        'Cannot edit',
                        'Someone booked this ride while you were editing. Changes were not saved.'
                    );
                    return;
                }
                await updateRide(editRideId, payload);
                Alert.alert('Updated ✅', 'Your ride has been updated.', [
                    { text: 'OK', onPress: () => router.replace('/myrides') },
                ]);
            } else {
                await createRide({
                    ...payload,
                    driver_name: driverPhone,
                    status: 'active',
                });
                Alert.alert('Success 🎉', 'Your ride has been published!', [
                    { text: 'OK', onPress: () => router.replace('/') },
                ]);
            }
        } catch (error: any) {
            const msg =
                error?.response?.data?.errors?.[0]?.message ||
                error?.message ||
                'Could not save ride. Try again.';
            console.error('save ride error:', error?.response?.data || error);
            Alert.alert('Error', msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
                <View style={styles.headerTopRow}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton} hitSlop={12}>
                        <Text style={styles.backText}>← Back</Text>
                    </TouchableOpacity>
                    <ProfileNavButton size={40} variant="light" />
                </View>
                <View style={styles.headerText}>
                    <Text style={styles.title}>{isEditMode ? 'Edit Ride' : 'Offer a Ride'}</Text>
                    <Text style={styles.sub}>
                        {isEditMode
                            ? 'Update details before anyone books'
                            : 'Share your commute, earn money'}
                    </Text>
                </View>
            </View>

            {loadingRide ? (
                <ActivityIndicator size="large" color="#1a73e8" style={styles.pageLoader} />
            ) : null}

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.flex}
            >
                <View style={styles.locationSection}>
                    <View style={styles.routeCard}>
                        <View style={styles.routeLine} pointerEvents="none" />
                        <View style={[styles.fieldWrap, styles.fieldWrapTop]}>
                            <LocationInput
                                variant="pickup"
                                placeholder="e.g. Wakad, Pune"
                                initialValue={from}
                                onLocationSelect={(address) => setFrom(address)}
                            />
                        </View>
                        <View style={styles.fieldWrap}>
                            <LocationInput
                                variant="dropoff"
                                placeholder="e.g. Hinjewadi Phase 1"
                                initialValue={to}
                                onLocationSelect={(address) => setTo(address)}
                            />
                        </View>
                    </View>
                </View>

                <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                <View style={styles.form}>
                    <View style={styles.row}>
                        <View style={styles.halfWidth}>
                            <Text style={styles.label}>Departure Date</Text>
                            <TouchableOpacity
                                style={styles.timeInput}
                                onPress={openDatePicker}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.timeIcon}>📅</Text>
                                <Text style={[styles.timeText, !dateLabel && styles.timePlaceholder]}>
                                    {dateLabel || 'Select date'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                        <View style={styles.halfWidth}>
                            <Text style={styles.label}>Departure Time</Text>
                            <TouchableOpacity
                                style={styles.timeInput}
                                onPress={openTimePicker}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.timeIcon}>🕐</Text>
                                <Text style={[styles.timeText, !time && styles.timePlaceholder]}>
                                    {time || 'Select time'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.row}>
                        <View style={styles.halfWidth}>
                            <Text style={styles.label}>Available Seats</Text>
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
                                Based on the fuel prices • 15km/L mileage • route distance
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
                        style={[styles.publishButton, (loading || loadingRide) && styles.buttonDisabled]}
                        onPress={handlePublish}
                        disabled={loading || loadingRide}>
                        {loading
                            ? <ActivityIndicator color="#fff" />
                            : (
                                <Text style={styles.publishButtonText}>
                                    {isEditMode ? 'Save changes ✅' : 'Publish Ride 🚗'}
                                </Text>
                            )}
                    </TouchableOpacity>
                </View>
                </ScrollView>
            </KeyboardAvoidingView>

            {showDatePicker && Platform.OS === 'android' && (
                <DateTimePicker
                    value={departureDateTime}
                    mode="date"
                    display="default"
                    minimumDate={new Date()}
                    onChange={handleDateChange}
                />
            )}

            {showTimePicker && Platform.OS === 'android' && (
                <DateTimePicker
                    value={departureDateTime}
                    mode="time"
                    is24Hour={false}
                    display="default"
                    onChange={handleTimeChange}
                />
            )}

            {Platform.OS === 'ios' && (
                <Modal visible={showDatePicker} transparent animationType="slide">
                    <View style={styles.pickerOverlay}>
                        <View style={styles.pickerSheet}>
                            <View style={styles.pickerHeader}>
                                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                                    <Text style={styles.pickerAction}>Cancel</Text>
                                </TouchableOpacity>
                                <Text style={styles.pickerTitle}>Departure Date</Text>
                                <TouchableOpacity onPress={confirmIosDate}>
                                    <Text style={[styles.pickerAction, styles.pickerDone]}>Done</Text>
                                </TouchableOpacity>
                            </View>
                            <DateTimePicker
                                value={pickerValue}
                                mode="date"
                                display="spinner"
                                minimumDate={new Date()}
                                style={styles.iosPicker}
                                onChange={(_, date) => date && setPickerValue(date)}
                            />
                        </View>
                    </View>
                </Modal>
            )}

            {Platform.OS === 'ios' && (
                <Modal visible={showTimePicker} transparent animationType="slide">
                    <View style={styles.pickerOverlay}>
                        <View style={styles.pickerSheet}>
                            <View style={styles.pickerHeader}>
                                <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                                    <Text style={styles.pickerAction}>Cancel</Text>
                                </TouchableOpacity>
                                <Text style={styles.pickerTitle}>Departure Time</Text>
                                <TouchableOpacity onPress={confirmIosTime}>
                                    <Text style={[styles.pickerAction, styles.pickerDone]}>Done</Text>
                                </TouchableOpacity>
                            </View>
                            <DateTimePicker
                                value={pickerValue}
                                mode="time"
                                is24Hour={false}
                                display="spinner"
                                style={styles.iosPicker}
                                onChange={(_, date) => date && setPickerValue(date)}
                            />
                        </View>
                    </View>
                </Modal>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    buttonDisabled: { backgroundColor: '#93b8f5' },
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    pageLoader: { marginVertical: 24 },
    flex: { flex: 1 },
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
    locationSection: {
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 8,
        zIndex: 9999,
        overflow: 'visible',
    },
    header: {
        backgroundColor: '#1a73e8',
        paddingHorizontal: 24,
        paddingBottom: 24,
    },
    backButton: { marginBottom: 0 },
    backText: { color: '#fff', fontSize: 16, fontWeight: '600', opacity: 0.95 },
    headerTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    headerText: { flex: 1 },
    title: { color: '#fff', fontSize: 26, fontWeight: 'bold' },
    sub: { color: '#fff', fontSize: 16, opacity: 0.9, marginTop: 4 },
    form: { paddingHorizontal: 20, paddingTop: 8, gap: 16 },
    routeCard: {
        width: '100%',
        position: 'relative',
    },
    routeLine: {
        position: 'absolute',
        left: 16,
        top: 34,
        width: 2,
        height: 44,
        backgroundColor: '#dadce0',
        zIndex: 1,
    },
    fieldWrap: {
        width: '100%',
        zIndex: 10,
    },
    fieldWrapTop: {
        marginBottom: 12,
        zIndex: 20,
    },
    label: { fontSize: 15, fontWeight: '600', color: '#333', marginBottom: 6 },
    input: {
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 15,
        color: '#333',
        height: 48,
    },
    timeInput: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 12,
        paddingHorizontal: 14,
        height: 48,
    },
    timeIcon: { fontSize: 15, marginRight: 8 },
    timeText: { fontSize: 15, color: '#333', flex: 1 },
    timePlaceholder: { color: '#999' },
    pickerOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    pickerSheet: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        paddingBottom: 24,
    },
    pickerHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    pickerTitle: { fontSize: 16, fontWeight: '600', color: '#333' },
    pickerAction: { fontSize: 16, color: '#666' },
    pickerDone: { color: '#1a73e8', fontWeight: '600' },
    iosPicker: { height: 180 },
    row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    halfWidth: { flex: 1 },
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