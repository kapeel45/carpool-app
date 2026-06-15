import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import {
    buildSessionFromUser,
    createUser,
    fetchAppUserProfile,
    findUserByPhoneForAuth,
    updateUserProfile,
} from './config/api';
import { getSession, refreshSessionFromServer, saveSession } from './config/session';

type LoginStep = 'phone' | 'set_mpin' | 'enter_mpin';

export default function LoginScreen() {
    const router = useRouter();
    const [phone, setPhone] = useState('');
    const [name, setName] = useState('');
    const [mpin, setMpin] = useState('');
    const [confirmMpin, setConfirmMpin] = useState('');
    const [step, setStep] = useState<LoginStep>('phone');
    const [loading, setLoading] = useState(false);
    const [existingUser, setExistingUser] = useState<any>(null);
    const [isNewUser, setIsNewUser] = useState(false);

    const needsName = isNewUser || !existingUser?.name?.trim();

    useEffect(() => {
        const checkExistingSession = async () => {
            const session = await getSession();
            if (session?.loggedIn) {
                router.replace('/search');
            }
        };
        checkExistingSession();
    }, []);

    const finishLogin = async (userId: string | number) => {
        const user =
            (await fetchAppUserProfile({ userId })) ||
            (await fetchAppUserProfile({ phone }));
        if (!user) {
            throw new Error(
                'Account was created but could not be loaded. Log out, restart the app, and try again.'
            );
        }
        await saveSession(buildSessionFromUser(user));
        await refreshSessionFromServer();
        router.replace('/search');
    };

    const handlePhoneSubmit = async () => {
        if (phone.length !== 10) return;
        setLoading(true);
        try {
            const user = await findUserByPhoneForAuth(phone);
            setExistingUser(user);
            setIsNewUser(!user);
            setName(user?.name?.trim() || '');

            if (user?.mpin) {
                setStep('enter_mpin');
            } else {
                setStep('set_mpin');
            }
        } catch (error) {
            console.error('Login error:', error);
            Alert.alert('Error', 'Could not connect. Check your internet and try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleSetMpin = async () => {
        if (needsName && !name.trim()) {
            Alert.alert('Name required', 'Please enter your full name.');
            return;
        }
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
            let userId: string | number;

            if (isNewUser) {
                const created = await createUser(phone, name.trim());
                userId = created.id;
            } else {
                userId = existingUser.id;
                if (name.trim() && name.trim() !== existingUser?.name?.trim()) {
                    await updateUserProfile(userId, { name: name.trim() });
                }
            }

            await updateUserProfile(userId, { mpin });
            await finishLogin(userId);
        } catch (error: any) {
            const msg =
                error?.response?.data?.errors?.[0]?.message ||
                error?.message ||
                'Could not complete sign up. Try again.';
            Alert.alert('Error', msg);
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyMpin = async () => {
        if (mpin.length !== 4) return;
        if (!existingUser?.name?.trim() && !name.trim()) {
            Alert.alert('Name required', 'Please enter your name to continue.');
            return;
        }

        setLoading(true);
        try {
            if (mpin !== existingUser.mpin) {
                Alert.alert('Wrong MPIN', 'Incorrect MPIN. Please try again.');
                setMpin('');
                return;
            }

            if (!existingUser.name?.trim() && name.trim()) {
                await updateUserProfile(existingUser.id, { name: name.trim() });
            }

            await finishLogin(existingUser.id);
        } catch (error: any) {
            Alert.alert('Error', error?.message || 'Login failed. Try again.');
        } finally {
            setLoading(false);
        }
    };

    const resetToPhone = () => {
        setStep('phone');
        setMpin('');
        setConfirmMpin('');
        setName('');
        setExistingUser(null);
        setIsNewUser(false);
    };

    const welcomeName =
        existingUser?.name?.trim() ||
        name.trim() ||
        'there';

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.logo}>🚗</Text>
                <Text style={styles.title}>CarpoolApp</Text>
                <Text style={styles.sub}>Pune's smartest commute</Text>
            </View>

            <View style={styles.form}>
                {step === 'phone' && (
                    <>
                        <Text style={styles.stepTitle}>Sign in or sign up</Text>
                        <Text style={styles.stepSub}>
                            Your mobile number is your unique account ID
                        </Text>
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
                            {loading ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.buttonText}>Continue →</Text>
                            )}
                        </TouchableOpacity>
                    </>
                )}

                {step === 'set_mpin' && (
                    <>
                        <Text style={styles.stepTitle}>
                            {isNewUser ? 'Create your account' : 'Complete your profile'}
                        </Text>
                        <Text style={styles.stepSub}>
                            {isNewUser
                                ? `+91 ${phone} • one account per mobile number`
                                : `+91 ${phone}`}
                        </Text>

                        {needsName && (
                            <>
                                <Text style={styles.label}>Full name</Text>
                                <TextInput
                                    style={styles.nameInput}
                                    placeholder="Your name"
                                    placeholderTextColor="#999"
                                    value={name}
                                    onChangeText={setName}
                                    autoCapitalize="words"
                                />
                            </>
                        )}

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
                            style={[
                                styles.button,
                                ((needsName && !name.trim()) ||
                                    mpin.length !== 4 ||
                                    confirmMpin.length !== 4 ||
                                    loading) &&
                                    styles.buttonDisabled,
                            ]}
                            onPress={handleSetMpin}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.buttonText}>
                                    {isNewUser ? 'Sign up & continue' : 'Save & continue'}
                                </Text>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity onPress={resetToPhone}>
                            <Text style={styles.back}>← Change number</Text>
                        </TouchableOpacity>
                    </>
                )}

                {step === 'enter_mpin' && (
                    <>
                        <Text style={styles.stepTitle}>Welcome back, {welcomeName}! 👋</Text>
                        <Text style={styles.stepSub}>+91 {phone}</Text>

                        {!existingUser?.name?.trim() && (
                            <>
                                <Text style={styles.label}>Full name</Text>
                                <TextInput
                                    style={styles.nameInput}
                                    placeholder="Your name"
                                    placeholderTextColor="#999"
                                    value={name}
                                    onChangeText={setName}
                                    autoCapitalize="words"
                                />
                            </>
                        )}

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
                            style={[
                                styles.button,
                                (mpin.length !== 4 ||
                                    loading ||
                                    (!existingUser?.name?.trim() && !name.trim())) &&
                                    styles.buttonDisabled,
                            ]}
                            onPress={handleVerifyMpin}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.buttonText}>Login →</Text>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity onPress={resetToPhone}>
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
    phoneRow: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: '#1a73e8',
        borderRadius: 12,
        marginBottom: 24,
        overflow: 'hidden',
    },
    code: { backgroundColor: '#f0f5ff', padding: 16, fontSize: 16, fontWeight: 'bold', color: '#1a73e8' },
    input: { flex: 1, padding: 16, fontSize: 16 },
    nameInput: {
        borderWidth: 1.5,
        borderColor: '#1a73e8',
        borderRadius: 12,
        padding: 16,
        fontSize: 16,
        marginBottom: 20,
        color: '#333',
    },
    mpinInput: {
        borderWidth: 1.5,
        borderColor: '#1a73e8',
        borderRadius: 12,
        padding: 16,
        fontSize: 32,
        letterSpacing: 16,
        marginBottom: 20,
        color: '#333',
    },
    button: {
        backgroundColor: '#1a73e8',
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
        marginTop: 8,
    },
    buttonDisabled: { backgroundColor: '#93b8f5' },
    buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    back: { textAlign: 'center', marginTop: 16, color: '#1a73e8', fontSize: 14 },
});
