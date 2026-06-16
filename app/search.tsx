import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LocationInput from './components/LocationInput';
import ProfileNavButton from './components/ProfileNavButton';
import RideMap from './components/RideMap';
import SearchRideMap from './components/SearchRideMap';
import RideOwnerRow from './components/RideOwnerRow';
import SeatSelector from './components/SeatSelector';
import {
    cancelBooking,
    cancelPickupRequest,
    createBooking,
    filterRidesForFind,
    FIND_RIDE_REFRESH_MS,
    getAvailableSeats,
    getDisplayName,
    getRides,
    getUserBookings,
    getPickupRequestsForRider,
    parseRideDepartureTime,
    requestNearbyPickup,
    resolveOwnerInfo,
    resolveRelationId,
} from './config/api';
import {
    formatDistanceMiles,
    NEARBY_PICKUP_RADIUS_MILES,
    partitionRideSearchResults,
    type Coordinates,
    type NearbyRideMatch,
} from './config/geo';
import { getGenderDisplay } from './config/gender';
import { getSession } from './config/session';

const formatRideTime = (value?: string) => {
    if (!value) return 'Time TBD';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('en-IN', {
        weekday: 'short',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });
};

export default function SearchScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [fromCoords, setFromCoords] = useState<Coordinates | null>(null);
    const [toCoords, setToCoords] = useState<Coordinates | null>(null);
    const [resolvedSearchFrom, setResolvedSearchFrom] = useState<Coordinates | null>(null);
    const [resolvedSearchTo, setResolvedSearchTo] = useState<Coordinates | null>(null);
    const [rides, setRides] = useState<any[]>([]);
    const [nearbyRides, setNearbyRides] = useState<NearbyRideMatch[]>([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [userPhone, setUserPhone] = useState('');
    const [userName, setUserName] = useState('');
    const [bookedIds, setBookedIds] = useState<Set<string>>(new Set());
    const [bookingMetaByRideId, setBookingMetaByRideId] = useState<
        Record<string, { bookingId: string; seatsBooked: number; paymentStatus?: string }>
    >({});
    const [seatsToBookByRideId, setSeatsToBookByRideId] = useState<Record<string, number>>({});
    const [bookingRideId, setBookingRideId] = useState<string | null>(null);
    const [pickupRequestedIds, setPickupRequestedIds] = useState<Set<string>>(new Set());
    const [pickupRequestIdByRideId, setPickupRequestIdByRideId] = useState<Record<string, string>>({});
    // Always-current request ids + in-flight creation promises so Cancel works even
    // while the background "send request" call is still resolving.
    const pickupRequestIdRef = useRef<Record<string, string>>({});
    const pendingPickupCreations = useRef<Record<string, Promise<string | null>>>({});
    const [cancellingRequestId, setCancellingRequestId] = useState<string | null>(null);
    const [driverProfiles, setDriverProfiles] = useState<
        Record<string, { name: string; gender?: string; photoUrl?: string | null }>
    >({});
    const [listViewMode, setListViewMode] = useState<'horizontal' | 'grid'>('horizontal');
    const [formCollapsed, setFormCollapsed] = useState(false);

    const syncActiveBookings = async (phone: string) => {
        try {
            const [bookings, pendingRequests] = await Promise.all([
                getUserBookings(phone),
                getPickupRequestsForRider(phone, 'pending'),
            ]);
            const rideIds = new Set<string>();
            const metaMap: Record<
                string,
                { bookingId: string; seatsBooked: number; paymentStatus?: string }
            > = {};
            for (const booking of bookings) {
                const rideId = resolveRelationId(booking.ride_id);
                if (!rideId) continue;
                rideIds.add(rideId);
                metaMap[rideId] = {
                    bookingId: String(booking.id),
                    seatsBooked: Math.max(1, Number(booking.seats_booked) || 1),
                    paymentStatus: String((booking as { payment_status?: string }).payment_status || 'pending'),
                };
            }
            setBookedIds(rideIds);
            setBookingMetaByRideId(metaMap);
            const pendingRideIds = new Set<string>();
            const requestIdMap: Record<string, string> = {};
            for (const request of pendingRequests) {
                const rideId = String(request.ride_id);
                if (rideIds.has(rideId)) continue;
                pendingRideIds.add(rideId);
                requestIdMap[rideId] = String(request.id);
            }
            setPickupRequestedIds(pendingRideIds);
            setPickupRequestIdByRideId(requestIdMap);
            pickupRequestIdRef.current = { ...requestIdMap };
        } catch {
            setBookedIds(new Set());
            setBookingMetaByRideId({});
            setPickupRequestedIds(new Set());
            setPickupRequestIdByRideId({});
            pickupRequestIdRef.current = {};
        }
    };

    useEffect(() => {
        const checkSession = async () => {
            const session = await getSession();
            if (session?.loggedIn) {
                const phone = session.phone || '';
                setUserPhone(phone);
                setUserName(getDisplayName(session.name, session.phone));
                if (phone) await syncActiveBookings(phone);
            }
        };
        checkSession();
    }, []);

    useFocusEffect(
        useCallback(() => {
            if (userPhone) syncActiveBookings(userPhone);
        }, [userPhone])
    );

    useEffect(() => {
        if (!userPhone) return;
        const interval = setInterval(() => {
            setRides((prev) => filterRidesForFind(prev, userPhone));
        }, FIND_RIDE_REFRESH_MS);
        return () => clearInterval(interval);
    }, [userPhone]);

    useEffect(() => {
        const allRides = [...rides, ...nearbyRides.map((n) => n.ride)];
        if (allRides.length === 0) {
            setDriverProfiles({});
            return;
        }

        let cancelled = false;
        const loadDriverProfiles = async () => {
            const cache = new Map<string, { name: string; gender?: string; photoUrl?: string | null }>();
            const entries: Record<string, { name: string; gender?: string; photoUrl?: string | null }> = {};

            for (const ride of allRides) {
                const raw = ride.driver_name || ride.driver_phone || '';
                const key = ride.id.toString();
                if (!cache.has(raw)) {
                    cache.set(raw, await resolveOwnerInfo(raw));
                }
                entries[key] = cache.get(raw)!;
            }

            if (!cancelled) setDriverProfiles(entries);
        };

        loadDriverProfiles();
        return () => {
            cancelled = true;
        };
    }, [rides, nearbyRides]);

    const handleSearch = async () => {
        if (!from || !to) {
            Alert.alert('Missing Info', 'Please enter both pickup and destination.');
            return;
        }
        setLoading(true);
        try {
            const data = await getRides();
            const eligible = filterRidesForFind(data, userPhone);
            const { exact, nearby, searchFromCoords, searchToCoords } =
                await partitionRideSearchResults(eligible, {
                from,
                to,
                fromCoords,
                toCoords,
            });
            setRides(exact);
            setNearbyRides(nearby);
            setResolvedSearchFrom(searchFromCoords);
            setResolvedSearchTo(searchToCoords);
            setPickupRequestedIds(new Set());
            setSearched(true);
            setFormCollapsed(true);
        } catch (error) {
            Alert.alert('Error', 'Could not fetch rides. Try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleRequestNearby = (item: any, match: NearbyRideMatch) => {
        const rideId = item.id.toString();
        const departureTs = parseRideDepartureTime(item.departure_time);
        if (!Number.isNaN(departureTs) && departureTs <= Date.now()) {
            Alert.alert('Ride started', 'This ride has already started and cannot be newly requested.');
            return;
        }
        if (pickupRequestedIds.has(rideId) || bookedIds.has(rideId)) {
            return;
        }

        const seatsLeft = getAvailableSeats(item);
        if (seatsLeft < 1) {
            Alert.alert('Ride full', 'No seats available on this ride.');
            return;
        }

        if (!userPhone) {
            Alert.alert('Login Required', 'Please log in first.');
            router.push('/login');
            return;
        }

        const seatsBooked = getSeatsToBook(rideId, seatsLeft);
        const pricePerSeat = parseInt(item.price_per_seat, 10) || 0;
        const ownerPhone = String(match.ride.driver_name || '');

        // Optimistically show Call + Cancel immediately; send in the background.
        setPickupRequestedIds((prev) => new Set(prev).add(rideId));

        const creation = (async (): Promise<string | null> => {
            const session = await getSession();
            if (!session?.loggedIn) {
                throw new Error('Please log in first.');
            }
            const request = await requestNearbyPickup({
                rideId,
                rideOwnerPhone: ownerPhone,
                riderPhone: session.phone,
                riderName: getDisplayName(session.name, session.phone) || session.phone,
                riderPickup: from,
                pickupDistanceMiles: match.pickupDistanceMiles,
                seatsBooked,
                totalPrice: pricePerSeat * seatsBooked,
            });
            const id = request?.id ? String(request.id) : null;
            if (id) {
                pickupRequestIdRef.current[rideId] = id;
                setPickupRequestIdByRideId((prev) => ({ ...prev, [rideId]: id }));
            }
            return id;
        })();

        pendingPickupCreations.current[rideId] = creation;
        creation
            .catch((error: any) => {
                // Roll back the optimistic state if the background send failed.
                setPickupRequestedIds((prev) => {
                    const next = new Set(prev);
                    next.delete(rideId);
                    return next;
                });
                Alert.alert('Error', error?.message || 'Could not send request.');
            })
            .finally(() => {
                delete pendingPickupCreations.current[rideId];
            });
    };

    const handlePayBooking = (rideId: string) => {
        const meta = bookingMetaByRideId[rideId];
        if (!meta?.bookingId) return;
        router.push({
            pathname: '/booking',
            params: { viewOnly: 'true', bookingId: meta.bookingId },
        });
    };

    const getSeatsToBook = (rideId: string, maxAvailable: number) => {
        const raw = seatsToBookByRideId[rideId] ?? 1;
        return Math.min(Math.max(1, raw), Math.max(1, maxAvailable));
    };

    const setSeatsToBook = (rideId: string, next: number, maxAvailable: number) => {
        const clamped = Math.min(Math.max(1, next), Math.max(1, maxAvailable));
        setSeatsToBookByRideId((prev) => ({ ...prev, [rideId]: clamped }));
    };

    const bumpRideSeatsInList = (rideId: string, seatDelta: number) => {
        setRides((prev) =>
            prev.map((ride) => {
                if (ride.id.toString() !== rideId) return ride;
                return {
                    ...ride,
                    available_seats: Math.max(0, getAvailableSeats(ride) + seatDelta),
                };
            })
        );
    };

    const handleBook = async (item: any) => {
        const rideId = item.id.toString();
        const departureTs = parseRideDepartureTime(item.departure_time);
        if (!Number.isNaN(departureTs) && departureTs <= Date.now()) {
            Alert.alert('Ride started', 'This ride has already started and cannot be newly booked.');
            return;
        }
        if (bookedIds.has(rideId) || bookingRideId === rideId) return;

        const seatsLeft = getAvailableSeats(item);
        if (seatsLeft < 1) {
            Alert.alert('Ride full', 'No seats available on this ride.');
            return;
        }

        setBookingRideId(rideId);
        try {
            const session = await getSession();
            if (!session?.loggedIn) {
                Alert.alert('Login Required', 'Please log in to book a ride.');
                router.push('/login');
                return;
            }
            const seatsBooked = getSeatsToBook(rideId, seatsLeft);
            const pricePerSeat = parseInt(item.price_per_seat, 10) || 0;
            const booking = await createBooking({
                ride_id: rideId,
                rider_name: session?.name?.trim() || session?.phone,
                rider_phone: session?.phone,
                seats_booked: seatsBooked,
                total_price: pricePerSeat * seatsBooked,
                payment_status: 'pending',
            });
            setBookedIds((prev) => new Set(prev).add(rideId));
            if (booking?.id) {
                setBookingMetaByRideId((prev) => ({
                    ...prev,
                    [rideId]: {
                        bookingId: String(booking.id),
                        seatsBooked,
                        paymentStatus: 'pending',
                    },
                }));
            }
            bumpRideSeatsInList(rideId, -seatsBooked);
        } catch (error: any) {
            const msg =
                error?.response?.data?.errors?.[0]?.message ||
                error?.message ||
                'Could not book this ride. Try again.';
            Alert.alert('Error', msg);
        } finally {
            setBookingRideId(null);
        }
    };

    const getDriverPhone = (item: any) => {
        const raw = item.driver_phone || item.driver_name || '';
        const digits = raw.replace(/\D/g, '').slice(-10);
        return digits.length === 10 ? digits : null;
    };

    const handleCallDriver = (item: any) => {
        const phone = getDriverPhone(item);
        if (phone) {
            Linking.openURL(`tel:${phone}`);
        } else {
            Alert.alert('Unavailable', 'Ride owner phone number not available.');
        }
    };

    const clearPickupRequestState = (rideId: string) => {
        delete pickupRequestIdRef.current[rideId];
        setPickupRequestedIds((prev) => {
            const next = new Set(prev);
            next.delete(rideId);
            return next;
        });
        setPickupRequestIdByRideId((prev) => {
            const next = { ...prev };
            delete next[rideId];
            return next;
        });
    };

    const handleCancelPickupRequest = (rideId: string) => {
        if (cancellingRequestId === rideId) return;

        Alert.alert(
            'Cancel request?',
            'Withdraw your pickup request before the owner responds?',
            [
                { text: 'Keep request', style: 'cancel' },
                {
                    text: 'Cancel request',
                    style: 'destructive',
                    onPress: async () => {
                        setCancellingRequestId(rideId);
                        try {
                            // The background send may still be resolving — wait for its id.
                            let requestId = pickupRequestIdRef.current[rideId];
                            if (!requestId && pendingPickupCreations.current[rideId]) {
                                requestId = (await pendingPickupCreations.current[rideId]) || '';
                            }
                            if (!requestId) {
                                // Nothing reached the server (send failed) — just clear the UI.
                                clearPickupRequestState(rideId);
                                return;
                            }
                            await cancelPickupRequest(requestId, userPhone);
                            clearPickupRequestState(rideId);
                        } catch (error: any) {
                            Alert.alert('Error', error?.message || 'Could not cancel request.');
                        } finally {
                            setCancellingRequestId(null);
                        }
                    },
                },
            ]
        );
    };

    const handleDeleteRide = (rideId: string) => {
        Alert.alert(
            'Cancel Booking?',
            'Are you sure you want to cancel this booking?',
            [
                { text: 'No, Keep It', style: 'cancel' },
                {
                    text: 'Yes, Cancel',
                    style: 'destructive',
                    onPress: async () => {
                        const meta = bookingMetaByRideId[rideId];
                        if (!meta?.bookingId) {
                            Alert.alert('Error', 'Could not find this booking to cancel.');
                            return;
                        }
                        try {
                            await cancelBooking(meta.bookingId, userPhone);
                            setBookedIds((prev) => {
                                const next = new Set(prev);
                                next.delete(rideId);
                                return next;
                            });
                            setBookingMetaByRideId((prev) => {
                                const next = { ...prev };
                                delete next[rideId];
                                return next;
                            });
                            setPickupRequestIdByRideId((prev) => {
                                const next = { ...prev };
                                delete next[rideId];
                                return next;
                            });
                            setPickupRequestedIds((prev) => {
                                const next = new Set(prev);
                                next.delete(rideId);
                                return next;
                            });
                            bumpRideSeatsInList(rideId, meta.seatsBooked);
                        } catch (error: any) {
                            const msg =
                                error?.response?.data?.errors?.[0]?.message ||
                                error?.message ||
                                'Could not cancel booking. Try again.';
                            Alert.alert('Error', msg);
                        }
                    },
                },
            ]
        );
    };

    const renderRideCard = (item: any, nearby?: NearbyRideMatch) => {
        const rideId = item.id.toString();
        const isBooked = bookedIds.has(rideId);
        const isBooking = bookingRideId === rideId;
        const driver = driverProfiles[rideId];
        const ownerName = driver?.name || 'Owner';
        const genderDisplay = getGenderDisplay(driver?.gender);
        const ownerSubtitle = genderDisplay
            ? `${genderDisplay.icon} ${genderDisplay.label}`
            : undefined;
        const seatsLeft = getAvailableSeats(item);
        const isFull = seatsLeft < 1 && !isBooked;
        const seatsToBook = getSeatsToBook(rideId, seatsLeft);
        const pricePerSeat = parseInt(item.price_per_seat, 10) || 0;
        const bookingTotal = pricePerSeat * seatsToBook;
        const bookedMeta = bookingMetaByRideId[rideId];
        const pickupRequested = pickupRequestedIds.has(rideId);
        const departureTs = parseRideDepartureTime(item.departure_time);
        const rideStarted = !Number.isNaN(departureTs) && departureTs <= Date.now();
        const needsPayment =
            isBooked &&
            bookedMeta &&
            String(bookedMeta.paymentStatus || 'pending').toLowerCase() !== 'paid';

        return (
            <View
                key={nearby ? `nearby-${rideId}` : rideId}
                style={[
                    styles.rideCard,
                    listViewMode === 'horizontal' ? styles.rideCardHorizontal : styles.rideCardGrid,
                ]}
            >
                {nearby ? (
                    <View style={styles.nearbyBadgeRow}>
                        <Text style={styles.nearbyBadge}>
                            📍 {formatDistanceMiles(nearby.pickupDistanceMiles)} from your pickup
                        </Text>
                    </View>
                ) : null}

                <View style={styles.rideTop}>
                    <RideOwnerRow
                        name={ownerName}
                        photoUrl={driver?.photoUrl}
                        subtitle={ownerSubtitle}
                        size={44}
                    />
                    <Text style={styles.price}>₹{item.price_per_seat}</Text>
                </View>
                <View style={styles.rideMiddle}>
                    {searched && from && to ? (
                        <View style={styles.routeCompareBox}>
                            <Text style={styles.routeCompareHeading}>Ride route</Text>
                            <View style={styles.routeCompareRow}>
                                <View style={[styles.routeDot, styles.routeDotStart]} />
                                <View style={styles.routeCompareText}>
                                    <Text style={styles.routePointLabel}>Ride start</Text>
                                    <Text style={styles.routePointValue}>{item.from_location}</Text>
                                    {nearby ? (
                                        <Text style={styles.routePointMeta}>
                                            {formatDistanceMiles(nearby.pickupDistanceMiles)} from your start
                                        </Text>
                                    ) : null}
                                </View>
                            </View>
                            <View style={styles.routeCompareRow}>
                                <View style={[styles.routeDot, styles.routeDotEnd]} />
                                <View style={styles.routeCompareText}>
                                    <Text style={styles.routePointLabel}>Ride end</Text>
                                    <Text style={styles.routePointValue}>{item.to_location}</Text>
                                    {nearby?.dropDistanceMiles != null ? (
                                        <Text style={styles.routePointMeta}>
                                            {formatDistanceMiles(nearby.dropDistanceMiles)} from your end
                                        </Text>
                                    ) : null}
                                </View>
                            </View>

                            <Text style={styles.meta}>🕐 {formatRideTime(item.departure_time)}</Text>
                        </View>
                    ) : (
                        <View style={styles.routeBlock}>
                            <Text style={styles.route}>
                                {item.from_location} → {item.to_location}
                            </Text>
                            <Text style={styles.meta}>🕐 {formatRideTime(item.departure_time)}</Text>
                        </View>
                    )}
                </View>

                <View style={styles.rideBottom}>
                    <View style={styles.rideBottomLeft}>
                        <Text style={styles.meta}>
                            💺 {seatsLeft} seat{seatsLeft === 1 ? '' : 's'} left
                        </Text>
                        {isBooked && bookedMeta ? (
                            <Text style={styles.bookedSeatsMeta}>
                                Your booking: {bookedMeta.seatsBooked} seat
                                {bookedMeta.seatsBooked === 1 ? '' : 's'}
                            </Text>
                        ) : !isFull ? (
                            <View style={styles.seatPickerRow}>
                                <SeatSelector
                                    value={seatsToBook}
                                    max={seatsLeft}
                                    onChange={(n) => setSeatsToBook(rideId, n, seatsLeft)}
                                    disabled={isBooking}
                                    label={nearby ? 'Seats' : 'Book seats'}
                                />
                                {pricePerSeat > 0 ? (
                                    <Text style={styles.totalHint}>₹{bookingTotal} total</Text>
                                ) : null}
                            </View>
                        ) : null}
                    </View>
                    {isBooking ? (
                        <View style={[styles.bookButton, styles.bookingButton]}>
                            <Text style={styles.bookText}>Booking...</Text>
                        </View>
                    ) : isBooked ? (
                        needsPayment ? (
                            <View style={[styles.bookButton, styles.bookedButton, styles.bookedToggle]}>
                                <TouchableOpacity
                                    style={styles.payPart}
                                    onPress={() => handlePayBooking(rideId)}
                                >
                                    <Text style={styles.bookText}>Pay</Text>
                                </TouchableOpacity>
                                <View style={styles.bookedDivider} />
                                <TouchableOpacity
                                    style={styles.callPart}
                                    onPress={() => handleCallDriver(item)}
                                >
                                    <Text style={styles.bookText}>📞</Text>
                                </TouchableOpacity>
                                <View style={styles.bookedDivider} />
                                <TouchableOpacity
                                    style={styles.bookedPart}
                                    onPress={() => handleDeleteRide(rideId)}
                                >
                                    <Text style={styles.bookText}>Cancel</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                        <View style={[styles.bookButton, styles.bookedButton, styles.bookedToggle]}>
                            <TouchableOpacity
                                style={styles.callPart}
                                onPress={() => handleCallDriver(item)}
                            >
                                <Text style={styles.bookText}>📞</Text>
                            </TouchableOpacity>
                            <View style={styles.bookedDivider} />
                            <TouchableOpacity
                                style={styles.bookedPart}
                                onPress={() => handleDeleteRide(rideId)}
                            >
                                <Text style={styles.bookText}>Cancel</Text>
                            </TouchableOpacity>
                        </View>
                        )
                    ) : isFull ? (
                        <View style={[styles.bookButton, styles.fullButton]}>
                            <Text style={styles.bookText}>Full</Text>
                        </View>
                    ) : rideStarted ? (
                        <View style={[styles.bookButton, styles.fullButton]}>
                            <Text style={styles.bookText}>Started</Text>
                        </View>
                    ) : nearby ? (
                        pickupRequested ? (
                            <View style={[styles.bookButton, styles.pendingButton, styles.bookedToggle]}>
                                <TouchableOpacity
                                    style={styles.pendingActionPart}
                                    onPress={() => handleCallDriver(item)}
                                >
                                    <Text style={styles.pendingBookText}>📞</Text>
                                </TouchableOpacity>
                                <View style={styles.pendingDivider} />
                                <TouchableOpacity
                                    style={styles.pendingActionPart}
                                    onPress={() => handleCancelPickupRequest(rideId)}
                                    disabled={cancellingRequestId === rideId}
                                >
                                    <Text style={styles.pendingBookText} numberOfLines={1}>
                                        {cancellingRequestId === rideId ? '…' : 'Cancel'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <TouchableOpacity
                                style={styles.bookButton}
                                onPress={() => handleRequestNearby(item, nearby)}
                            >
                                <Text style={styles.bookText} numberOfLines={1}>
                                    Request
                                </Text>
                            </TouchableOpacity>
                        )
                    ) : (
                        <TouchableOpacity
                            style={styles.bookButton}
                            onPress={() => handleBook(item)}
                        >
                            <Text style={styles.bookText}>Book</Text>
                        </TouchableOpacity>
                    )}
                </View>
                <SearchRideMap
                    rideFromLocation={item.from_location}
                    rideToLocation={item.to_location}
                    viaPoints={item.via_points ? item.via_points.split(',') : []}
                    userPickupCoords={resolvedSearchFrom}
                    userDropCoords={resolvedSearchTo}
                    rideFromCoords={nearby?.rideFromCoords}
                    rideToCoords={nearby?.rideToCoords}
                    pickupDistanceMiles={nearby?.pickupDistanceMiles}
                    dropDistanceMiles={nearby?.dropDistanceMiles}
                    height={200}
                />
            </View>
        );
    };

    const combinedRideResults = useMemo(
        () => [
            ...rides.map((ride) => ({ ride, nearby: undefined as NearbyRideMatch | undefined })),
            ...nearbyRides.map((nearby) => ({ ride: nearby.ride, nearby })),
        ],
        [rides, nearbyRides]
    );

    const renderRideList = (items: any[], render: (item: any) => any) => {
        if (listViewMode === 'horizontal') {
            return (
                <ScrollView
                    horizontal
                    nestedScrollEnabled
                    directionalLockEnabled
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.horizontalListContent}
                >
                    {items.map(render)}
                </ScrollView>
            );
        }
        return <View style={styles.gridList}>{items.map(render)}</View>;
    };

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
                <View style={styles.headerTopRow}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton} hitSlop={12}>
                        <Text style={styles.backText}>← Back</Text>
                    </TouchableOpacity>
                    <ProfileNavButton size={40} variant="light" />
                </View>
                <View style={styles.headerText}>
                    <Text style={styles.title}>Find a Ride</Text>
                    <Text style={styles.subtitle}>Search carpools on your route</Text>
                </View>
            </View>

            {searched && formCollapsed ? (
                <TouchableOpacity
                    style={styles.compactSearch}
                    activeOpacity={0.8}
                    onPress={() => setFormCollapsed(false)}
                >
                    <View style={styles.compactRouteWrap}>
                        <Text style={styles.compactRoute} numberOfLines={1}>
                            {from || 'Pickup'} → {to || 'Destination'}
                        </Text>
                        <Text style={styles.compactSub}>
                            {combinedRideResults.length} ride{combinedRideResults.length === 1 ? '' : 's'} on your route
                        </Text>
                    </View>
                    <View style={styles.editSearchBtn}>
                        <Text style={styles.editSearchText}>Edit</Text>
                    </View>
                </TouchableOpacity>
            ) : (
                <View style={styles.searchContainer}>
                    {from && to ? (
                        <View style={styles.routeMapTop}>
                            <RideMap
                                fromLocation={from}
                                toLocation={to}
                                fromCoords={fromCoords}
                                toCoords={toCoords}
                                height={120}
                            />
                        </View>
                    ) : null}

                    <View style={styles.routeCard}>
                        <View style={styles.routeLine} pointerEvents="none" />
                        <View style={[styles.fieldWrap, styles.fieldWrapTop]}>
                            <LocationInput
                                variant="pickup"
                                placeholder="From where?"
                                onLocationSelect={(sel) => {
                                    setFrom(sel.address);
                                    setFromCoords(sel.coords || null);
                                }}
                            />
                        </View>
                        <View style={styles.fieldWrap}>
                            <LocationInput
                                variant="dropoff"
                                placeholder="Going to?"
                                onLocationSelect={(sel) => {
                                    setTo(sel.address);
                                    setToCoords(sel.coords || null);
                                }}
                            />
                        </View>
                    </View>

                    <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
                        <Text style={styles.searchText}>Search Rides 🔍</Text>
                    </TouchableOpacity>
                </View>
            )}

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                {loading && (
                    <ActivityIndicator size="large" color="#1a73e8" style={styles.loader} />
                )}

                {searched && !loading && combinedRideResults.length === 0 && (
                    <View style={styles.empty}>
                        <Text style={styles.emptyIcon}>🚗</Text>
                        <Text style={styles.emptyText}>
                            No rides found within {NEARBY_PICKUP_RADIUS_MILES} miles of your route
                        </Text>
                    </View>
                )}

                {searched && !loading && combinedRideResults.length > 0 ? (
                    <View style={styles.viewToggleRow}>
                        <Text style={styles.viewToggleLabel}>View</Text>
                        <View style={styles.viewToggleWrap}>
                            <TouchableOpacity
                                style={[
                                    styles.viewToggleButton,
                                    listViewMode === 'horizontal' && styles.viewToggleButtonActive,
                                ]}
                                onPress={() => setListViewMode('horizontal')}
                            >
                                <Text
                                    style={[
                                        styles.viewToggleText,
                                        listViewMode === 'horizontal' && styles.viewToggleTextActive,
                                    ]}
                                >
                                    Horizontal
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[
                                    styles.viewToggleButton,
                                    listViewMode === 'grid' && styles.viewToggleButtonActive,
                                ]}
                                onPress={() => setListViewMode('grid')}
                            >
                                <Text
                                    style={[
                                        styles.viewToggleText,
                                        listViewMode === 'grid' && styles.viewToggleTextActive,
                                    ]}
                                >
                                    Grid
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : null}

                {searched && !loading && combinedRideResults.length > 0 ? (
                    <>
                        <Text style={styles.sectionTitle}>Matching rides</Text>
                        <Text style={styles.sectionSub}>
                            Exact and nearby rides are shown together in one list
                        </Text>
                        {renderRideList(combinedRideResults, (entry) =>
                            renderRideCard(entry.ride, entry.nearby)
                        )}
                    </>
                ) : null}

                {!searched && !loading && !from && !to && (
                    <View style={styles.empty}>
                        <Text style={styles.emptyIcon}>🚗</Text>
                        <Text style={styles.emptyText}>Enter your route to find rides</Text>
                        {userPhone ? (
                            <TouchableOpacity
                                style={styles.myRidesLink}
                                onPress={() => router.push('/myrides')}
                            >
                                <Text style={styles.myRidesLinkText}>
                                    View your offered rides in My Rides →
                                </Text>
                            </TouchableOpacity>
                        ) : null}
                    </View>
                )}

                {!searched && !loading && from && to ? (
                    <View style={styles.searchPrompt}>
                        <Text style={styles.searchPromptText}>
                            Tap Search Rides to find carpools on this route
                        </Text>
                    </View>
                ) : null}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 20, paddingBottom: 24 },
    header: {
        backgroundColor: '#1a73e8',
        paddingHorizontal: 24,
        paddingBottom: 24,
    },
    backButton: { marginBottom: 0 },
    backText: { color: '#fff', fontSize: 16, fontWeight: '600', opacity: 0.95 },
    headerTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    headerText: { flex: 1 },
    title: { color: '#fff', fontSize: 26, fontWeight: 'bold' },
    subtitle: { color: '#fff', fontSize: 16, opacity: 0.9, marginTop: 4 },
    searchContainer: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 14,
        marginHorizontal: 20,
        marginTop: 12,
        marginBottom: 8,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        zIndex: 9999,
        overflow: 'visible',
    },
    compactSearch: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        marginHorizontal: 20,
        marginTop: 12,
        marginBottom: 8,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
    },
    compactRouteWrap: { flex: 1, paddingRight: 12 },
    compactRoute: { fontSize: 15, fontWeight: '700', color: '#222' },
    compactSub: { fontSize: 12, color: '#666', marginTop: 2 },
    editSearchBtn: {
        backgroundColor: '#eaf1fe',
        borderRadius: 8,
        paddingHorizontal: 14,
        paddingVertical: 8,
    },
    editSearchText: { color: '#1a73e8', fontWeight: '700', fontSize: 13 },
    routeCard: {
        width: '100%',
        position: 'relative',
    },
    routeLine: {
        position: 'absolute',
        left: 16,
        top: 34,
        width: 2,
        height: 44,
        backgroundColor: '#dadce0',
        zIndex: 1,
    },
    fieldWrap: {
        width: '100%',
        zIndex: 10,
    },
    fieldWrapTop: {
        marginBottom: 12,
        zIndex: 20,
    },
    searchButton: {
        backgroundColor: '#1a73e8',
        borderRadius: 12,
        padding: 12,
        alignItems: 'center',
        marginTop: 10,
        shadowColor: '#1a73e8',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
        elevation: 3,
    },
    searchText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
    searchHint: {
        fontSize: 12,
        color: '#666',
        textAlign: 'center',
        marginTop: 10,
        lineHeight: 17,
    },
    routeMapPreview: { marginTop: 16 },
    routeMapTop: { marginBottom: 12 },
    routeMapLabel: {
        fontSize: 13,
        fontWeight: '700',
        color: '#333',
        marginBottom: 8,
    },
    mapPlaceholder: {
        height: 180,
        backgroundColor: '#f0f5ff',
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#dbeafe',
        borderStyle: 'dashed',
    },
    mapPlaceholderIcon: { fontSize: 32, marginBottom: 8 },
    mapPlaceholderText: { fontSize: 14, fontWeight: '600', color: '#1a73e8' },
    mapPlaceholderSub: { fontSize: 12, color: '#666', marginTop: 4 },
    searchPrompt: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
    },
    searchPromptText: { fontSize: 14, color: '#666', textAlign: 'center' },
    sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 8, marginTop: 4 },
    sectionSub: { fontSize: 13, color: '#666', marginBottom: 12 },
    viewToggleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
        marginTop: 6,
    },
    viewToggleLabel: { fontSize: 13, fontWeight: '600', color: '#555' },
    viewToggleWrap: {
        flexDirection: 'row',
        backgroundColor: '#eef3fb',
        borderRadius: 10,
        padding: 3,
    },
    viewToggleButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    viewToggleButtonActive: { backgroundColor: '#1a73e8' },
    viewToggleText: { fontSize: 12, fontWeight: '700', color: '#567' },
    viewToggleTextActive: { color: '#fff' },
    loader: { marginVertical: 40 },
    rideCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, elevation: 2, overflow: 'visible' },
    rideCardHorizontal: { width: 320, marginRight: 12 },
    rideCardGrid: { width: '48%' },
    horizontalListContent: { paddingBottom: 4, paddingRight: 8 },
    gridList: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    nearbyBadgeRow: { marginBottom: 10 },
    nearbyBadge: {
        alignSelf: 'flex-start',
        backgroundColor: '#fff8e1',
        color: '#e65100',
        fontSize: 12,
        fontWeight: '700',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 8,
        overflow: 'hidden',
    },
    emptyHint: {
        backgroundColor: '#fff3cd',
        borderRadius: 12,
        padding: 12,
        marginBottom: 12,
    },
    emptyHintText: { fontSize: 13, color: '#856404', textAlign: 'center' },
    rideTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, alignItems: 'flex-start' },
    driverBlock: { flex: 1, paddingRight: 8 },
    driverName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
    genderMeta: { fontSize: 13, color: '#666', marginTop: 4 },
    price: { fontSize: 18, fontWeight: 'bold', color: '#1a73e8' },
    rideMiddle: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
    routeBlock: { flex: 1, gap: 4 },
    route: { fontSize: 14, color: '#555', flexWrap: 'wrap' },
    routeCompareBox: {
        flex: 1,
        backgroundColor: '#f8fafc',
        borderRadius: 12,
        padding: 12,
        gap: 8,
    },
    routeCompareHeading: {
        fontSize: 12,
        fontWeight: '700',
        color: '#1a73e8',
        textTransform: 'uppercase',
        letterSpacing: 0.4,
    },
    routeCompareRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
    },
    routeDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginTop: 4,
    },
    routeDotStart: { backgroundColor: '#34a853' },
    routeDotEnd: { backgroundColor: '#ea4335' },
    routeCompareText: { flex: 1 },
    routePointLabel: {
        fontSize: 11,
        fontWeight: '700',
        color: '#666',
        marginBottom: 2,
    },
    routePointValue: {
        fontSize: 14,
        color: '#222',
        lineHeight: 20,
    },
    routePointMeta: {
        fontSize: 11,
        color: '#e65100',
        marginTop: 2,
        fontWeight: '600',
    },
    routeCompareDivider: {
        height: 1,
        backgroundColor: '#dbeafe',
        marginVertical: 4,
    },
    rideBottom: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        marginBottom: 12,
        gap: 12,
    },
    rideBottomLeft: { flex: 1 },
    seatPickerRow: { marginTop: 10, flexDirection: 'row', alignItems: 'flex-end', gap: 16 },
    totalHint: { fontSize: 14, fontWeight: '700', color: '#1a73e8', marginBottom: 8 },
    bookedSeatsMeta: { fontSize: 12, color: '#34a853', marginTop: 4, fontWeight: '600' },
    meta: { fontSize: 13, color: '#666' },
    bookButton: {
        backgroundColor: '#1a73e8',
        borderRadius: 8,
        width: 112,
        minHeight: 36,
        alignItems: 'center',
        justifyContent: 'center',
    },
    fullButton: { backgroundColor: '#9e9e9e' },
    bookedButton: {
        backgroundColor: '#34a853',
        paddingHorizontal: 0,
        paddingVertical: 0,
        width: 190,
    },
    pendingButton: {
        backgroundColor: '#fff9c4',
        width: 160,
        paddingHorizontal: 0,
        paddingVertical: 0,
    },
    pendingActionPart: {
        flex: 1,
        paddingVertical: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    pendingDivider: { width: 1, backgroundColor: 'rgba(146, 64, 14, 0.2)', marginVertical: 8 },
    pendingBookText: { color: '#92400e', fontWeight: 'bold', fontSize: 14, textAlign: 'center' },
    bookedToggle: { flexDirection: 'row', alignItems: 'stretch' },
    payPart: {
        flex: 1,
        minWidth: 36,
        paddingVertical: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    callPart: {
        width: 36,
        paddingVertical: 8,
        justifyContent: 'center',
        alignItems: 'center',
        flexShrink: 0,
    },
    bookedPart: {
        flex: 1,
        minWidth: 48,
        paddingVertical: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    bookedDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.35)', marginVertical: 8 },
    bookingButton: { backgroundColor: '#93b8f5' },
    bookText: { color: '#fff', fontWeight: 'bold', fontSize: 14, textAlign: 'center' },
    empty: { alignItems: 'center', paddingVertical: 40 },
    emptyIcon: { fontSize: 64, marginBottom: 16 },
    emptyText: { fontSize: 16, color: '#999', textAlign: 'center' },
    myRidesLink: { marginTop: 16, paddingVertical: 10, paddingHorizontal: 16 },
    myRidesLinkText: { color: '#1a73e8', fontSize: 14, fontWeight: '600' },
});