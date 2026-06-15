import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import {
    distanceMiles,
    formatDistanceMiles,
    geocodeAddress,
    type Coordinates,
} from '../config/geo';

const GOOGLE_MAPS_API_KEY =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || 'AIzaSyBhjfn1ZfqiR4zSGT8clhe2Yc-X8FYifF8';

export interface SearchRideMapProps {
    rideFromLocation: string;
    rideToLocation: string;
    viaPoints?: string[];
    userPickupCoords?: Coordinates | null;
    userDropCoords?: Coordinates | null;
    rideFromCoords?: Coordinates | null;
    rideToCoords?: Coordinates | null;
    pickupDistanceMiles?: number;
    dropDistanceMiles?: number;
    height?: number;
}

const BluePinMarker = () => (
    <View style={styles.bluePin}>
        <View style={styles.bluePinCircle} />
        <View style={styles.bluePinPoint} />
    </View>
);

const getRouteCoordinates = async (
    from: Coordinates,
    to: Coordinates,
    via: Coordinates[] = []
): Promise<Coordinates[]> => {
    try {
        const waypointsStr =
            via.length > 0
                ? `&waypoints=${via.map((p) => `${p.latitude},${p.longitude}`).join('|')}`
                : '';

        const response = await fetch(
            `https://maps.googleapis.com/maps/api/directions/json?origin=${from.latitude},${from.longitude}&destination=${to.latitude},${to.longitude}${waypointsStr}&key=${GOOGLE_MAPS_API_KEY}`
        );
        const data = await response.json();
        if (data.routes?.[0]?.overview_polyline?.points) {
            return decodePolyline(data.routes[0].overview_polyline.points);
        }
        return [];
    } catch {
        return [];
    }
};

const decodePolyline = (encoded: string): Coordinates[] => {
    const points: Coordinates[] = [];
    let index = 0;
    let lat = 0;
    let lng = 0;

    while (index < encoded.length) {
        let shift = 0;
        let result = 0;
        let byte: number;
        do {
            byte = encoded.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);
        lat += result & 1 ? ~(result >> 1) : result >> 1;

        shift = 0;
        result = 0;
        do {
            byte = encoded.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);
        lng += result & 1 ? ~(result >> 1) : result >> 1;

        points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
    }
    return points;
};

const regionForPoints = (points: Coordinates[]) => {
    const lats = points.map((p) => p.latitude);
    const lngs = points.map((p) => p.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    return {
        latitude: (minLat + maxLat) / 2,
        longitude: (minLng + maxLng) / 2,
        latitudeDelta: Math.max(0.02, (maxLat - minLat) * 1.5 + 0.015),
        longitudeDelta: Math.max(0.02, (maxLng - minLng) * 1.5 + 0.015),
    };
};

export default function SearchRideMap({
    rideFromLocation,
    rideToLocation,
    viaPoints = [],
    userPickupCoords,
    userDropCoords,
    rideFromCoords: rideFromProp,
    rideToCoords: rideToProp,
    pickupDistanceMiles: pickupDistanceProp,
    dropDistanceMiles: dropDistanceProp,
    height = 180,
}: SearchRideMapProps) {
    const [rideFromCoords, setRideFromCoords] = useState<Coordinates | null>(rideFromProp || null);
    const [rideToCoords, setRideToCoords] = useState<Coordinates | null>(rideToProp || null);
    const [routeCoords, setRouteCoords] = useState<Coordinates[]>([]);
    const [viaCoords, setViaCoords] = useState<Coordinates[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadMap = async () => {
            setLoading(true);
            let from = rideFromProp || null;
            let to = rideToProp || null;

            if (!from) from = await geocodeAddress(rideFromLocation);
            if (!to) to = await geocodeAddress(rideToLocation);

            if (from && to) {
                setRideFromCoords(from);
                setRideToCoords(to);

                const viaCoordinates: Coordinates[] = [];
                for (const point of viaPoints) {
                    const coords = await geocodeAddress(point);
                    if (coords) viaCoordinates.push(coords);
                }
                setViaCoords(viaCoordinates);
                setRouteCoords(await getRouteCoordinates(from, to, viaCoordinates));
            } else {
                setRideFromCoords(from);
                setRideToCoords(to);
                setRouteCoords([]);
                setViaCoords([]);
            }
            setLoading(false);
        };

        if (rideFromLocation && rideToLocation) loadMap();
    }, [rideFromLocation, rideToLocation, rideFromProp, rideToProp, viaPoints.join('|')]);

    const pickupDistanceMiles = useMemo(() => {
        if (pickupDistanceProp != null) return pickupDistanceProp;
        if (userPickupCoords && rideFromCoords) {
            return distanceMiles(userPickupCoords, rideFromCoords);
        }
        return null;
    }, [pickupDistanceProp, userPickupCoords, rideFromCoords]);

    const dropDistanceMiles = useMemo(() => {
        if (dropDistanceProp != null) return dropDistanceProp;
        if (userDropCoords && rideToCoords) {
            return distanceMiles(userDropCoords, rideToCoords);
        }
        return null;
    }, [dropDistanceProp, userDropCoords, rideToCoords]);

    const showUserPickup = Boolean(userPickupCoords);
    const showUserDrop = Boolean(userDropCoords);
    const showPickupGap =
        showUserPickup && rideFromCoords && pickupDistanceMiles != null && pickupDistanceMiles > 0.02;
    const showDropGap =
        showUserDrop && rideToCoords && dropDistanceMiles != null && dropDistanceMiles > 0.02;

    if (loading) {
        return (
            <View style={[styles.container, { height }]}>
                <ActivityIndicator size="large" color="#1a73e8" />
                <Text style={styles.loadingText}>Loading map...</Text>
            </View>
        );
    }

    if (!rideFromCoords || !rideToCoords) {
        return (
            <View style={[styles.container, { height }]}>
                <Text style={styles.errorText}>Map unavailable</Text>
            </View>
        );
    }

    const mapPoints: Coordinates[] = [rideFromCoords, rideToCoords];
    if (userPickupCoords) mapPoints.push(userPickupCoords);
    if (userDropCoords) mapPoints.push(userDropCoords);

    const region = regionForPoints(mapPoints);
    const pickupLabel =
        pickupDistanceMiles != null ? formatDistanceMiles(pickupDistanceMiles) : null;
    const dropLabel = dropDistanceMiles != null ? formatDistanceMiles(dropDistanceMiles) : null;

    return (
        <View style={styles.wrapper}>
            <MapView
                provider={PROVIDER_GOOGLE}
                style={[styles.map, { height }]}
                initialRegion={region}
            >
                <Marker
                    coordinate={rideFromCoords}
                    title="Ride start"
                    description={rideFromLocation}
                    pinColor="green"
                />
                <Marker
                    coordinate={rideToCoords}
                    title="Ride end"
                    description={rideToLocation}
                    pinColor="red"
                />

                {showUserPickup ? (
                    <Marker
                        coordinate={userPickupCoords!}
                        title="Your pickup"
                        description={
                            pickupLabel
                                ? `${pickupLabel} from ride start`
                                : 'Your search pickup'
                        }
                        anchor={{ x: 0.5, y: 1 }}
                    >
                        <BluePinMarker />
                    </Marker>
                ) : null}

                {showUserDrop ? (
                    <Marker
                        coordinate={userDropCoords!}
                        title="Your drop"
                        description={
                            dropLabel ? `${dropLabel} from ride end` : 'Your search destination'
                        }
                        anchor={{ x: 0.5, y: 1 }}
                    >
                        <BluePinMarker />
                    </Marker>
                ) : null}

                {routeCoords.length > 0 ? (
                    <Polyline coordinates={routeCoords} strokeColor="#1a73e8" strokeWidth={4} />
                ) : null}

                {showPickupGap ? (
                    <Polyline
                        coordinates={[userPickupCoords!, rideFromCoords]}
                        strokeColor="#1a73e8"
                        strokeWidth={3}
                        lineDashPattern={[8, 6]}
                    />
                ) : null}

                {showDropGap ? (
                    <Polyline
                        coordinates={[userDropCoords!, rideToCoords]}
                        strokeColor="#1a73e8"
                        strokeWidth={3}
                        lineDashPattern={[8, 6]}
                    />
                ) : null}

                {viaCoords.map((coord, index) => (
                    <Marker
                        key={`via-${index}`}
                        coordinate={coord}
                        title={`Via ${viaPoints[index]}`}
                        pinColor="orange"
                    />
                ))}
            </MapView>

            {(showUserPickup || showUserDrop) && (pickupLabel || dropLabel) ? (
                <View style={styles.legend}>
                    {showUserPickup && pickupLabel ? (
                        <View style={styles.legendRow}>
                            <View style={[styles.legendDot, styles.legendDotBlue]} />
                            <Text style={styles.legendText}>
                                Your pickup · <Text style={styles.legendBold}>{pickupLabel}</Text> from
                                ride start
                            </Text>
                        </View>
                    ) : null}
                    {showUserDrop && dropLabel ? (
                        <View style={styles.legendRow}>
                            <View style={[styles.legendDot, styles.legendDotBlue]} />
                            <Text style={styles.legendText}>
                                Your drop · <Text style={styles.legendBold}>{dropLabel}</Text> from ride
                                end
                            </Text>
                        </View>
                    ) : null}
                </View>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: { marginTop: 4 },
    container: {
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f0f5ff',
        borderRadius: 12,
    },
    map: { width: '100%', borderRadius: 12 },
    loadingText: { color: '#1a73e8', marginTop: 8, fontSize: 14 },
    errorText: { color: '#999', fontSize: 14 },
    legend: {
        marginTop: 8,
        backgroundColor: '#e8f0fe',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
        gap: 4,
    },
    legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    legendDot: { width: 10, height: 10, borderRadius: 5 },
    legendDotBlue: { backgroundColor: '#1a73e8' },
    legendText: { flex: 1, fontSize: 12, color: '#444', lineHeight: 17 },
    legendBold: { fontWeight: '700', color: '#1a73e8' },
    bluePin: { alignItems: 'center', width: 24, height: 32 },
    bluePinCircle: {
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: '#1a73e8',
        borderWidth: 2,
        borderColor: '#fff',
    },
    bluePinPoint: {
        width: 0,
        height: 0,
        marginTop: -2,
        borderLeftWidth: 5,
        borderRightWidth: 5,
        borderTopWidth: 8,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderTopColor: '#1a73e8',
    },
});
