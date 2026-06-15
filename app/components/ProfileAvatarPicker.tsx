import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import {
    Alert,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import ProfileAvatar from './ProfileAvatar';

type Props = {
    name?: string;
    photoUrl?: string | null;
    uploading?: boolean;
    onPhotoSelected: (uri: string) => void;
    onRemovePhoto?: () => void;
    size?: number;
};

export default function ProfileAvatarPicker({
    name,
    photoUrl,
    uploading = false,
    onPhotoSelected,
    onRemovePhoto,
    size = 96,
}: Props) {
    const [menuVisible, setMenuVisible] = useState(false);

    const closeMenu = () => setMenuVisible(false);

    const pickFromGallery = async () => {
        closeMenu();
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
            Alert.alert('Permission needed', 'Allow photo library access to choose a profile picture.');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.85,
        });

        if (!result.canceled && result.assets[0]?.uri) {
            onPhotoSelected(result.assets[0].uri);
        }
    };

    const takeSelfie = async () => {
        closeMenu();
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
            Alert.alert('Permission needed', 'Allow camera access to take a profile selfie.');
            return;
        }

        const result = await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.85,
        });

        if (!result.canceled && result.assets[0]?.uri) {
            onPhotoSelected(result.assets[0].uri);
        }
    };

    const handleRemove = () => {
        closeMenu();
        onRemovePhoto?.();
    };

    return (
        <>
            <TouchableOpacity
                style={[styles.wrapper, { width: size, height: size }]}
                onPress={() => !uploading && setMenuVisible(true)}
                activeOpacity={0.85}
                disabled={uploading}
            >
                <ProfileAvatar
                    name={name}
                    photoUrl={photoUrl}
                    size={size}
                    uploading={uploading}
                    borderWidth={2}
                    borderColor="#fff"
                />

                {!uploading ? (
                    <View style={styles.badge}>
                        <Text style={styles.badgeIcon}>📷</Text>
                    </View>
                ) : null}
            </TouchableOpacity>

            <Modal
                visible={menuVisible}
                transparent
                animationType="fade"
                onRequestClose={closeMenu}
            >
                <Pressable style={styles.backdrop} onPress={closeMenu}>
                    <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
                        <View style={styles.sheetHeader}>
                            <Text style={styles.sheetTitle}>Profile photo</Text>
                            <TouchableOpacity
                                onPress={closeMenu}
                                style={styles.closeButton}
                                hitSlop={12}
                                accessibilityLabel="Close"
                            >
                                <Text style={styles.closeText}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.sheetSub}>Choose how to update your picture</Text>

                        <TouchableOpacity style={styles.option} onPress={takeSelfie}>
                            <Text style={styles.optionIcon}>🤳</Text>
                            <Text style={styles.optionText}>Take selfie</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.option} onPress={pickFromGallery}>
                            <Text style={styles.optionIcon}>🖼️</Text>
                            <Text style={styles.optionText}>Choose from gallery</Text>
                        </TouchableOpacity>

                        {photoUrl && onRemovePhoto ? (
                            <TouchableOpacity
                                style={[styles.option, styles.optionDanger]}
                                onPress={handleRemove}
                            >
                                <Text style={styles.optionIcon}>🗑️</Text>
                                <Text style={[styles.optionText, styles.optionTextDanger]}>
                                    Remove photo
                                </Text>
                            </TouchableOpacity>
                        ) : null}

                        <TouchableOpacity style={styles.cancelButton} onPress={closeMenu}>
                            <Text style={styles.cancelText}>Close</Text>
                        </TouchableOpacity>
                    </Pressable>
                </Pressable>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    wrapper: { position: 'relative', marginBottom: 12 },
    badge: {
        position: 'absolute',
        right: -2,
        bottom: -2,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#333',
        borderWidth: 2,
        borderColor: '#fff',
        justifyContent: 'center',
        alignItems: 'center',
    },
    badgeIcon: { fontSize: 14 },
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 32,
    },
    sheetHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    sheetTitle: { fontSize: 18, fontWeight: '700', color: '#222' },
    closeButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#f0f0f0',
        alignItems: 'center',
        justifyContent: 'center',
    },
    closeText: { fontSize: 18, color: '#555', fontWeight: '600' },
    sheetSub: { fontSize: 14, color: '#666', marginBottom: 16 },
    option: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    optionDanger: { borderBottomWidth: 0 },
    optionIcon: { fontSize: 22, width: 28 },
    optionText: { fontSize: 16, color: '#222', fontWeight: '500' },
    optionTextDanger: { color: '#d32f2f' },
    cancelButton: {
        marginTop: 16,
        backgroundColor: '#f5f5f5',
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
    },
    cancelText: { fontSize: 16, fontWeight: '600', color: '#444' },
});
