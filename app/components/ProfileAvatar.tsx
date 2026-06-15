import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

type Props = {
    name?: string;
    photoUrl?: string | null;
    size?: number;
    /** Parent is uploading to server */
    uploading?: boolean;
    borderColor?: string;
    borderWidth?: number;
};

export default function ProfileAvatar({
    name,
    photoUrl,
    size = 44,
    uploading = false,
    borderColor,
    borderWidth = 0,
}: Props) {
    const [imageLoading, setImageLoading] = useState(Boolean(photoUrl));
    const [imageFailed, setImageFailed] = useState(false);

    useEffect(() => {
        if (photoUrl) {
            setImageLoading(true);
            setImageFailed(false);
        } else {
            setImageLoading(false);
            setImageFailed(false);
        }
    }, [photoUrl]);

    const initial = name?.trim()?.[0]?.toUpperCase() || '👤';
    const radius = size / 2;
    const showLoader = uploading || (Boolean(photoUrl) && imageLoading && !imageFailed);
    const showPhoto = Boolean(photoUrl) && !imageFailed;

    return (
        <View
            style={[
                styles.wrap,
                {
                    width: size,
                    height: size,
                    borderRadius: radius,
                    borderWidth,
                    borderColor: borderColor || 'transparent',
                },
            ]}
        >
            {showPhoto ? (
                <Image
                    source={{ uri: photoUrl! }}
                    style={{ width: size, height: size, borderRadius: radius }}
                    contentFit="cover"
                    transition={200}
                    onLoadStart={() => setImageLoading(true)}
                    onLoad={() => setImageLoading(false)}
                    onError={() => {
                        setImageLoading(false);
                        setImageFailed(true);
                    }}
                />
            ) : (
                <View
                    style={[
                        styles.placeholder,
                        { width: size, height: size, borderRadius: radius },
                    ]}
                >
                    <Text style={[styles.initial, { fontSize: Math.max(14, size * 0.38) }]}>
                        {initial}
                    </Text>
                </View>
            )}

            {showLoader ? (
                <View style={[styles.loaderOverlay, { borderRadius: radius }]}>
                    <ActivityIndicator color="#fff" size={size > 56 ? 'large' : 'small'} />
                </View>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { overflow: 'hidden', backgroundColor: '#e8eef7' },
    placeholder: {
        backgroundColor: '#1a73e8',
        justifyContent: 'center',
        alignItems: 'center',
    },
    initial: { color: '#fff', fontWeight: 'bold' },
    loaderOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.45)',
        justifyContent: 'center',
        alignItems: 'center',
    },
});
