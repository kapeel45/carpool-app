import React from 'react';
import { StyleSheet, View } from 'react-native';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';

const GOOGLE_MAPS_API_KEY = 'AIzaSyBhjfn1ZfqiR4zSGT8clhe2Yc-X8FYifF8';

interface LocationInputProps {
    placeholder: string;
    onLocationSelect: (address: string) => void;
}

export default function LocationInput({ placeholder, onLocationSelect }: LocationInputProps) {
    return (
        <View style={styles.container}>
            <GooglePlacesAutocomplete
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
                    textInputContainer: {
                        backgroundColor: 'transparent',
                    },
                    textInput: {
                        backgroundColor: '#fff',
                        borderWidth: 1,
                        borderColor: '#ddd',
                        borderRadius: 12,
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        fontSize: 15,
                        color: '#333',
                        height: 48,
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
                    separator: {
                        height: 1,
                        backgroundColor: '#f0f0f0',
                    },
                }}
                fetchDetails={false}
                enablePoweredByContainer={false}
                debounce={300}
                minLength={2}
                keepResultsAfterBlur={true}
                keyboardShouldPersistTaps="handled"
                listViewDisplayed={true}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        zIndex: 9999,
    },
});