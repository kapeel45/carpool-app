import { useRouter } from 'expo-router';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { useSessionProfile } from '@/hooks/use-session-profile';
import ProfileAvatar from './ProfileAvatar';

type Props = {
    size?: number;
    variant?: 'light' | 'dark';
};

export default function ProfileNavButton({ size = 44, variant = 'light' }: Props) {
    const router = useRouter();
    const { name, photoUrl, loggedIn, loading } = useSessionProfile();

    if (!loggedIn && !loading) return null;

    const borderColor = variant === 'light' ? 'rgba(255,255,255,0.35)' : '#ddd';

    return (
        <TouchableOpacity
            onPress={() => router.push('/profile')}
            style={styles.button}
            hitSlop={8}
            accessibilityLabel="Open profile"
        >
            <ProfileAvatar
                name={name}
                photoUrl={photoUrl}
                size={size}
                uploading={loading && !photoUrl}
                borderWidth={1}
                borderColor={borderColor}
            />
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    button: { borderRadius: 999 },
});
