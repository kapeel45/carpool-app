import { StyleSheet, Text, View } from 'react-native';

interface RideMapProps {
    fromLocation: string;
    toLocation: string;
    viaPoints?: string[];
    height?: number;
}

export default function RideMap({ fromLocation, toLocation, height = 200 }: RideMapProps) {
    return (
        <View style={[styles.container, { height }]}>
            <Text style={styles.icon}>🗺️</Text>
            <Text style={styles.text}>{fromLocation} → {toLocation}</Text>
            <Text style={styles.sub}>Map available on mobile</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { backgroundColor: '#f0f5ff', borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    icon: { fontSize: 32, marginBottom: 8 },
    text: { fontSize: 14, fontWeight: '600', color: '#1a73e8' },
    sub: { fontSize: 12, color: '#999', marginTop: 4 },
});