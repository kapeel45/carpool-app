import { useRouter } from 'expo-router';
import { useState } from 'react';
import { SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function LoginScreen() {
    const router = useRouter();
    const [phone, setPhone] = useState('');
    const [otpSent, setOtpSent] = useState(false);
    const [otp, setOtp] = useState('');

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.logo}>🚗</Text>
                <Text style={styles.title}>CarpoolApp</Text>
                <Text style={styles.sub}>Pune&apos;s smartest commute</Text>
            </View>

            <View style={styles.form}>
                {!otpSent ? (
                    <>
                        <Text style={styles.label}>Enter your mobile number</Text>
                        <View style={styles.phoneRow}>
                            <Text style={styles.code}>+91</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="98765 43210"
                                keyboardType="phone-pad"
                                maxLength={10}
                                value={phone}
                                onChangeText={setPhone}
                            />
                        </View>
                        <TouchableOpacity
                            style={[styles.button, phone.length !== 10 && styles.buttonDisabled]}
                            onPress={() => phone.length === 10 && setOtpSent(true)}
                        >
                            <Text style={styles.buttonText}>Send OTP</Text>
                        </TouchableOpacity>
                    </>
                ) : (
                    <>
                        <Text style={styles.label}>Enter OTP sent to +91 {phone}</Text>
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
                            style={[styles.button, otp.length !== 6 && styles.buttonDisabled]}
                            onPress={() => otp.length === 6 && router.push('/search')}
                        >
                            <Text style={styles.buttonText}>Verify & Login</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setOtpSent(false)}>
                            <Text style={styles.resend}>← Change number</Text>
                        </TouchableOpacity>
                    </>
                )}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    header: { alignItems: 'center', paddingTop: 60, paddingBottom: 40, backgroundColor: '#1a73e8' },
    logo: { fontSize: 56 },
    title: { fontSize: 28, fontWeight: 'bold', color: '#fff', marginTop: 8 },
    sub: { fontSize: 14, color: '#fff', opacity: 0.85, marginTop: 4 },
    form: { padding: 24, marginTop: 16 },
    label: { fontSize: 16, color: '#333', marginBottom: 12, fontWeight: '500' },
    phoneRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#1a73e8', borderRadius: 12, marginBottom: 24, overflow: 'hidden' },
    code: { backgroundColor: '#f0f5ff', padding: 16, fontSize: 16, fontWeight: 'bold', color: '#1a73e8' },
    input: { flex: 1, padding: 16, fontSize: 16 },
    otpInput: { borderWidth: 1.5, borderColor: '#1a73e8', borderRadius: 12, padding: 16, fontSize: 24, letterSpacing: 8, marginBottom: 24 },
    button: { backgroundColor: '#1a73e8', borderRadius: 12, padding: 16, alignItems: 'center' },
    buttonDisabled: { backgroundColor: '#93b8f5' },
    buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    resend: { textAlign: 'center', marginTop: 16, color: '#1a73e8', fontSize: 14 },
});