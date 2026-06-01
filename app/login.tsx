import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { createUser, findUserByPhone, updateUserProfile } from './config/api';
import { getSession, saveSession } from './config/session';

type LoginStep = 'phone' | 'set_mpin' | 'enter_mpin';

export default function LoginScreen() {
    const router = useRouter();
    const [phone, setPhone] = useState('');
    const [mpin, setMpin] = useState('');
    const [confirmMpin, setConfirmMpin] = useState('');
    const [step, setStep] = useState<LoginStep>('phone');
    const [loading, setLoading] = useState(false);
    const [existingUser, setExistingUser] = useState<any>(null);

    useEffect(() => {
        const checkExistingSession = async () => {
            const session = await getSession();
            if (session?.loggedIn) {
                router.replace('/search');
            }
        };
        checkExistingSession();
    }, []);

    const handlePhoneSubmit = async () => {
        if (phone.length !== 10) return;
        setLoading(true);
        try {
            const user = await findUserByPhone(phone);
            if (user) {
                setExistingUser(user);
                setStep(user.mpin ? 'enter_mpin' : 'set_mpin');
                return;
            }

            const newUser = await createUser(phone);
            setExistingUser(newUser);
            setStep('set_mpin');
        } catch (error) {
            console.error('Login error:', error);
            Alert.alert('Error', 'Could not connect. Check your internet and try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleSetMpin = async () => {
        if (mpin.length !== 4) {
            Alert.alert('Invalid MPIN', 'MPIN must be 4 digits.');
            return;
        }
        if (mpin !== confirmMpin) {
            Alert.alert('Mismatch', 'MPINs do not match. Try again.');
            setMpin('');
            setConfirmMpin('');
            return;
        }
        setLoading(true);
        try {
            await updateUserProfile(existingUser.id, { mpin });
            await saveSession({
                loggedIn: true,
                userId: existingUser.id,
                phone: existingUser.phone,
                name: existingUser.name,
                gender: existingUser.gender,
                email: existingUser.email,
                emailVerified: existingUser.email_verified,
            });
            router.replace('/search');
        } catch (error) {
            Alert.alert('Error', 'Could not set MPIN. Try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyMpin = async () => {
        if (mpin.length !== 4) return;
        setLoading(true);
        try {
            if (mpin === existingUser.mpin) {
                await saveSession({
                    loggedIn: true,
                    userId: existingUser.id,
                    phone: existingUser.phone,
                    name: existingUser.name,
                    gender: existingUser.gender,
                    email: existingUser.email,
                    emailVerified: existingUser.email_verified,
                });
                router.replace('/search');
            } else {
                Alert.alert('Wrong MPIN', 'Incorrect MPIN. Please try again.');
                setMpin('');
            }
        } catch (error) {
            Alert.alert('Error', 'Login failed. Try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.logo}>🚗</Text>
                <Text style={styles.title}>CarpoolApp</Text>
                <Text style={styles.sub}>Pune's smartest commute</Text>
            </View>

            <View style={styles.form}>

                {/* STEP 1 - Phone */}
                {step === 'phone' && (
                    <>
                        <Text style={styles.stepTitle}>Enter your mobile number</Text>
                        <Text style={styles.stepSub}>We'll check if you have an account</Text>
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
                            style={[styles.button, (phone.length !== 10 || loading) && styles.buttonDisabled]}
                            onPress={handlePhoneSubmit}
                            disabled={loading}
                        >
                            {loading
                                ? <ActivityIndicator color="#fff" />
                                : <Text style={styles.buttonText}>Continue →</Text>
                            }
                        </TouchableOpacity>
                    </>
                )}

                {/* STEP 2 - Set MPIN (new user) */}
                {step === 'set_mpin' && (
                    <>
                        <Text style={styles.stepTitle}>Set your 4-digit MPIN</Text>
                        <Text style={styles.stepSub}>New number — create an MPIN to continue</Text>

                        <Text style={styles.label}>Create MPIN</Text>
                        <TextInput
                            style={styles.mpinInput}
                            placeholder="• • • •"
                            keyboardType="number-pad"
                            maxLength={4}
                            value={mpin}
                            onChangeText={setMpin}
                            textAlign="center"
                            secureTextEntry
                        />

                        <Text style={styles.label}>Confirm MPIN</Text>
                        <TextInput
                            style={styles.mpinInput}
                            placeholder="• • • •"
                            keyboardType="number-pad"
                            maxLength={4}
                            value={confirmMpin}
                            onChangeText={setConfirmMpin}
                            textAlign="center"
                            secureTextEntry
                        />

                        <TouchableOpacity
                            style={[styles.button, (mpin.length !== 4 || confirmMpin.length !== 4 || loading) && styles.buttonDisabled]}
                            onPress={handleSetMpin}
                            disabled={loading}
                        >
                            {loading
                                ? <ActivityIndicator color="#fff" />
                                : <Text style={styles.buttonText}>Set MPIN & Login</Text>
                            }
                        </TouchableOpacity>

                        <TouchableOpacity onPress={() => { setStep('phone'); setMpin(''); setConfirmMpin(''); }}>
                            <Text style={styles.back}>← Change number</Text>
                        </TouchableOpacity>
                    </>
                )}

                {/* STEP 3 - Enter MPIN (existing user) */}
                {step === 'enter_mpin' && (
                    <>
                        <Text style={styles.stepTitle}>Welcome back! 👋</Text>
                        <Text style={styles.stepSub}>+91 {phone}</Text>

                        <Text style={styles.label}>Enter your MPIN</Text>
                        <TextInput
                            style={styles.mpinInput}
                            placeholder="• • • •"
                            keyboardType="number-pad"
                            maxLength={4}
                            value={mpin}
                            onChangeText={setMpin}
                            textAlign="center"
                            secureTextEntry
                        />

                        <TouchableOpacity
                            style={[styles.button, (mpin.length !== 4 || loading) && styles.buttonDisabled]}
                            onPress={handleVerifyMpin}
                            disabled={loading}
                        >
                            {loading
                                ? <ActivityIndicator color="#fff" />
                                : <Text style={styles.buttonText}>Login →</Text>
                            }
                        </TouchableOpacity>

                        <TouchableOpacity onPress={() => { setStep('phone'); setMpin(''); }}>
                            <Text style={styles.back}>← Change number</Text>
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
    stepTitle: { fontSize: 20, fontWeight: 'bold', color: '#333', marginBottom: 6 },
    stepSub: { fontSize: 14, color: '#666', marginBottom: 24 },
    label: { fontSize: 15, fontWeight: '600', color: '#444', marginBottom: 8 },
    phoneRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#1a73e8', borderRadius: 12, marginBottom: 24, overflow: 'hidden' },
    code: { backgroundColor: '#f0f5ff', padding: 16, fontSize: 16, fontWeight: 'bold', color: '#1a73e8' },
    input: { flex: 1, padding: 16, fontSize: 16 },
    mpinInput: { borderWidth: 1.5, borderColor: '#1a73e8', borderRadius: 12, padding: 16, fontSize: 32, letterSpacing: 16, marginBottom: 20, color: '#333' },
    button: { backgroundColor: '#1a73e8', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
    buttonDisabled: { backgroundColor: '#93b8f5' },
    buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    back: { textAlign: 'center', marginTop: 16, color: '#1a73e8', fontSize: 14 },
});