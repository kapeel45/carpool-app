import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Linking,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProfileNavButton from './components/ProfileNavButton';
import {
    cancelDriverHireRequest,
    createDriverHireRequest,
    getClientDriverHireRequestsByListingIds,
    getDisplayName,
    getDriverHireListings,
    getDriverHireRequestsForDriver,
    getMyDriverHireListing,
    isOwnOfferedRide,
    normalizePhone,
} from './config/api';
import {
    estimateHireTotal,
    formatAvailableUntil,
    formatHireConfirmationCode,
    formatDriverHireRate,
    formatHireTripDate,
    formatHireTripTime,
    hireHourOptions,
    isListingExpired,
    isValidHireConfirmationCode,
    MIN_HIRE_HOURS,
    normalizeHireConfirmationCode,
    toHireTimeString,
    type DriverHireListing,
    type DriverHireRequest,
} from './config/driver-hire';
import { getSession } from './config/session';

const hourOptions = hireHourOptions();

const buildBookingMessage = (listing: DriverHireListing, request?: DriverHireRequest | null) => {
    const dateLabel = formatHireTripDate(request?.trip_date);
    const hours = Number(request?.hours) || MIN_HIRE_HOURS;
    return `Hi${listing.driver_name ? ` ${listing.driver_name.split(' ')[0]}` : ''}, our driver hire for ${dateLabel} (${hours} hrs) is confirmed. Please share final pickup details and route.`;
};

const openMessage = (phone: string, listing: DriverHireListing, request?: DriverHireRequest | null) => {
    const digits = normalizePhone(phone);
    if (digits.length !== 10) return;
    const body = encodeURIComponent(buildBookingMessage(listing, request));
    const whatsappUrl = `whatsapp://send?phone=91${digits}&text=${body}`;
    Linking.canOpenURL(whatsappUrl).then((supported) => {
        if (supported) {
            Linking.openURL(whatsappUrl);
            return;
        }
        Linking.openURL(`sms:+91${digits}?body=${body}`);
    });
};

const openCall = (phone: string) => {
    const digits = normalizePhone(phone);
    if (digits.length === 10) Linking.openURL(`tel:+91${digits}`);
};

type ListingCardProps = {
    listing: DriverHireListing;
    myRequest?: DriverHireRequest | null;
    userPhone: string;
    isLoggedIn: boolean;
    onSubmitted: () => void;
    onLogin: () => void;
};

function ListingCard({
    listing,
    myRequest,
    userPhone,
    isLoggedIn,
    onSubmitted,
    onLogin,
}: ListingCardProps) {
    const { shift, food } = formatDriverHireRate(listing);
    const driverLabel = getDisplayName(listing.driver_name || '', listing.driver_phone);
    const isOwnListing = isOwnOfferedRide({ driver_name: listing.driver_phone }, userPhone);
    const serviceLines = String(listing.services || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    const [tripDate, setTripDate] = useState(() => {
        const d = new Date();
        d.setHours(12, 0, 0, 0);
        return d;
    });
    const [startTime, setStartTime] = useState(() => {
        const d = new Date();
        d.setHours(9, 0, 0, 0);
        return d;
    });
    const [startLocation, setStartLocation] = useState('');
    const [endLocation, setEndLocation] = useState('');
    const [hours, setHours] = useState(MIN_HIRE_HOURS);
    const [routeNote, setRouteNote] = useState('');
    const [confirmationCode, setConfirmationCode] = useState('');
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [pickerValue, setPickerValue] = useState(() => new Date());
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [timePickerValue, setTimePickerValue] = useState(() => {
        const d = new Date();
        d.setHours(9, 0, 0, 0);
        return d;
    });
    const [submitting, setSubmitting] = useState(false);

    const requestStatus = myRequest?.status || '';
    const isPending = requestStatus === 'pending';
    const isAccepted = requestStatus === 'accepted';
    const isRejected = requestStatus === 'rejected';
    const showRequestForm = !isPending && !isAccepted;
    const estimatedTotal = estimateHireTotal(hours, shift);

    const handleSubmitRequest = async () => {
        if (!isLoggedIn) {
            onLogin();
            return;
        }
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const selected = new Date(tripDate);
        selected.setHours(0, 0, 0, 0);
        if (selected < today) {
            Alert.alert('Invalid date', 'Please choose today or a future date.');
            return;
        }
        if (!startLocation.trim() || !endLocation.trim()) {
            Alert.alert('Locations required', 'Enter both the start and end ride locations.');
            return;
        }
        if (!isValidHireConfirmationCode(confirmationCode)) {
            Alert.alert('Code required', 'Enter a 4-digit confirmation code to share with the driver.');
            return;
        }

        setSubmitting(true);
        try {
            const session = await getSession();
            await createDriverHireRequest({
                listingId: String(listing.id),
                listing,
                clientPhone: session?.phone || userPhone,
                clientName: getDisplayName(session?.name, session?.phone),
                tripDate,
                startTime: toHireTimeString(startTime),
                startLocation,
                endLocation,
                hours,
                routeNote,
                confirmationCode,
            });
            Alert.alert('Request sent', 'The driver will review your request. Call and message unlock after they accept.');
            onSubmitted();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Could not send request.';
            Alert.alert('Request failed', message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleCancelMyRequest = () => {
        if (!myRequest?.id) return;
        Alert.alert('Cancel trip?', 'This hire will be cancelled and the driver notified.', [
            { text: 'Keep trip', style: 'cancel' },
            {
                text: 'Cancel trip',
                style: 'destructive',
                onPress: async () => {
                    setSubmitting(true);
                    try {
                        const session = await getSession();
                        await cancelDriverHireRequest(String(myRequest.id), session?.phone || userPhone);
                        Alert.alert('Cancelled', 'The hire was cancelled and the driver notified.');
                        onSubmitted();
                    } catch (error: unknown) {
                        const message = error instanceof Error ? error.message : 'Could not cancel trip.';
                        Alert.alert('Error', message);
                    } finally {
                        setSubmitting(false);
                    }
                },
            },
        ]);
    };

    const onDateChange = (_event: unknown, date?: Date) => {
        if (Platform.OS === 'android') setShowDatePicker(false);
        if (date) {
            setPickerValue(date);
            setTripDate(date);
        }
    };

    const onTimeChange = (_event: unknown, date?: Date) => {
        if (Platform.OS === 'android') setShowTimePicker(false);
        if (date) {
            setTimePickerValue(date);
            setStartTime(date);
        }
    };

    return (
        <View style={styles.card}>
            <Text style={styles.cardTitle}>{listing.title}</Text>
            {listing.intro ? <Text style={styles.cardIntro}>{listing.intro}</Text> : null}

            {serviceLines.length > 0 ? (
                <View style={styles.section}>
                    <Text style={styles.sectionLabel}>Services</Text>
                    {serviceLines.map((line) => (
                        <View key={line} style={styles.bulletRow}>
                            <Text style={styles.bullet}>•</Text>
                            <Text style={styles.bulletText}>{line}</Text>
                        </View>
                    ))}
                </View>
            ) : null}

            <View style={styles.section}>
                <Text style={styles.sectionLabel}>Rates</Text>
                <Text style={styles.rateLine}>₹{shift.toLocaleString('en-IN')} — 8-hour shift (flat)</Text>
                <Text style={styles.rateSub}>{food}</Text>
            </View>

            <Text style={styles.driverName}>{driverLabel}</Text>

            {isOwnListing ? (
                <Text style={styles.ownListingNote}>This is your listing. Manage requests from Offer driving services.</Text>
            ) : isAccepted ? (
                <>
                    <View style={styles.statusBoxAccepted}>
                        <Text style={styles.statusTitle}>Request accepted</Text>
                        <Text style={styles.statusSub}>
                            {formatHireTripDate(myRequest?.trip_date)}
                            {myRequest?.start_time ? ` at ${formatHireTripTime(myRequest.start_time)}` : ''} ·{' '}
                            {Number(myRequest?.hours) || hours} hrs · est. ₹
                            {Number(myRequest?.estimated_total || estimatedTotal).toLocaleString('en-IN')}
                        </Text>
                        {myRequest?.start_location || myRequest?.end_location ? (
                            <Text style={styles.statusSub}>
                                {myRequest?.start_location || '—'} → {myRequest?.end_location || '—'}
                            </Text>
                        ) : null}
                    </View>
                    <View style={styles.actionRow}>
                        <TouchableOpacity style={styles.callButton} onPress={() => openCall(listing.driver_phone)}>
                            <Text style={styles.callButtonText}>Call</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.messageButton}
                            onPress={() => openMessage(listing.driver_phone, listing, myRequest)}
                        >
                            <Text style={styles.messageButtonText}>Message</Text>
                        </TouchableOpacity>
                    </View>
                    <TouchableOpacity
                        style={[styles.cancelTripButton, submitting && styles.requestButtonDisabled]}
                        onPress={handleCancelMyRequest}
                        disabled={submitting}
                    >
                        <Text style={styles.cancelTripText}>
                            {submitting ? 'Cancelling…' : 'Cancel trip'}
                        </Text>
                    </TouchableOpacity>
                </>
            ) : isPending ? (
                <>
                    <View style={styles.statusBoxPending}>
                        <Text style={styles.statusTitle}>Request sent</Text>
                        <Text style={styles.statusSub}>
                            Waiting for driver to accept · {formatHireTripDate(myRequest?.trip_date)}
                            {myRequest?.start_time ? ` at ${formatHireTripTime(myRequest.start_time)}` : ''} ·{' '}
                            {Number(myRequest?.hours) || hours} hrs
                        </Text>
                        <Text style={styles.codeHint}>
                            Your 4-digit code: {formatHireConfirmationCode(myRequest?.confirmation_code)}
                        </Text>
                    </View>
                    <TouchableOpacity
                        style={[styles.cancelTripButton, submitting && styles.requestButtonDisabled]}
                        onPress={handleCancelMyRequest}
                        disabled={submitting}
                    >
                        <Text style={styles.cancelTripText}>
                            {submitting ? 'Cancelling…' : 'Cancel request'}
                        </Text>
                    </TouchableOpacity>
                </>
            ) : showRequestForm ? (
                <>
                    {isRejected ? (
                        <View style={styles.statusBoxRejected}>
                            <Text style={styles.statusTitle}>Previous request declined</Text>
                            <Text style={styles.statusSub}>You can send a new request with different details.</Text>
                        </View>
                    ) : null}

                    <View style={styles.requestSection}>
                        <Text style={styles.requestHeading}>Request this driver</Text>

                        <Text style={styles.fieldLabel}>Start date</Text>
                        <TouchableOpacity style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
                            <Text style={styles.dateButtonText}>{formatHireTripDate(tripDate.toISOString())}</Text>
                        </TouchableOpacity>

                        <Text style={styles.fieldLabel}>Start time</Text>
                        <TouchableOpacity style={styles.dateButton} onPress={() => setShowTimePicker(true)}>
                            <Text style={styles.dateButtonText}>
                                {formatHireTripTime(toHireTimeString(startTime))}
                            </Text>
                        </TouchableOpacity>

                        <Text style={styles.fieldLabel}>Start ride location</Text>
                        <TextInput
                            style={styles.routeInput}
                            value={startLocation}
                            onChangeText={setStartLocation}
                            placeholder="e.g. Home — Baner, Pune"
                            multiline
                        />

                        <Text style={styles.fieldLabel}>End ride location</Text>
                        <TextInput
                            style={styles.routeInput}
                            value={endLocation}
                            onChangeText={setEndLocation}
                            placeholder="e.g. Pune Airport (T2)"
                            multiline
                        />

                        <Text style={styles.fieldLabel}>Duration (8-hour blocks)</Text>
                        <View style={styles.hoursRow}>
                            {hourOptions.map((option) => (
                                <TouchableOpacity
                                    key={option}
                                    style={[styles.hourChip, hours === option && styles.hourChipActive]}
                                    onPress={() => setHours(option)}
                                >
                                    <Text style={[styles.hourChipText, hours === option && styles.hourChipTextActive]}>
                                        {option}h
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <Text style={styles.hoursHint}>Minimum 8 hours. Increments of 8 only.</Text>

                        <Text style={styles.fieldLabel}>4-digit confirmation code</Text>
                        <TextInput
                            style={styles.codeInput}
                            value={confirmationCode}
                            onChangeText={(value) => setConfirmationCode(normalizeHireConfirmationCode(value))}
                            keyboardType="number-pad"
                            maxLength={4}
                            placeholder="e.g. 4729"
                        />
                        <Text style={styles.hoursHint}>
                            Share this code with the driver. They must enter it while accepting your request.
                        </Text>

                        <Text style={styles.fieldLabel}>Route / notes (optional)</Text>
                        <TextInput
                            style={styles.routeInput}
                            value={routeNote}
                            onChangeText={setRouteNote}
                            placeholder="e.g. Pune airport drop, then home"
                            multiline
                        />

                        <Text style={styles.estimateText}>
                            Estimated fare: ₹{estimatedTotal.toLocaleString('en-IN')} ({hours / 8} × 8-hr shift)
                        </Text>

                        <TouchableOpacity
                            style={[styles.requestButton, submitting && styles.requestButtonDisabled]}
                            onPress={handleSubmitRequest}
                            disabled={submitting}
                        >
                            {submitting ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.requestButtonText}>
                                    {isLoggedIn ? 'Send request' : 'Log in to request'}
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </>
            ) : null}

            {showDatePicker && Platform.OS === 'android' ? (
                <DateTimePicker value={pickerValue} mode="date" minimumDate={new Date()} onChange={onDateChange} />
            ) : null}

            {showTimePicker && Platform.OS === 'android' ? (
                <DateTimePicker value={timePickerValue} mode="time" onChange={onTimeChange} />
            ) : null}

            {Platform.OS === 'ios' ? (
                <Modal visible={showDatePicker} transparent animationType="slide">
                    <View style={styles.modalBackdrop}>
                        <View style={styles.modalSheet}>
                            <View style={styles.modalHeader}>
                                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                                    <Text style={styles.modalDone}>Done</Text>
                                </TouchableOpacity>
                            </View>
                            <DateTimePicker
                                value={pickerValue}
                                mode="date"
                                minimumDate={new Date()}
                                display="spinner"
                                onChange={onDateChange}
                            />
                        </View>
                    </View>
                </Modal>
            ) : null}

            {Platform.OS === 'ios' ? (
                <Modal visible={showTimePicker} transparent animationType="slide">
                    <View style={styles.modalBackdrop}>
                        <View style={styles.modalSheet}>
                            <View style={styles.modalHeader}>
                                <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                                    <Text style={styles.modalDone}>Done</Text>
                                </TouchableOpacity>
                            </View>
                            <DateTimePicker
                                value={timePickerValue}
                                mode="time"
                                display="spinner"
                                onChange={onTimeChange}
                            />
                        </View>
                    </View>
                </Modal>
            ) : null}
        </View>
    );
}

export default function HireDriverScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const [listings, setListings] = useState<DriverHireListing[]>([]);
    const [requestByListingId, setRequestByListingId] = useState<Record<string, DriverHireRequest>>({});
    const [myListing, setMyListing] = useState<DriverHireListing | null>(null);
    const [myPendingRequests, setMyPendingRequests] = useState<DriverHireRequest[]>([]);
    const [activePanel, setActivePanel] = useState<'offers' | 'my-post'>('offers');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [userPhone, setUserPhone] = useState('');

    const loadListings = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        setLoadError('');
        try {
            const session = await getSession();
            const loggedIn = Boolean(session?.loggedIn);
            const phone = session?.phone || '';
            setIsLoggedIn(loggedIn);
            setUserPhone(phone);

            const rows = await getDriverHireListings();
            setListings(rows);

            if (loggedIn && phone) {
                const [mine, pending] = await Promise.all([
                    getMyDriverHireListing(phone),
                    getDriverHireRequestsForDriver(phone, 'pending'),
                ]);
                setMyListing(mine);
                setMyPendingRequests(pending);
            } else {
                setMyListing(null);
                setMyPendingRequests([]);
            }

            if (loggedIn && phone && rows.length > 0) {
                const map = await getClientDriverHireRequestsByListingIds(
                    phone,
                    rows.map((row: DriverHireListing) => String(row.id))
                );
                setRequestByListingId(map);
            } else {
                setRequestByListingId({});
            }
        } catch (error) {
            console.error('loadListings failed:', error);
            setLoadError('Could not load driver listings. Pull down to retry.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadListings();
        }, [loadListings])
    );

    const handlePostListing = () => {
        router.push(isLoggedIn ? '/post-hire' : '/login');
    };

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
                <View style={styles.headerRow}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <Text style={styles.backText}>← Back</Text>
                    </TouchableOpacity>
                    <ProfileNavButton size={40} variant="light" />
                </View>
                <Text style={styles.headerTitle}>Hire a Driver</Text>
                <Text style={styles.headerSub}>Request a driver — contact unlocks after they accept</Text>
            </View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={() => {
                            setRefreshing(true);
                            loadListings(true);
                        }}
                    />
                }
            >
                <View style={styles.panelRow}>
                    <TouchableOpacity
                        style={[styles.panelTab, activePanel === 'offers' && styles.panelTabActive]}
                        onPress={() => setActivePanel('offers')}
                    >
                        <Text
                            style={[styles.panelTabText, activePanel === 'offers' && styles.panelTabTextActive]}
                        >
                            Driver offers
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.panelTab, activePanel === 'my-post' && styles.panelTabActive]}
                        onPress={() => setActivePanel('my-post')}
                    >
                        <Text
                            style={[styles.panelTabText, activePanel === 'my-post' && styles.panelTabTextActive]}
                        >
                            Your post ({myPendingRequests.length})
                        </Text>
                    </TouchableOpacity>
                </View>

                <TouchableOpacity style={styles.postBanner} onPress={handlePostListing}>
                    <Text style={styles.postBannerIcon}>🧑‍✈️</Text>
                    <View style={styles.postBannerText}>
                        <Text style={styles.postBannerTitle}>Offer driving services</Text>
                        <Text style={styles.postBannerSub}>Post your listing and review hire requests</Text>
                    </View>
                    <Text style={styles.postBannerChevron}>›</Text>
                </TouchableOpacity>

                {loading ? (
                    <ActivityIndicator size="large" color="#1a73e8" style={styles.loader} />
                ) : loadError ? (
                    <View style={styles.emptyBox}>
                        <Text style={styles.emptyTitle}>Could not load listings</Text>
                        <Text style={styles.emptySub}>{loadError}</Text>
                    </View>
                ) : listings.length === 0 ? (
                    <View style={styles.emptyBox}>
                        <Text style={styles.emptyTitle}>No drivers listed yet</Text>
                        <Text style={styles.emptySub}>
                            Be the first to post — tap “Offer driving services” above with the default template ready to publish.
                        </Text>
                    </View>
                ) : activePanel === 'offers' ? (
                    listings.map((listing) => (
                        <ListingCard
                            key={listing.id}
                            listing={listing}
                            myRequest={requestByListingId[String(listing.id)]}
                            userPhone={userPhone}
                            isLoggedIn={isLoggedIn}
                            onSubmitted={() => loadListings(true)}
                            onLogin={() => router.push('/login')}
                        />
                    ))
                ) : (
                    <View style={styles.myPostCard}>
                        <Text style={styles.myPostTitle}>Your driver listing</Text>
                        {myListing ? (
                            <>
                                <Text style={styles.myPostStatus}>
                                    {myListing.status === 'active'
                                        ? myListing.available_until
                                            ? `Active · visible until ${formatAvailableUntil(myListing.available_until)}`
                                            : 'Active'
                                        : isListingExpired(myListing)
                                            ? 'Expired — edit to re-publish'
                                            : 'Draft'}
                                </Text>
                                <Text style={styles.myPostText}>{myListing.title}</Text>
                                <TouchableOpacity
                                    style={styles.manageButton}
                                    onPress={() => router.push('/post-hire')}
                                >
                                    <Text style={styles.manageButtonText}>Edit your listing</Text>
                                </TouchableOpacity>
                            </>
                        ) : (
                            <>
                                <Text style={styles.myPostText}>
                                    You have not posted a driver listing yet.
                                </Text>
                                <TouchableOpacity
                                    style={styles.manageButton}
                                    onPress={() => router.push(isLoggedIn ? '/post-hire' : '/login')}
                                >
                                    <Text style={styles.manageButtonText}>Create listing</Text>
                                </TouchableOpacity>
                            </>
                        )}

                        <Text style={styles.pendingTitle}>
                            Pending requests ({myPendingRequests.length})
                        </Text>
                        {myPendingRequests.length === 0 ? (
                            <Text style={styles.pendingEmpty}>No pending requests right now.</Text>
                        ) : (
                            myPendingRequests.map((request) => (
                                <TouchableOpacity
                                    key={String(request.id)}
                                    style={styles.pendingRow}
                                    onPress={() =>
                                        router.push({
                                            pathname: '/hire-request',
                                            params: { requestId: String(request.id) },
                                        })
                                    }
                                >
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.pendingName}>
                                            {getDisplayName(request.client_name || '', request.client_phone)}
                                        </Text>
                                        <Text style={styles.pendingMeta}>
                                            {formatHireTripDate(request.trip_date)}
                                            {request.start_time ? ` at ${formatHireTripTime(request.start_time)}` : ''} ·{' '}
                                            {Number(request.hours) || 8}h
                                        </Text>
                                        {request.start_location || request.end_location ? (
                                            <Text style={styles.pendingMeta}>
                                                {request.start_location || '—'} → {request.end_location || '—'}
                                            </Text>
                                        ) : null}
                                    </View>
                                    <Text style={styles.pendingChevron}>›</Text>
                                </TouchableOpacity>
                            ))
                        )}
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
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
    scrollContent: { padding: 16, paddingBottom: 32 },
    panelRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
    panelTab: {
        flex: 1,
        backgroundColor: '#eaf1fe',
        borderRadius: 12,
        paddingVertical: 10,
        alignItems: 'center',
    },
    panelTabActive: { backgroundColor: '#1a73e8' },
    panelTabText: { color: '#1a73e8', fontWeight: '700', fontSize: 13 },
    panelTabTextActive: { color: '#fff' },
    postBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 14,
        padding: 16,
        marginBottom: 16,
        elevation: 2,
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 6,
    },
    postBannerIcon: { fontSize: 28, marginRight: 12 },
    postBannerText: { flex: 1 },
    postBannerTitle: { fontSize: 16, fontWeight: '700', color: '#333' },
    postBannerSub: { fontSize: 13, color: '#666', marginTop: 2 },
    postBannerChevron: { fontSize: 24, color: '#1a73e8', fontWeight: '300' },
    loader: { marginTop: 40 },
    emptyBox: {
        backgroundColor: '#fff',
        borderRadius: 14,
        padding: 24,
        alignItems: 'center',
    },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: '#333' },
    emptySub: { fontSize: 14, color: '#666', textAlign: 'center', marginTop: 8, lineHeight: 20 },
    myPostCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16 },
    myPostTitle: { fontSize: 18, fontWeight: '700', color: '#222' },
    myPostStatus: { fontSize: 13, color: '#666', marginTop: 6 },
    myPostText: { fontSize: 14, color: '#444', marginTop: 8 },
    manageButton: {
        marginTop: 12,
        backgroundColor: '#1a73e8',
        borderRadius: 10,
        paddingVertical: 10,
        alignItems: 'center',
    },
    manageButtonText: { color: '#fff', fontWeight: '700' },
    pendingTitle: { fontSize: 15, fontWeight: '700', color: '#333', marginTop: 18, marginBottom: 8 },
    pendingEmpty: { fontSize: 13, color: '#777' },
    pendingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f8f9fa',
        borderRadius: 10,
        padding: 12,
        marginBottom: 8,
    },
    pendingName: { fontSize: 14, fontWeight: '600', color: '#333' },
    pendingMeta: { fontSize: 12, color: '#666', marginTop: 2 },
    pendingChevron: { fontSize: 22, color: '#1a73e8', marginLeft: 8 },
    card: {
        backgroundColor: '#fff',
        borderRadius: 14,
        padding: 18,
        marginBottom: 14,
        elevation: 2,
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 6,
    },
    cardTitle: { fontSize: 17, fontWeight: '700', color: '#1a1a1a', lineHeight: 24 },
    cardIntro: { fontSize: 14, color: '#444', marginTop: 10, lineHeight: 20 },
    section: { marginTop: 14 },
    sectionLabel: {
        fontSize: 13,
        fontWeight: '700',
        color: '#1a73e8',
        marginBottom: 6,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
    },
    bulletRow: { flexDirection: 'row', marginBottom: 4 },
    bullet: { color: '#666', marginRight: 8, lineHeight: 20 },
    bulletText: { flex: 1, fontSize: 14, color: '#444', lineHeight: 20 },
    rateLine: { fontSize: 15, fontWeight: '600', color: '#333' },
    rateSub: { fontSize: 13, color: '#666', marginTop: 4, lineHeight: 18 },
    driverName: { fontSize: 13, color: '#888', marginTop: 14 },
    ownListingNote: { fontSize: 13, color: '#666', marginTop: 14, fontStyle: 'italic' },
    requestSection: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#eee' },
    requestHeading: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 8 },
    fieldLabel: { fontSize: 13, fontWeight: '600', color: '#555', marginTop: 10, marginBottom: 6 },
    dateButton: {
        backgroundColor: '#f8f9fa',
        borderRadius: 10,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderWidth: 1,
        borderColor: '#e8e8e8',
    },
    dateButtonText: { fontSize: 15, color: '#333' },
    hoursRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    hourChip: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#f0f0f0',
    },
    hourChipActive: { backgroundColor: '#1a73e8' },
    hourChipText: { fontSize: 14, fontWeight: '600', color: '#555' },
    hourChipTextActive: { color: '#fff' },
    hoursHint: { fontSize: 12, color: '#888', marginTop: 6 },
    routeInput: {
        backgroundColor: '#f8f9fa',
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 15,
        color: '#333',
        borderWidth: 1,
        borderColor: '#e8e8e8',
        minHeight: 72,
        textAlignVertical: 'top',
    },
    codeInput: {
        backgroundColor: '#f8f9fa',
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 15,
        color: '#333',
        borderWidth: 1,
        borderColor: '#e8e8e8',
        letterSpacing: 4,
        fontWeight: '700',
    },
    estimateText: { fontSize: 14, fontWeight: '600', color: '#1a73e8', marginTop: 12 },
    requestButton: {
        backgroundColor: '#1a73e8',
        borderRadius: 10,
        paddingVertical: 14,
        alignItems: 'center',
        marginTop: 14,
    },
    requestButtonDisabled: { opacity: 0.7 },
    requestButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    statusBoxPending: {
        marginTop: 14,
        backgroundColor: '#fff8e1',
        borderRadius: 10,
        padding: 12,
        borderWidth: 1,
        borderColor: '#ffe082',
    },
    statusBoxAccepted: {
        marginTop: 14,
        backgroundColor: '#e8f5e9',
        borderRadius: 10,
        padding: 12,
        borderWidth: 1,
        borderColor: '#a5d6a7',
    },
    statusBoxRejected: {
        marginTop: 14,
        backgroundColor: '#ffebee',
        borderRadius: 10,
        padding: 12,
        borderWidth: 1,
        borderColor: '#ef9a9a',
        marginBottom: 4,
    },
    statusTitle: { fontSize: 14, fontWeight: '700', color: '#333' },
    statusSub: { fontSize: 13, color: '#666', marginTop: 4, lineHeight: 18 },
    codeHint: { fontSize: 13, color: '#1a73e8', marginTop: 8, fontWeight: '700' },
    actionRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
    callButton: {
        flex: 1,
        backgroundColor: '#e8f0fe',
        borderRadius: 10,
        paddingVertical: 12,
        alignItems: 'center',
    },
    callButtonText: { color: '#1a73e8', fontWeight: '700', fontSize: 15 },
    messageButton: {
        flex: 2,
        backgroundColor: '#1a73e8',
        borderRadius: 10,
        paddingVertical: 12,
        alignItems: 'center',
    },
    messageButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    cancelTripButton: {
        marginTop: 10,
        backgroundColor: '#fff',
        borderRadius: 10,
        paddingVertical: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#e57373',
    },
    cancelTripText: { color: '#c62828', fontWeight: '700', fontSize: 15 },
    modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
    modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16 },
    modalHeader: { alignItems: 'flex-end', padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
    modalDone: { color: '#1a73e8', fontSize: 16, fontWeight: '700' },
});
