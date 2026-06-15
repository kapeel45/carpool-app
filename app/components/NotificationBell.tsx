import { useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNotifications } from '@/hooks/use-notifications';

type Props = {
    onPress?: () => void;
};

export default function NotificationBell({ onPress }: Props) {
    const router = useRouter();
    const { unreadCount } = useNotifications();

    const handlePress = () => {
        if (onPress) {
            onPress();
        } else {
            router.push('/notifications');
        }
    };

    return (
        <TouchableOpacity onPress={handlePress} style={styles.bellButton} hitSlop={12}>
            <Text style={styles.bellIcon}>🔔</Text>
            {unreadCount > 0 ? (
                <View style={styles.badge}>
                    <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
            ) : null}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    bellButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    bellIcon: { fontSize: 22 },
    badge: {
        position: 'absolute',
        top: 2,
        right: 2,
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: '#ea4335',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 4,
    },
    badgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
});
