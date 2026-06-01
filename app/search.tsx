import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LocationInput from './components/LocationInput';
import RideMap from './components/RideMap';
import { getRides, createBooking, resolveOwnerInfo, filterRidesForFind, FIND_RIDE_REFRESH_MS } from './config/api';
import { getGenderDisplay } from './config/gender';
import { getSession } from './config/session';

const formatRideTime = (value?: string) => {
    if (!value) return 'Time TBD';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('en-IN', {
        weekday: 'short',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });
};

export default function SearchScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [rides, setRides] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [userPhone, setUserPhone] = useState('');
    const [bookedIds, setBookedIds] = useState<Set<string>>(new Set());
    const [bookingRideId, setBookingRideId] = useState<string | null>(null);
    const [driverProfiles, setDriverProfiles] = useState<
        Record<string, { name: string; gender?: string }>
    >({});

    useEffect(() => {
        const checkSession = async () => {
            const session = await getSession();
            if (session?.loggedIn) {
                setUserPhone(session.phone);
            }
        };
        checkSession();
    }, []);

    useEffect(() => {
        if (!userPhone) return;
        const interval = setInterval(() => {
            setRides((prev) => filterRidesForFind(prev, userPhone));
        }, FIND_RIDE_REFRESH_MS);
        return () => clearInterval(interval);
    }, [userPhone]);

    useEffect(() => {
        if (rides.length === 0) {
            setDriverProfiles({});
            return;
        }

        let cancelled = false;
        const loadDriverProfiles = async () => {
            const cache = new Map<string, { name: string; gender?: string }>();
            const entries: Record<string, { name: string; gender?: string }> = {};

            for (const ride of rides) {
                const raw = ride.driver_name || ride.driver_phone || '';
                const key = ride.id.toString();
                if (!cache.has(raw)) {
                    cache.set(raw, await resolveOwnerInfo(raw));
                }
                entries[key] = cache.get(raw)!;
            }

            if (!cancelled) setDriverProfiles(entries);
        };

        loadDriverProfiles();
        return () => {
            cancelled = true;
        };
    }, [rides]);

    const handleSearch = async () => {
        if (!from || !to) {
            Alert.alert('Missing Info', 'Please enter both pickup and destination.');
            return;
        }
        setLoading(true);
        try {
            const data = await getRides();
            const filtered = filterRidesForFind(
                data.filter((ride: any) => {
                    const rideFrom = ride.from_location?.toLowerCase() || '';
                    const rideTo = ride.to_location?.toLowerCase() || '';
                    const searchFrom = from.toLowerCase().trim();
                    const searchTo = to.toLowerCase().trim();
                    return rideFrom.includes(searchFrom) && rideTo.includes(searchTo);
                }),
                userPhone
            );
            setRides(filtered);
            setSearched(true);
        } catch (error) {
            Alert.alert('Error', 'Could not fetch rides. Try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleBook = async (item: any) => {
        const rideId = item.id.toString();
        if (bookedIds.has(rideId) || bookingRideId === rideId) return;

        setBookingRideId(rideId);
        try {
            const session = await getSession();
            if (!session?.loggedIn) {
                Alert.alert('Login Required', 'Please log in to book a ride.');
                router.push('/login');
                return;
            }
            await createBooking({
                ride_id: rideId,
                rider_name: session?.name || session?.phone,
                rider_phone: session?.phone,
                seats_booked: 1,
                total_price: parseInt(item.price_per_seat),
                payment_status: 'pending',
            });
            setBookedIds((prev) => new Set(prev).add(rideId));
        } catch (error) {
            Alert.alert('Error', 'Could not book this ride. Try again.');
        } finally {
            setBookingRideId(null);
        }
    };

    const getDriverPhone = (item: any) => {
        const raw = item.driver_phone || item.driver_name || '';
        const digits = raw.replace(/\D/g, '').slice(-10);
        return digits.length === 10 ? digits : null;
    };

    const handleCallDriver = (item: any) => {
        const phone = getDriverPhone(item);
        if (phone) {
            Linking.openURL(`tel:${phone}`);
        } else {
            Alert.alert('Unavailable', 'Ride owner phone number not available.');
        }
    };

    const handleCancelBooking = (rideId: string) => {
        Alert.alert(
            'Cancel Booking?',
            'Are you sure you want to cancel this booking?',
            [
                { text: 'No, Keep It', style: 'cancel' },
                {
                    text: 'Yes, Cancel',
                    style: 'destructive',
                    onPress: () => {
                        setBookedIds((prev) => {
                            const next = new Set(prev);
                            next.delete(rideId);
                            return next;
                        });
                    },
                },
            ]
        );
    };

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton} hitSlop={12}>
                    <Text style={styles.backText}>← Back</Text>
                </TouchableOpacity>
                <View style={styles.headerText}>
                    <Text style={styles.title}>Find a Ride</Text>
                    <Text style={styles.subtitle}>Search carpools on your route</Text>
                </View>
            </View>

            <View style={styles.searchContainer}>
                <View style={styles.routeCard}>
                    <View style={styles.routeLine} pointerEvents="none" />
                    <View style={[styles.fieldWrap, styles.fieldWrapTop]}>
                        <LocationInput
                            variant="pickup"
                            placeholder="From where?"
                            onLocationSelect={(address) => setFrom(address)}
                        />
                    </View>
                    <View style={styles.fieldWrap}>
                        <LocationInput
                            variant="dropoff"
                            placeholder="Going to?"
                            onLocationSelect={(address) => setTo(address)}
                        />
                    </View>
                </View>

                <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
                    <Text style={styles.searchText}>Search Rides 🔍</Text>
                </TouchableOpacity>
            </View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                {loading && (
                    <ActivityIndicator size="large" color="#1a73e8" style={styles.loader} />
                )}

                {searched && !loading && rides.length === 0 && (
                    <View style={styles.empty}>
                        <Text style={styles.emptyIcon}>🚗</Text>
                        <Text style={styles.emptyText}>No rides found for this route</Text>
                    </View>
                )}

                {searched && !loading && rides.length > 0 && rides.map((item) => {
                    const rideId = item.id.toString();
                    const isBooked = bookedIds.has(rideId);
                    const isBooking = bookingRideId === rideId;
                    const driver = driverProfiles[rideId];
                    const driverName = driver?.name || item.driver_name || 'Owner';
                    const genderDisplay = getGenderDisplay(driver?.gender);

                    return (
                        <View key={rideId} style={styles.rideCard}>
                            <View style={styles.rideTop}>
                                <View style={styles.driverBlock}>
                                    <Text style={styles.driverName}>🧑 {driverName}</Text>
                                    {genderDisplay ? (
                                        <Text style={styles.genderMeta}>
                                            {genderDisplay.icon} {genderDisplay.label}
                                        </Text>
                                    ) : null}
                                </View>
                                <Text style={styles.price}>₹{item.price_per_seat}</Text>
                            </View>
                            <View style={styles.rideMiddle}>
                                <View style={styles.routeBlock}>
                                    <Text style={styles.route}>{item.from_location} → {item.to_location}</Text>
                                    <Text style={styles.meta}>🕐 {formatRideTime(item.departure_time)}</Text>
                                </View>
                            </View>
                            <View style={styles.rideBottom}>
                                <Text style={styles.meta}>💺 {item.available_seats} seats left</Text>
                                {isBooking ? (
                                    <View style={[styles.bookButton, styles.bookingButton]}>
                                        <Text style={styles.bookText}>Booking...</Text>
                                    </View>
                                ) : isBooked ? (
                                    <View style={[styles.bookButton, styles.bookedButton, styles.bookedToggle]}>
                                        <TouchableOpacity
                                            style={styles.callPart}
                                            onPress={() => handleCallDriver(item)}
                                        >
                                            <Text style={styles.bookText}>📞</Text>
                                        </TouchableOpacity>
                                        <View style={styles.bookedDivider} />
                                        <TouchableOpacity
                                            style={styles.bookedPart}
                                            onPress={() => handleCancelBooking(rideId)}
                                        >
                                            <Text style={styles.bookText}>Cancel</Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <TouchableOpacity
                                        style={styles.bookButton}
                                        onPress={() => handleBook(item)}
                                    >
                                        <Text style={styles.bookText}>Book</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                            <RideMap
                                fromLocation={item.from_location}
                                toLocation={item.to_location}
                                viaPoints={item.via_points ? item.via_points.split(',') : []}
                                height={150}
                            />
                        </View>
                    );
                })}

                {!searched && !loading && (
                    <View style={styles.empty}>
                        <Text style={styles.emptyIcon}>🚗</Text>
                        <Text style={styles.emptyText}>Enter your route to find rides</Text>
                        {userPhone ? (
                            <TouchableOpacity
                                style={styles.myRidesLink}
                                onPress={() => router.push('/myrides')}
                            >
                                <Text style={styles.myRidesLinkText}>
                                    View your offered rides in My Rides →
                                </Text>
                            </TouchableOpacity>
                        ) : null}
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 20, paddingBottom: 24 },
    header: {
        backgroundColor: '#1a73e8',
        paddingHorizontal: 24,
        paddingBottom: 24,
    },
    backButton: { marginBottom: 12 },
    backText: { color: '#fff', fontSize: 16, fontWeight: '600', opacity: 0.95 },
    headerText: { flex: 1 },
    title: { color: '#fff', fontSize: 26, fontWeight: 'bold' },
    subtitle: { color: '#fff', fontSize: 16, opacity: 0.9, marginTop: 4 },
    searchContainer: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        marginHorizontal: 20,
        marginBottom: 12,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        zIndex: 9999,
        overflow: 'visible',
    },
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
    searchButton: {
        backgroundColor: '#1a73e8',
        borderRadius: 12,
        padding: 14,
        alignItems: 'center',
        marginTop: 12,
        shadowColor: '#1a73e8',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
        elevation: 3,
    },
    searchText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
    loader: { marginVertical: 40 },
    rideCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, elevation: 2 },
    rideTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, alignItems: 'flex-start' },
    driverBlock: { flex: 1, paddingRight: 8 },
    driverName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
    genderMeta: { fontSize: 13, color: '#666', marginTop: 4 },
    price: { fontSize: 18, fontWeight: 'bold', color: '#1a73e8' },
    rideMiddle: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
    routeBlock: { flex: 1, gap: 4 },
    route: { fontSize: 14, color: '#555', flexWrap: 'wrap' },
    rideBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    meta: { fontSize: 13, color: '#666' },
    bookButton: { backgroundColor: '#1a73e8', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8, minWidth: 96, alignItems: 'center' },
    bookedButton: { backgroundColor: '#34a853', paddingHorizontal: 0, paddingVertical: 0 },
    bookedToggle: { flexDirection: 'row', alignItems: 'stretch' },
    callPart: { paddingHorizontal: 14, paddingVertical: 8, justifyContent: 'center', alignItems: 'center' },
    bookedPart: { paddingHorizontal: 14, paddingVertical: 8, justifyContent: 'center', alignItems: 'center' },
    bookedDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.35)', marginVertical: 8 },
    bookingButton: { backgroundColor: '#93b8f5' },
    bookText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
    empty: { alignItems: 'center', paddingVertical: 40 },
    emptyIcon: { fontSize: 64, marginBottom: 16 },
    emptyText: { fontSize: 16, color: '#999', textAlign: 'center' },
    myRidesLink: { marginTop: 16, paddingVertical: 10, paddingHorizontal: 16 },
    myRidesLinkText: { color: '#1a73e8', fontSize: 14, fontWeight: '600' },
});