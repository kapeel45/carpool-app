import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    canOfferRides,
    fetchAppUserProfile,
    sendEmailOTP,
    updateUserProfile,
    normalizeEmail,
    assertEmailAvailable,
    mergeSessionFromUser,
} from './config/api';
import { validateOfficialWorkEmail } from './config/work-email';
import { GENDER_OPTIONS, type GenderValue } from './config/gender';
import { clearSession, getSession, refreshSessionFromServer, saveSession } from './config/session';

export default function ProfileScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const [session, setSession] = useState<any>(null);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [carModel, setCarModel] = useState('');
    const [carNumber, setCarNumber] = useState('');
    const [carColor, setCarColor] = useState('');
    const [gender, setGender] = useState<GenderValue | ''>('');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [isEditing, setIsEditing] = useState(false);

    const loadProfile = useCallback(async () => {
        setLoading(true);
        const s = await getSession();
        if (!s?.loggedIn) {
            router.replace('/login');
            setLoading(false);
            return;
        }

        let merged = await refreshSessionFromServer();
        if (!merged?.loggedIn) {
            router.replace('/login');
            setLoading(false);
            return;
        }

        const hasProfileData =
            merged.email || merged.carModel || merged.carNumber || merged.name;
        if (!hasProfileData && merged.userId) {
            const direct = await fetchAppUserProfile({
                userId: merged.userId,
                phone: merged.phone,
            });
            if (direct) {
                merged = mergeSessionFromUser(merged, direct);
                await saveSession(merged);
            }
        }

        setSession(merged);
        setName(merged.name || '');
        setEmail(merged.email || '');
        setGender((merged.gender as GenderValue) || '');
        setCarModel(merged.carModel || '');
        setCarNumber(merged.carNumber || '');
        setCarColor(merged.carColor || '');
        setLoading(false);
    }, [router]);

    useFocusEffect(
        useCallback(() => {
            loadProfile();
        }, [loadProfile])
    );

    const handleSave = async () => {
        if (!name) {
            Alert.alert('Required', 'Please enter your name.');
            return;
        }
        if (email) {
            const workCheck = validateOfficialWorkEmail(email);
            if (!workCheck.valid) {
                Alert.alert('Company email required', workCheck.message || 'Use your official work email.');
                return;
            }
        }
        if (email && !email.includes('@')) {
            Alert.alert('Invalid Email', 'Enter a valid email address.');
            return;
        }
        setSaving(true);
        try {
            const emailChanged =
                email && normalizeEmail(email) !== normalizeEmail(session?.email || '');
            if (!carModel.trim() || !carNumber.trim()) {
                Alert.alert(
                    'Car details required',
                    'Enter car model and number to offer rides. These are saved to your profile.'
                );
                setSaving(false);
                return;
            }

            const profileData: Record<string, unknown> = {
                name,
                car_model: carModel.trim(),
                car_number: carNumber.trim(),
                car_color: carColor.trim(),
            };
            if (gender) profileData.gender = gender;
            if (email) {
                await assertEmailAvailable(email, session.userId);
                profileData.email = normalizeEmail(email);
                if (emailChanged) {
                    profileData.email_verified = false;
                }
            }
            await updateUserProfile(session.userId, profileData);
            const refreshed = (await refreshSessionFromServer()) || session;
            const nextSession = {
                ...refreshed,
                name,
                gender,
                email: email ? normalizeEmail(email) : refreshed.email,
                emailVerified: emailChanged ? false : refreshed.emailVerified,
                carModel,
                carNumber,
                carColor,
            };
            await saveSession(nextSession);
            setSession(nextSession);
            setSaving(false);
            setIsEditing(false);
            Alert.alert('Saved! ✅', 'Profile saved successfully!');
        } catch (error: any) {
            Alert.alert(
                'Error',
                error?.message || 'Could not save profile. Try again.'
            );
            setSaving(false);
        }
    };

    const handleLogout = async () => {
        Alert.alert('Logout?', 'Are you sure?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Logout',
                style: 'destructive',
                onPress: async () => {
                    await clearSession();
                    router.replace('/login');
                },
            },
        ]);
    };

    if (loading) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="large" color="#1a73e8" style={styles.loader} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton} hitSlop={12}>
                    <Text style={styles.backText}>← Back</Text>
                </TouchableOpacity>
                <View style={styles.headerRow}>
                    <View style={styles.headerText}>
                        <Text style={styles.title}>My Profile</Text>
                        <Text style={styles.subtitle}>Manage your account</Text>
                    </View>
                    <TouchableOpacity
                        style={styles.editButton}
                        onPress={() => setIsEditing(!isEditing)}
                    >
                        <Text style={styles.editButtonText}>
                            {isEditing ? 'Cancel' : 'Edit'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                <View style={styles.profileCard}>
                    <View style={styles.avatar}>
                        <Text style={styles.avatarText}>
                            {name ? name[0].toUpperCase() : '👤'}
                        </Text>
                    </View>
                    <Text style={styles.phone}>+91 {session?.phone}</Text>
                    {email ? (
                        <View style={styles.emailBadge}>
                            <Text style={styles.emailBadgeText}>
                                {session?.emailVerified ? '✅ Email Verified' : '⏳ Email Pending Verification'}
                            </Text>
                        </View>
                    ) : null}
                </View>

                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Personal Details</Text>
                    <Text style={styles.label}>Full Name</Text>
                    <TextInput
                        style={[styles.input, !isEditing && styles.inputReadOnly]}
                        placeholder="Enter your name"
                        placeholderTextColor="#999"
                        value={name}
                        onChangeText={setName}
                        editable={isEditing}
                    />
                    <Text style={styles.label}>Gender</Text>
                    <View style={styles.genderRow}>
                        {GENDER_OPTIONS.map((option) => {
                            const selected = gender === option.value;
                            return (
                                <TouchableOpacity
                                    key={option.value}
                                    style={[
                                        styles.genderChip,
                                        selected && styles.genderChipSelected,
                                        !isEditing && styles.genderChipDisabled,
                                    ]}
                                    onPress={() => isEditing && setGender(option.value)}
                                    disabled={!isEditing}
                                    activeOpacity={0.7}
                                >
                                    <Text style={styles.genderIcon}>{option.icon}</Text>
                                    <Text
                                        style={[
                                            styles.genderLabel,
                                            selected && styles.genderLabelSelected,
                                        ]}
                                    >
                                        {option.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                    <Text style={styles.label}>Official Email</Text>
                    <TextInput
                        style={[styles.input, !isEditing && styles.inputReadOnly]}
                        placeholder="name@yourcompany.com"
                        placeholderTextColor="#999"
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        editable={isEditing}
                    />
                    <Text style={styles.hint}>
                        Company or work email only — Gmail, Yahoo, Outlook, etc. are not allowed.
                    </Text>
                    {email && !session?.emailVerified && (
                        <TouchableOpacity
                            style={styles.verifyButton}
                            onPress={async () => {
                                if (!email.includes('@')) {
                                    Alert.alert('Invalid Email', 'Enter a valid email address first.');
                                    return;
                                }
                                const workCheck = validateOfficialWorkEmail(email);
                                if (!workCheck.valid) {
                                    Alert.alert('Company email required', workCheck.message || '');
                                    return;
                                }
                                try {
                                    const normalized = normalizeEmail(email);
                                    await assertEmailAvailable(normalized, session.userId);

                                    await updateUserProfile(session.userId, {
                                        name: name || session.name,
                                        email: normalized,
                                        email_verified: false,
                                        car_model: carModel,
                                        car_number: carNumber,
                                        car_color: carColor,
                                    });
                                    const latest = (await refreshSessionFromServer()) || session;
                                    const pendingSession = {
                                        ...latest,
                                        name: name || latest.name,
                                        email: normalized,
                                        emailVerified: false,
                                        carModel,
                                        carNumber,
                                        carColor,
                                    };
                                    await saveSession(pendingSession);
                                    setSession(pendingSession);

                                    const result = await sendEmailOTP(normalized, session.userId);
                                    if (result.devOtp) {
                                        Alert.alert(
                                            'OTP Generated',
                                            `Email is not configured for sending. Use this OTP:\n\n${result.devOtp}`,
                                            [{ text: 'OK' }]
                                        );
                                    }
                                    router.push({
                                        pathname: '/verify-email' as any,
                                        params: { email: normalizeEmail(email) },
                                    });
                                } catch (error: any) {
                                    const message =
                                        error?.response?.data?.errors?.[0]?.message ||
                                        error?.message ||
                                        'Could not send OTP. Try again.';
                                    Alert.alert('Error', message);
                                }
                            }}
                        >
                            <Text style={styles.verifyButtonText}>📧 Verify Email</Text>
                        </TouchableOpacity>
                    )}
                </View>

                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Car Details</Text>
                    <Text style={styles.cardSub}>Required to offer rides</Text>
                    <Text style={styles.label}>Car Model</Text>
                    <TextInput
                        style={[styles.input, !isEditing && styles.inputReadOnly]}
                        placeholder="e.g. Honda City, Maruti Swift"
                        placeholderTextColor="#999"
                        value={carModel}
                        onChangeText={setCarModel}
                        editable={isEditing}
                    />
                    <Text style={styles.label}>Car Number</Text>
                    <TextInput
                        style={[styles.input, !isEditing && styles.inputReadOnly]}
                        placeholder="e.g. MH12 AB 1234"
                        placeholderTextColor="#999"
                        value={carNumber}
                        onChangeText={setCarNumber}
                        autoCapitalize="characters"
                        editable={isEditing}
                    />
                    <Text style={styles.label}>Car Color</Text>
                    <TextInput
                        style={[styles.input, !isEditing && styles.inputReadOnly]}
                        placeholder="e.g. White, Silver, Black"
                        placeholderTextColor="#999"
                        value={carColor}
                        onChangeText={setCarColor}
                        editable={isEditing}
                    />
                </View>

                <View style={[styles.card, styles.statusCard]}>
                    <Text style={styles.sectionTitle}>Ride Offering Status</Text>
                    {canOfferRides({ ...session, carModel, carNumber }) ? (
                        <View style={styles.statusRow}>
                            <Text style={styles.statusIcon}>✅</Text>
                            <View>
                                <Text style={styles.statusText}>Ready to Offer Rides</Text>
                                <Text style={styles.statusSub}>Your profile is verified</Text>
                            </View>
                        </View>
                    ) : session?.emailVerified && (!carModel.trim() || !carNumber.trim()) ? (
                        <View style={styles.statusRow}>
                            <Text style={styles.statusIcon}>🚗</Text>
                            <View>
                                <Text style={styles.statusText}>Add car details</Text>
                                <Text style={styles.statusSub}>
                                    Email is verified — tap Edit, enter car model & number, then Save
                                </Text>
                            </View>
                        </View>
                    ) : email && carModel && carNumber ? (
                        <View style={styles.statusRow}>
                            <Text style={styles.statusIcon}>⏳</Text>
                            <View>
                                <Text style={styles.statusText}>Pending Verification</Text>
                                <Text style={styles.statusSub}>Verify your email to offer rides</Text>
                            </View>
                        </View>
                    ) : (
                        <View style={styles.statusRow}>
                            <Text style={styles.statusIcon}>❌</Text>
                            <View>
                                <Text style={styles.statusText}>Cannot Offer Rides Yet</Text>
                                <Text style={styles.statusSub}>Add email and car details to get verified</Text>
                            </View>
                        </View>
                    )}
                </View>

                {isEditing && (
                    <TouchableOpacity
                        style={[styles.saveButton, saving && styles.buttonDisabled]}
                        onPress={handleSave}
                        disabled={saving}
                    >
                        {saving ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.saveButtonText}>Save Profile</Text>
                        )}
                    </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                    <Text style={styles.logoutText}>Logout</Text>
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    loader: { flex: 1, justifyContent: 'center' },
    scroll: { flex: 1 },
    scrollContent: { padding: 20, paddingBottom: 32 },
    header: {
        backgroundColor: '#1a73e8',
        paddingHorizontal: 24,
        paddingBottom: 24,
    },
    backButton: { marginBottom: 12 },
    backText: { color: '#fff', fontSize: 16, fontWeight: '600', opacity: 0.95 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    headerText: { flex: 1, paddingRight: 12 },
    title: { color: '#fff', fontSize: 26, fontWeight: 'bold' },
    subtitle: { color: '#fff', fontSize: 16, opacity: 0.9, marginTop: 4 },
    editButton: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    editButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
    profileCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 24,
        alignItems: 'center',
        marginBottom: 16,
        elevation: 2,
    },
    avatar: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#1a73e8',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
    },
    avatarText: { fontSize: 36, color: '#fff', fontWeight: 'bold' },
    phone: { fontSize: 16, color: '#333', fontWeight: '600' },
    emailBadge: {
        marginTop: 8,
        backgroundColor: '#fff3cd',
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 6,
    },
    emailBadgeText: { fontSize: 13, color: '#856404' },
    card: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        elevation: 2,
    },
    statusCard: { backgroundColor: '#fff' },
    sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 4 },
    cardSub: { fontSize: 13, color: '#999', marginBottom: 12 },
    label: { fontSize: 14, fontWeight: '600', color: '#444', marginBottom: 6, marginTop: 12 },
    genderRow: { flexDirection: 'row', gap: 8, marginBottom: 4, marginTop: 4 },
    genderChip: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 4,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: '#ddd',
        backgroundColor: '#fff',
    },
    genderChipSelected: {
        borderColor: '#1a73e8',
        backgroundColor: '#f0f5ff',
    },
    genderChipDisabled: { opacity: 0.9 },
    genderIcon: { fontSize: 22, marginBottom: 4 },
    genderLabel: { fontSize: 12, color: '#666', fontWeight: '600' },
    genderLabelSelected: { color: '#1a73e8' },
    input: {
        backgroundColor: '#fff',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 15,
        color: '#333',
        borderWidth: 1,
        borderColor: '#ddd',
        height: 48,
    },
    inputReadOnly: { backgroundColor: '#f9f9f9', color: '#666', borderColor: '#eee' },
    hint: { fontSize: 12, color: '#1a73e8', marginTop: 8 },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
    statusIcon: { fontSize: 28 },
    statusText: { fontSize: 15, fontWeight: '600', color: '#333' },
    statusSub: { fontSize: 12, color: '#666', marginTop: 2 },
    saveButton: {
        backgroundColor: '#1a73e8',
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
        marginBottom: 12,
    },
    buttonDisabled: { backgroundColor: '#93b8f5' },
    saveButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    logoutButton: {
        borderWidth: 1.5,
        borderColor: '#d32f2f',
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
        backgroundColor: '#fff',
    },
    logoutText: { color: '#d32f2f', fontSize: 16, fontWeight: 'bold' },
    verifyButton: {
        backgroundColor: '#e8f5e9',
        borderRadius: 12,
        padding: 14,
        alignItems: 'center',
        marginTop: 12,
    },
    verifyButtonText: { color: '#2e7d32', fontWeight: '600', fontSize: 14 },
});
