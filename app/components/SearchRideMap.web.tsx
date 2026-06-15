import { StyleSheet, Text, View } from 'react-native';
import { formatDistanceMiles } from '../config/geo';
import type { SearchRideMapProps } from './SearchRideMap';

export default function SearchRideMap({
    rideFromLocation,
    rideToLocation,
    pickupDistanceMiles,
    dropDistanceMiles,
    height = 180,
}: SearchRideMapProps) {
    return (
        <View style={[styles.container, { minHeight: height }]}>
            <Text style={styles.icon}>🗺️</Text>
            <Text style={styles.text}>
                {rideFromLocation} → {rideToLocation}
            </Text>
            {pickupDistanceMiles != null ? (
                <Text style={styles.distance}>
                    Your pickup: {formatDistanceMiles(pickupDistanceMiles)} from ride start
                </Text>
            ) : null}
            {dropDistanceMiles != null ? (
                <Text style={styles.distance}>
                    Your drop: {formatDistanceMiles(dropDistanceMiles)} from ride end
                </Text>
            ) : null}
            <Text style={styles.sub}>Map available on mobile</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#f0f5ff',
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 12,
    },
    icon: { fontSize: 28, marginBottom: 6 },
    text: { fontSize: 13, fontWeight: '600', color: '#1a73e8', textAlign: 'center' },
    distance: { fontSize: 12, color: '#444', marginTop: 6, textAlign: 'center' },
    sub: { fontSize: 11, color: '#999', marginTop: 6 },
});
