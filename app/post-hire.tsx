import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProfileNavButton from './components/ProfileNavButton';
import { getDisplayName, getDriverHireRequestsForDriver, getMyDriverHireListing, upsertDriverHireListing } from './config/api';
import { buildDefaultDriverHireListing, DEFAULT_HIRE_VISIBLE_DAYS, formatAvailableUntil, formatHireTripDate, HIRE_VISIBLE_DAY_OPTIONS, isListingExpired, type DriverHireRequest } from './config/driver-hire';
import { getSession } from './config/session';

export default function PostHireScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const defaults = buildDefaultDriverHireListing();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [userPhone, setUserPhone] = useState('');
    const [userName, setUserName] = useState('');
    const [title, setTitle] = useState(defaults.title);
    const [intro, setIntro] = useState(defaults.intro);
    const [services, setServices] = useState(defaults.services);
    const [ratePerShift, setRatePerShift] = useState(String(defaults.rate_per_shift));
    const [foodAllowance, setFoodAllowance] = useState(String(defaults.food_allowance));
    const [foodNote, setFoodNote] = useState(defaults.food_note);
    const [isActive, setIsActive] = useState(true);
    const [visibleDays, setVisibleDays] = useState(DEFAULT_HIRE_VISIBLE_DAYS);
    const [existingAvailableUntil, setExistingAvailableUntil] = useState<string | null>(null);
    const [listingId, setListingId] = useState<string | null>(null);
    const [pendingRequests, setPendingRequests] = useState<DriverHireRequest[]>([]);

    const loadPendingRequests = useCallback(async (phone: string) => {
        const rows = await getDriverHireRequestsForDriver(phone, 'pending');
        setPendingRequests(rows);
    }, []);

    useFocusEffect(
        useCallback(() => {
            if (userPhone) {
                loadPendingRequests(userPhone);
            }
        }, [userPhone, loadPendingRequests])
    );

    useEffect(() => {
        const load = async () => {
            const session = await getSession();
            if (!session?.loggedIn) {
                Alert.alert('Sign in required', 'Log in to post your driver listing.', [
                    { text: 'Cancel', style: 'cancel', onPress: () => router.back() },
                    { text: 'Log in', onPress: () => router.replace('/login') },
                ]);
                setLoading(false);
                return;
            }
            setUserPhone(session.phone);
            setUserName(getDisplayName(session.name, session.phone));

            const existing = await getMyDriverHireListing(session.phone);
            if (existing) {
                setListingId(String(existing.id));
                setTitle(existing.title || defaults.title);
                setIntro(existing.intro || defaults.intro);
                setServices(existing.services || defaults.services);
                setRatePerShift(String(existing.rate_per_shift ?? defaults.rate_per_shift));
                setFoodAllowance(String(existing.food_allowance ?? defaults.food_allowance));
                setFoodNote(existing.food_note || defaults.food_note);
                setVisibleDays(Number(existing.visible_days) || DEFAULT_HIRE_VISIBLE_DAYS);
                setExistingAvailableUntil(existing.available_until || null);
                const expired = isListingExpired(existing);
                setIsActive(existing.status === 'active' && !expired);
            }
            await loadPendingRequests(session.phone);
            setLoading(false);
        };
        load();
    }, []);

    const handleSave = async () => {
        if (!title.trim()) {
            Alert.alert('Title required', 'Add a title for your listing.');
            return;
        }
        setSaving(true);
        try {
            await upsertDriverHireListing(userPhone, userName, {
                title,
                intro,
                services,
                rate_per_shift: Number(ratePerShift) || 0,
                food_allowance: Number(foodAllowance) || 0,
                food_note: foodNote,
                visible_days: visibleDays,
                status: isActive ? 'active' : 'inactive',
            });
            Alert.alert(
                isActive ? 'Listing published' : 'Listing saved',
                isActive
                    ? 'Your driver listing is now visible to others.'
                    : 'Your listing is saved but hidden until you turn it on.',
                [{ text: 'OK', onPress: () => router.replace('/hire-driver') }]
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Could not save listing. Try again.';
            Alert.alert('Save failed', message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <View style={[styles.centered, { paddingTop: insets.top }]}>
                <ActivityIndicator size="large" color="#1a73e8" />
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
                <View style={styles.headerRow}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <Text style={styles.backText}>← Back</Text>
                    </TouchableOpacity>
                    <ProfileNavButton size={40} variant="light" />
                </View>
                <Text style={styles.headerTitle}>Offer driving services</Text>
                <Text style={styles.headerSub}>Manage listing and review hire requests</Text>
            </View>

            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
                {pendingRequests.length > 0 ? (
                    <View style={styles.requestsBox}>
                        <Text style={styles.requestsTitle}>Pending hire requests ({pendingRequests.length})</Text>
                        {pendingRequests.map((request) => (
                            <TouchableOpacity
                                key={String(request.id)}
                                style={styles.requestRow}
                                onPress={() =>
                                    router.push({
                                        pathname: '/hire-request',
                                        params: { requestId: String(request.id) },
                                    })
                                }
                            >
                                <View style={styles.requestRowText}>
                                    <Text style={styles.requestClient}>
                                        {getDisplayName(request.client_name || '', request.client_phone)}
                                    </Text>
                                    <Text style={styles.requestMeta}>
                                        {formatHireTripDate(request.trip_date)} · {Number(request.hours) || 8} hrs · est. ₹
                                        {Number(request.estimated_total || 0).toLocaleString('en-IN')}
                                    </Text>
                                </View>
                                <Text style={styles.requestChevron}>›</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                ) : null}

                <View style={styles.activeRow}>
                    <View style={{ flex: 1, paddingRight: 12 }}>
                        <Text style={styles.activeLabel}>Listing visible</Text>
                        <Text style={styles.activeSub}>
                            {isActive
                                ? existingAvailableUntil && !isListingExpired({ available_until: existingAvailableUntil, status: 'active' })
                                    ? `Active until ${formatAvailableUntil(existingAvailableUntil)}`
                                    : 'Will activate on publish'
                                : isListingExpired({ available_until: existingAvailableUntil, status: 'active' })
                                    ? 'Expired — re-publish to go live'
                                    : 'Hidden from browse list'}
                        </Text>
                    </View>
                    <Switch value={isActive} onValueChange={setIsActive} trackColor={{ true: '#1a73e8' }} />
                </View>

                {isActive ? (
                    <View style={styles.daysBox}>
                        <Text style={styles.daysTitle}>How many days to keep visible?</Text>
                        <View style={styles.daysRow}>
                            {HIRE_VISIBLE_DAY_OPTIONS.map((option) => (
                                <TouchableOpacity
                                    key={option}
                                    style={[styles.dayChip, visibleDays === option && styles.dayChipActive]}
                                    onPress={() => setVisibleDays(option)}
                                >
                                    <Text style={[styles.dayChipText, visibleDays === option && styles.dayChipTextActive]}>
                                        {option}d
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <Text style={styles.daysSub}>
                            After {visibleDays} day{visibleDays === 1 ? '' : 's'} listing moves to draft automatically. Edit and re-publish to go live again.
                        </Text>
                    </View>
                ) : null}

                <Text style={styles.label}>Title</Text>
                <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Listing title" />

                <Text style={styles.label}>Introduction</Text>
                <TextInput
                    style={[styles.input, styles.multiline]}
                    value={intro}
                    onChangeText={setIntro}
                    multiline
                    textAlignVertical="top"
                    placeholder="Short intro about your services"
                />

                <Text style={styles.label}>Services (one per line)</Text>
                <TextInput
                    style={[styles.input, styles.multilineTall]}
                    value={services}
                    onChangeText={setServices}
                    multiline
                    textAlignVertical="top"
                    placeholder="Airport drops&#10;Day trips&#10;..."
                />

                <Text style={styles.sectionHeading}>Rates</Text>
                <Text style={styles.label}>8-hour shift (₹)</Text>
                <TextInput
                    style={[styles.input, styles.readOnlyInput]}
                    value={ratePerShift}
                    editable={false}
                    selectTextOnFocus={false}
                    placeholder="1200"
                />

                <Text style={styles.label}>Food allowance if meals not provided (₹)</Text>
                <TextInput
                    style={[styles.input, styles.readOnlyInput]}
                    value={foodAllowance}
                    editable={false}
                    selectTextOnFocus={false}
                    placeholder="400"
                />

                <Text style={styles.label}>Food note (shown on listing)</Text>
                <TextInput
                    style={[styles.input, styles.multiline]}
                    value={foodNote}
                    onChangeText={setFoodNote}
                    multiline
                    textAlignVertical="top"
                />

                <TouchableOpacity
                    style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                    onPress={handleSave}
                    disabled={saving}
                >
                    {saving ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.saveButtonText}>
                            {listingId ? (isActive ? 'Update listing' : 'Save & hide') : 'Publish listing'}
                        </Text>
                    )}
                </TouchableOpacity>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    flex: { flex: 1, backgroundColor: '#f5f5f5' },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
    header: {
        backgroundColor: '#1a73e8',
        paddingHorizontal: 20,
        paddingBottom: 20,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    backButton: { paddingVertical: 4 },
    backText: { color: '#fff', fontSize: 16, fontWeight: '600' },
    headerTitle: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
    headerSub: { color: '#fff', fontSize: 14, opacity: 0.9, marginTop: 6 },
    scroll: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 40 },
    activeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
    },
    activeLabel: { fontSize: 16, fontWeight: '600', color: '#333' },
    activeSub: { fontSize: 12, color: '#666', marginTop: 2 },
    daysBox: {
        backgroundColor: '#e8f0fe',
        borderRadius: 12,
        padding: 14,
        marginBottom: 8,
    },
    daysTitle: { fontSize: 14, fontWeight: '600', color: '#1a73e8', marginBottom: 10 },
    daysRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    dayChip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#c5d8f8',
    },
    dayChipActive: { backgroundColor: '#1a73e8', borderColor: '#1a73e8' },
    dayChipText: { fontSize: 14, fontWeight: '700', color: '#1a73e8' },
    dayChipTextActive: { color: '#fff' },
    daysSub: { fontSize: 12, color: '#555', marginTop: 10, lineHeight: 18 },
    requestsBox: {
        backgroundColor: '#fff8e1',
        borderRadius: 12,
        padding: 14,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#ffe082',
    },
    requestsTitle: { fontSize: 15, fontWeight: '700', color: '#333', marginBottom: 10 },
    requestRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 10,
        padding: 12,
        marginBottom: 8,
    },
    requestRowText: { flex: 1 },
    requestClient: { fontSize: 15, fontWeight: '600', color: '#333' },
    requestMeta: { fontSize: 13, color: '#666', marginTop: 4 },
    requestChevron: { fontSize: 22, color: '#1a73e8', marginLeft: 8 },
    sectionHeading: { fontSize: 16, fontWeight: '700', color: '#1a73e8', marginTop: 8, marginBottom: 4 },
    label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6, marginTop: 12 },
    input: {
        backgroundColor: '#fff',
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 15,
        color: '#333',
        borderWidth: 1,
        borderColor: '#e8e8e8',
    },
    readOnlyInput: {
        backgroundColor: '#f1f3f4',
        color: '#666',
    },
    multiline: { minHeight: 88 },
    multilineTall: { minHeight: 120 },
    saveButton: {
        backgroundColor: '#1a73e8',
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 24,
    },
    saveButtonDisabled: { opacity: 0.7 },
    saveButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
