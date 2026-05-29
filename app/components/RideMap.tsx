import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

interface RideMapProps {
    fromLocation: string;
    toLocation: string;
    viaPoints?: string[];
    height?: number;
}

interface Coordinates {
    latitude: number;
    longitude: number;
}

const GOOGLE_MAPS_API_KEY = 'AIzaSyBhjfn1ZfqiR4zSGT8clhe2Yc-X8FYifF8';

const geocodeLocation = async (location: string): Promise<Coordinates | null> => {
    try {
        const response = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location + ', Pune, India')}&key=${GOOGLE_MAPS_API_KEY}`
        );
        const data = await response.json();
        if (data.results && data.results.length > 0) {
            const { lat, lng } = data.results[0].geometry.location;
            return { latitude: lat, longitude: lng };
        }
        return null;
    } catch (error) {
        return null;
    }
};

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

export default function RideMap({ fromLocation, toLocation, viaPoints = [], height = 200 }: RideMapProps) {
    const [fromCoords, setFromCoords] = useState<Coordinates | null>(null);
    const [toCoords, setToCoords] = useState<Coordinates | null>(null);
    const [routeCoords, setRouteCoords] = useState<Coordinates[]>([]);
    const [viaCoords, setViaCoords] = useState<Coordinates[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadMap = async () => {
            setLoading(true);
            const from = await geocodeLocation(fromLocation);
            const to = await geocodeLocation(toLocation);
            if (from && to) {
                setFromCoords(from);
                setToCoords(to);
                // Geocode via points
                const viaCoordinates: Coordinates[] = [];
                for (const point of viaPoints) {
                    const coords = await geocodeLocation(point);
                    if (coords) viaCoordinates.push(coords);
                }
                setViaCoords(viaCoordinates);

                const route = await getRouteCoordinates(from, to, viaCoordinates);
                setRouteCoords(route);
            }
            setLoading(false);
        };
        if (fromLocation && toLocation) loadMap();
    }, [fromLocation, toLocation]);

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