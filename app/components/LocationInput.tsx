import React, { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import type { LocationSelection } from '../config/geo';

const GOOGLE_MAPS_API_KEY = 'AIzaSyBhjfn1ZfqiR4zSGT8clhe2Yc-X8FYifF8';

const placeLabel = (data: { description: string; structured_formatting?: { main_text?: string; secondary_text?: string } }) => {
    const main = data.structured_formatting?.main_text?.trim();
    const secondary = data.structured_formatting?.secondary_text?.trim();
    if (main && secondary) return `${main}, ${secondary}`;
    if (main) return main;
    return data.description;
};

interface LocationInputProps {
    placeholder: string;
    onLocationSelect: (selection: LocationSelection) => void;
    variant?: 'pickup' | 'dropoff';
    initialValue?: string;
}

export default function LocationInput({
    placeholder,
    onLocationSelect,
    variant,
    initialValue,
}: LocationInputProps) {
    const ref = useRef<any>(null);
    const textInputRef = useRef<TextInput>(null);

    const scrollInputToStart = useCallback(() => {
        requestAnimationFrame(() => {
            textInputRef.current?.setNativeProps({ selection: { start: 0, end: 0 } });
        });
    }, []);

    useEffect(() => {
        if (initialValue && ref.current?.setAddressText) {
            ref.current.setAddressText(initialValue);
            setTimeout(scrollInputToStart, 0);
        }
    }, [initialValue, scrollInputToStart]);

    const handleClear = () => {
        // `clear()` alone is flaky on some RN + GooglePlacesAutocomplete builds.
        ref.current?.clear?.();
        ref.current?.setAddressText?.('');
        textInputRef.current?.clear();
        textInputRef.current?.setNativeProps?.({ selection: { start: 0, end: 0 } });
        onLocationSelect({ address: '', coords: null });
    };

    return (
        <View style={styles.wrapper}>
            <GooglePlacesAutocomplete
                ref={ref}
                placeholder={placeholder}
                onPress={(data, details = null) => {
                    const lat = details?.geometry?.location?.lat;
                    const lng = details?.geometry?.location?.lng;
                    const address = placeLabel(data);
                    const selection: LocationSelection = {
                        address,
                        coords:
                            typeof lat === 'number' && typeof lng === 'number'
                                ? { latitude: lat, longitude: lng }
                                : null,
                    };
                    onLocationSelect(selection);
                    if (ref.current?.setAddressText) {
                        ref.current.setAddressText(address);
                    }
                    setTimeout(scrollInputToStart, 50);
                }}
                query={{
                    key: GOOGLE_MAPS_API_KEY,
                    language: 'en',
                    components: 'country:in',
                    location: '18.5204,73.8567',
                    radius: 50000,
                }}
                styles={{
                    container: {
                        width: '100%',
                        flex: 0,
                    },
                    textInputContainer: {
                        flexDirection: 'row',
                        alignItems: 'center',
                        width: '100%',
                        backgroundColor: '#fff',
                        borderWidth: 1,
                        borderColor: '#ddd',
                        borderRadius: 12,
                        height: 48,
                        paddingRight: 8,
                        overflow: 'hidden',
                    },
                    textInput: {
                        flex: 1,
                        minWidth: 0,
                        backgroundColor: 'transparent',
                        borderWidth: 0,
                        borderRadius: 0,
                        paddingHorizontal: 8,
                        paddingVertical: 0,
                        fontSize: 15,
                        color: '#333',
                        height: 48,
                        margin: 0,
                        textAlign: 'left',
                        textAlignVertical: 'center',
                    },
                    listView: {
                        backgroundColor: '#fff',
                        borderRadius: 12,
                        elevation: 10,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.15,
                        shadowRadius: 8,
                        position: 'absolute',
                        top: 50,
                        left: 0,
                        right: 0,
                        zIndex: 9999,
                    },
                    row: {
                        padding: 14,
                        borderBottomWidth: 1,
                        borderBottomColor: '#f0f0f0',
                        backgroundColor: '#fff',
                    },
                    description: {
                        fontSize: 14,
                        color: '#333',
                    },
                }}
                renderLeftButton={() =>
                    variant ? (
                        <View style={styles.indicatorWrap}>
                            <View
                                style={[
                                    styles.indicator,
                                    variant === 'pickup'
                                        ? styles.pickup
                                        : styles.dropoff,
                                ]}
                            />
                        </View>
                    ) : null
                }
                renderRightButton={() => (
                    <TouchableOpacity style={styles.clearButton} onPress={handleClear}>
                        <Text style={styles.clearText}>✕</Text>
                    </TouchableOpacity>
                )}
                textInputProps={{
                    ref: textInputRef,
                    multiline: false,
                    textAlign: 'left',
                    onFocus: scrollInputToStart,
                    onBlur: scrollInputToStart,
                }}
                renderRow={(data) => (
                    <View style={styles.suggestionRow}>
                        <Text style={styles.suggestionMain} numberOfLines={1}>
                            {data.structured_formatting?.main_text || data.description}
                        </Text>
                        {data.structured_formatting?.secondary_text ? (
                            <Text style={styles.suggestionSecondary} numberOfLines={1}>
                                {data.structured_formatting.secondary_text}
                            </Text>
                        ) : null}
                    </View>
                )}
                fetchDetails
                enablePoweredByContainer={false}
                debounce={300}
                minLength={2}
                keepResultsAfterBlur={true}
                keyboardShouldPersistTaps="handled"
                listViewDisplayed="auto"
                flatListProps={{
                    nestedScrollEnabled: true,
                    keyboardShouldPersistTaps: 'handled',
                }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        width: '100%',
        zIndex: 9999,
    },
    indicatorWrap: {
        width: 34,
        height: 48,
        justifyContent: 'center',
        alignItems: 'center',
    },
    indicator: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    pickup: {
        backgroundColor: '#34a853',
    },
    dropoff: {
        backgroundColor: '#ea4335',
    },
    clearButton: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#e0e0e0',
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 4,
        flexShrink: 0,
    },
    clearText: {
        fontSize: 11,
        color: '#666',
        fontWeight: 'bold',
        lineHeight: 12,
    },
    suggestionRow: {
        padding: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
        backgroundColor: '#fff',
    },
    suggestionMain: {
        fontSize: 15,
        fontWeight: '600',
        color: '#222',
        textAlign: 'left',
    },
    suggestionSecondary: {
        fontSize: 13,
        color: '#666',
        marginTop: 2,
        textAlign: 'left',
    },
});