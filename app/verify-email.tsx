import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { verifyEmailOTP } from './config/api';
import { getSession, saveSession } from './config/session';

export default function VerifyEmailScreen() {
    const router = useRouter();
    const { email } = useLocalSearchParams<{ email: string }>();
    const [otp, setOtp] = useState('');
    const [loading, setLoading] = useState(false);

    const handleVerify = async () => {
        if (otp.length !== 6) return;
        setLoading(true);
        try {
            const session = await getSession();
            const result = await verifyEmailOTP(email, otp, session.userId);
            if (result.success) {
                await saveSession({ ...session, emailVerified: true });
                Alert.alert(
                    '✅ Email Verified!',
                    'Your email has been verified. You can now offer rides!',
                    [{ text: 'Great!', onPress: () => router.replace('/profile') }]
                );
            } else {
                Alert.alert('Error', result.message || 'Invalid OTP');
                setOtp('');
            }
        } catch (error) {
            Alert.alert('Error', 'Verification failed. Try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Text style={styles.back}>← Back</Text>
                </TouchableOpacity>
                <Text style={styles.title}>Verify Email</Text>
            </View>

            <View style={styles.content}>
                <Text style={styles.emailIcon}>📧</Text>
                <Text style={styles.heading}>Check your inbox</Text>
                <Text style={styles.sub}>
                    We sent a 6-digit OTP to{'\n'}
                    <Text style={styles.email}>{email}</Text>
                </Text>

                <Text style={styles.label}>Enter OTP</Text>
                <TextInput
                    style={styles.otpInput}
                    placeholder="• • • • • •"
                    keyboardType="number-pad"
                    maxLength={6}
                    value={otp}
                    onChangeText={setOtp}
                    textAlign="center"
                />

                <TouchableOpacity
                    style={[styles.button, (otp.length !== 6 || loading) && styles.buttonDisabled]}
                    onPress={handleVerify}
                    disabled={otp.length !== 6 || loading}
                >
                    {loading
                        ? <ActivityIndicator color="#fff" />
                        : <Text style={styles.buttonText}>Verify Email ✅</Text>
                    }
                </TouchableOpacity>

                <Text style={styles.note}>OTP expires in 10 minutes</Text>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    header: { backgroundColor: '#1a73e8', padding: 24, paddingTop: 48 },
    back: { color: '#fff', fontSize: 16, opacity: 0.9, marginBottom: 8 },
    title: { color: '#fff', fontSize: 26, fontWeight: 'bold' },
    content: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center' },
    emailIcon: { fontSize: 64, marginBottom: 16 },
    heading: { fontSize: 24, fontWeight: 'bold', color: '#333', marginBottom: 8 },
    sub: { fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 32, lineHeight: 24 },
    email: { color: '#1a73e8', fontWeight: 'bold' },
    label: { fontSize: 15, fontWeight: '600', color: '#444', marginBottom: 8, alignSelf: 'flex-start' },
    otpInput: { borderWidth: 1.5, borderColor: '#1a73e8', borderRadius: 12, padding: 16, fontSize: 32, letterSpacing: 16, marginBottom: 24, color: '#333', width: '100%' },
    button: { backgroundColor: '#1a73e8', borderRadius: 12, padding: 16, alignItems: 'center', width: '100%' },
    buttonDisabled: { backgroundColor: '#93b8f5' },
    buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    note: { fontSize: 13, color: '#999', marginTop: 16 },
});
