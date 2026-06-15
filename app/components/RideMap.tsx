import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { geocodeAddress, type Coordinates } from '../config/geo';

interface RideMapProps {
    fromLocation: string;
    toLocation: string;
    fromCoords?: Coordinates | null;
    toCoords?: Coordinates | null;
    viaPoints?: string[];
    height?: number;
}

const GOOGLE_MAPS_API_KEY =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || 'AIzaSyBhjfn1ZfqiR4zSGT8clhe2Yc-X8FYifF8';

const getRouteCoordinates = async (
    from: Coordinates,
    to: Coordinates,
    via: Coordinates[] = []
): Promise<Coordinates[]> => {
    try {
        const waypointsStr = via.length > 0
            ? `&waypoints=${via.map(p => `${p.latitude},${p.longitude}`).join('|')}`
            : '';

        const response = await fetch(
            `https://maps.googleapis.com/maps/api/directions/json?origin=${from.latitude},${from.longitude}&destination=${to.latitude},${to.longitude}${waypointsStr}&key=${GOOGLE_MAPS_API_KEY}`
        );
        const data = await response.json();
        if (data.routes && data.routes.length > 0) {
            const points = data.routes[0].overview_polyline.points;
            return decodePolyline(points);
        }
        return [];
    } catch (error) {
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

export default function RideMap({
    fromLocation,
    toLocation,
    fromCoords: fromCoordsProp,
    toCoords: toCoordsProp,
    viaPoints = [],
    height = 200,
}: RideMapProps) {
    const [fromCoords, setFromCoords] = useState<Coordinates | null>(null);
    const [toCoords, setToCoords] = useState<Coordinates | null>(null);
    const [routeCoords, setRouteCoords] = useState<Coordinates[]>([]);
    const [viaCoords, setViaCoords] = useState<Coordinates[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadMap = async () => {
            if (!fromLocation || !toLocation) {
                setLoading(false);
                return;
            }

            setLoading(true);
            let from = fromCoordsProp || null;
            let to = toCoordsProp || null;
            if (!from) from = await geocodeAddress(fromLocation);
            if (!to) to = await geocodeAddress(toLocation);

            if (from && to) {
                setFromCoords(from);
                setToCoords(to);
                const viaCoordinates: Coordinates[] = [];
                for (const point of viaPoints) {
                    const coords = await geocodeAddress(point);
                    if (coords) viaCoordinates.push(coords);
                }
                setViaCoords(viaCoordinates);
                setRouteCoords(await getRouteCoordinates(from, to, viaCoordinates));
            } else {
                setFromCoords(from);
                setToCoords(to);
                setViaCoords([]);
                setRouteCoords([]);
            }
            setLoading(false);
        };
        loadMap();
    }, [fromLocation, toLocation, fromCoordsProp, toCoordsProp, viaPoints.join('|')]);

    if (loading) {
        return (
            <View style={[styles.container, { height }]}>
                <ActivityIndicator size="large" color="#1a73e8" />
                <Text style={styles.loadingText}>Loading map...</Text>
            </View>
        );
    }

    if (!fromCoords || !toCoords) {
        return (
            <View style={[styles.container, { height }]}>
                <Text style={styles.errorText}>Map unavailable</Text>
            </View>
        );
    }

    const midLat = (fromCoords.latitude + toCoords.latitude) / 2;
    const midLng = (fromCoords.longitude + toCoords.longitude) / 2;
    const latDelta = Math.abs(fromCoords.latitude - toCoords.latitude) * 1.5 + 0.02;
    const lngDelta = Math.abs(fromCoords.longitude - toCoords.longitude) * 1.5 + 0.02;

    return (
        <MapView
            provider={PROVIDER_GOOGLE}
            style={[styles.map, { height }]}
            initialRegion={{
                latitude: midLat,
                longitude: midLng,
                latitudeDelta: latDelta,
                longitudeDelta: lngDelta,
            }}
        >
            <Marker coordinate={fromCoords} title="Pickup" pinColor="green" />
            <Marker coordinate={toCoords} title="Drop" pinColor="red" />
            {routeCoords.length > 0 && (
                <Polyline
                    coordinates={routeCoords}
                    strokeColor="#1a73e8"
                    strokeWidth={4}
                />
            )}
            {viaCoords.map((coord, index) => (
                <Marker
                    key={`via-${index}`}
                    coordinate={coord}
                    title={`Via ${viaPoints[index]}`}
                    pinColor="orange"
                />
            ))}
        </MapView>
    );
}

const styles = StyleSheet.create({
    container: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f5ff', borderRadius: 12 },
    map: { width: '100%', borderRadius: 12 },
    loadingText: { color: '#1a73e8', marginTop: 8, fontSize: 14 },
    errorText: { color: '#999', fontSize: 14 },
});