import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProfileNavButton from './components/ProfileNavButton';
import {
    completeRide,
    getRideLiveTracking,
    startRide,
    updateDriverLocation,
} from './config/api';
import {
    coordsFromRide,
    geocodeAddress,
    type Coordinates,
} from './config/geo';
import { getSession } from './config/session';

export default function LiveRideScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const params = useLocalSearchParams<{
        rideId?: string;
        role?: string;
    }>();
    const rideId = typeof params.rideId === 'string' ? params.rideId : params.rideId?.[0] || '';
    const role = typeof params.role === 'string' ? params.role : params.role?.[0] || 'rider';
    const isOwner = role === 'owner';

    const [loading, setLoading] = useState(true);
    const [ride, setRide] = useState<any>(null);
    const [fromCoords, setFromCoords] = useState<Coordinates | null>(null);
    const [toCoords, setToCoords] = useState<Coordinates | null>(null);
    const [driverCoords, setDriverCoords] = useState<Coordinates | null>(null);
    const [starting, setStarting] = useState(false);
    const [ending, setEnding] = useState(false);
    const locationSub = useRef<Location.LocationSubscription | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const loadRide = async () => {
        if (!rideId) return;
        const data = await getRideLiveTracking(rideId);
        setRide(data);
        if (!data) return;

        let { from, to } = coordsFromRide(data);
        if (!from && data.from_location) from = await geocodeAddress(data.from_location);
        if (!to && data.to_location) to = await geocodeAddress(data.to_location);
        setFromCoords(from);
        setToCoords(to);

        if (data.driver_lat != null && data.driver_lng != null) {
            setDriverCoords({
                latitude: Number(data.driver_lat),
                longitude: Number(data.driver_lng),
            });
        }
    };

    useEffect(() => {
        const init = async () => {
            setLoading(true);
            await loadRide();
            setLoading(false);
        };
        init();
        return () => {
            locationSub.current?.remove();
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, [rideId]);

    useEffect(() => {
        if (!rideId || isOwner) return;

        pollRef.current = setInterval(async () => {
            const data = await getRideLiveTracking(rideId);
            if (!data) return;
            setRide(data);
            if (data.driver_lat != null && data.driver_lng != null) {
                setDriverCoords({
                    latitude: Number(data.driver_lat),
                    longitude: Number(data.driver_lng),
                });
            }
        }, 5000);

        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, [rideId, isOwner]);

    useEffect(() => {
        const trackLocation = async () => {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') return;

            locationSub.current?.remove();

            if (isOwner && ride?.trip_status === 'in_progress') {
                locationSub.current = await Location.watchPositionAsync(
                    {
                        accuracy: Location.Accuracy.Balanced,
                        timeInterval: 5000,
                        distanceInterval: 20,
                    },
                    (loc) => {
                        const coords = {
                            latitude: loc.coords.latitude,
                            longitude: loc.coords.longitude,
                        };
                        setDriverCoords(coords);
                        updateDriverLocation(rideId, coords.latitude, coords.longitude).catch(
                            () => {}
                        );
                    }
                );
            }
        };

        trackLocation();
        return () => locationSub.current?.remove();
    }, [isOwner, ride?.trip_status, rideId]);

    const handleStartRide = async () => {
        const session = await getSession();
        if (!session?.phone) {
            Alert.alert('Login required', 'Please log in first.');
            return;
        }
        setStarting(true);
        try {
            await startRide(rideId, session.phone);
            await loadRide();
            Alert.alert('Ride started', 'Riders can now see your live location.');
        } catch (error: any) {
            Alert.alert('Error', error?.message || 'Could not start ride.');
        } finally {
            setStarting(false);
        }
    };

    const handleEndRide = async () => {
        const session = await getSession();
        if (!session?.phone) return;
        Alert.alert('End ride?', 'Live tracking will stop for all riders.', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'End ride',
                onPress: async () => {
                    setEnding(true);
                    try {
                        await completeRide(rideId, session.phone);
                        locationSub.current?.remove();
                        Alert.alert('Ride completed', '', [
                            { text: 'OK', onPress: () => router.back() },
                        ]);
                    } catch (error: any) {
                        Alert.alert('Error', error?.message || 'Could not end ride.');
                    } finally {
                        setEnding(false);
                    }
                },
            },
        ]);
    };

    const tripStatus = ride?.trip_status || 'scheduled';
    const inProgress = tripStatus === 'in_progress';

    const mapPoints = [fromCoords, toCoords, driverCoords].filter(Boolean) as Coordinates[];

    const region =
        mapPoints.length > 0
            ? {
                  latitude: mapPoints.reduce((s, p) => s + p.latitude, 0) / mapPoints.length,
                  longitude: mapPoints.reduce((s, p) => s + p.longitude, 0) / mapPoints.length,
                  latitudeDelta: 0.08,
                  longitudeDelta: 0.08,
              }
            : {
                  latitude: 18.5204,
                  longitude: 73.8567,
                  latitudeDelta: 0.1,
                  longitudeDelta: 0.1,
              };

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
                <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
                    <Text style={styles.backText}>← Back</Text>
                </TouchableOpacity>
                <View style={styles.headerRow}>
                    <View style={styles.headerText}>
                        <Text style={styles.title}>{isOwner ? 'Drive live' : 'Track ride'}</Text>
                        <Text style={styles.subtitle}>
                            {inProgress ? '🟢 Live' : 'Waiting to start'}
                        </Text>
                    </View>
                    <ProfileNavButton size={36} variant="light" />
                </View>
            </View>

            {loading ? (
                <ActivityIndicator size="large" color="#1a73e8" style={styles.loader} />
            ) : (
                <>
                    <MapView
                        provider={PROVIDER_GOOGLE}
                        style={styles.map}
                        initialRegion={region}
                        showsUserLocation
                    >
                        {fromCoords ? (
                            <Marker coordinate={fromCoords} title="Ride start" pinColor="green" />
                        ) : null}
                        {toCoords ? (
                            <Marker coordinate={toCoords} title="Ride end" pinColor="red" />
                        ) : null}
                        {driverCoords ? (
                            <Marker
                                coordinate={driverCoords}
                                title={isOwner ? 'You (driver)' : 'Driver'}
                                pinColor="blue"
                            />
                        ) : null}
                        {fromCoords && toCoords ? (
                            <Polyline
                                coordinates={[fromCoords, toCoords]}
                                strokeColor="#1a73e8"
                                strokeWidth={3}
                            />
                        ) : null}
                    </MapView>

                    <View style={styles.panel}>
                        {ride ? (
                            <Text style={styles.route}>
                                {ride.from_location} → {ride.to_location}
                            </Text>
                        ) : null}
                        {!isOwner ? (
                            <Text style={styles.hint}>
                                {inProgress
                                    ? 'Your driver is sharing their location.'
                                    : 'The driver has not started the ride yet.'}
                            </Text>
                        ) : null}

                        {isOwner && !inProgress ? (
                            <TouchableOpacity
                                style={[styles.primaryButton, starting && styles.buttonDisabled]}
                                onPress={handleStartRide}
                                disabled={starting}
                            >
                                {starting ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <Text style={styles.primaryText}>Start ride & share location</Text>
                                )}
                            </TouchableOpacity>
                        ) : null}

                        {isOwner && inProgress ? (
                            <TouchableOpacity
                                style={[styles.endButton, ending && styles.buttonDisabled]}
                                onPress={handleEndRide}
                                disabled={ending}
                            >
                                {ending ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <Text style={styles.primaryText}>End ride</Text>
                                )}
                            </TouchableOpacity>
                        ) : null}
                    </View>
                </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    header: {
        backgroundColor: '#1a73e8',
        paddingHorizontal: 20,
        paddingBottom: 12,
    },
    backText: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 8 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    headerText: { flex: 1 },
    title: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
    subtitle: { color: '#fff', opacity: 0.9, marginTop: 2 },
    loader: { marginTop: 40 },
    map: { flex: 1, minHeight: 280 },
    panel: {
        backgroundColor: '#fff',
        padding: 20,
        paddingBottom: Platform.OS === 'ios' ? 28 : 20,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
    },
    route: { fontSize: 15, fontWeight: '600', color: '#333' },
    hint: { fontSize: 13, color: '#666', marginTop: 10, lineHeight: 18 },
    primaryButton: {
        backgroundColor: '#34a853',
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
        marginTop: 16,
    },
    endButton: {
        backgroundColor: '#d32f2f',
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
        marginTop: 16,
    },
    primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
    buttonDisabled: { opacity: 0.7 },
});
