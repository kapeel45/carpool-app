import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';

const GOOGLE_MAPS_API_KEY = 'AIzaSyBhjfn1ZfqiR4zSGT8clhe2Yc-X8FYifF8';

interface LocationInputProps {
    placeholder: string;
    onLocationSelect: (address: string) => void;
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

    useEffect(() => {
        if (initialValue && ref.current?.setAddressText) {
            ref.current.setAddressText(initialValue);
        }
    }, [initialValue]);

    const handleClear = () => {
        ref.current?.clear();
        onLocationSelect('');
    };

    return (
        <View style={styles.wrapper}>
            <GooglePlacesAutocomplete
                ref={ref}
                placeholder={placeholder}
                onPress={(data) => {
                    onLocationSelect(data.description);
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
                                    variant === 'pickup' ? styles.pickup : styles.dropoff,
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
                fetchDetails={false}
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
});