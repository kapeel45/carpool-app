import { StyleSheet, Text, View } from 'react-native';
import ProfileAvatar from './ProfileAvatar';

type Props = {
    name?: string;
    photoUrl?: string | null;
    subtitle?: string;
    size?: number;
};

/** Owner row for ride cards — avatar + name (+ optional subtitle). */
export default function RideOwnerRow({ name, photoUrl, subtitle, size = 40 }: Props) {
    return (
        <View style={styles.row}>
            <ProfileAvatar name={name} photoUrl={photoUrl} size={size} />
            <View style={styles.textBlock}>
                <Text style={styles.name} numberOfLines={1}>
                    {name || 'Owner'}
                </Text>
                {subtitle ? (
                    <Text style={styles.subtitle} numberOfLines={1}>
                        {subtitle}
                    </Text>
                ) : null}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
    textBlock: { flex: 1, minWidth: 0 },
    name: { fontSize: 16, fontWeight: '700', color: '#333' },
    subtitle: { fontSize: 12, color: '#666', marginTop: 2 },
});
