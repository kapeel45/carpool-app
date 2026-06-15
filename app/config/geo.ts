const GOOGLE_MAPS_API_KEY =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || 'AIzaSyBhjfn1ZfqiR4zSGT8clhe2Yc-X8FYifF8';

export type Coordinates = {
    latitude: number;
    longitude: number;
};

export type LocationSelection = {
    address: string;
    coords?: Coordinates | null;
};

/** Max distance from rider pickup to ride pickup for "nearby" rides. */
export const NEARBY_PICKUP_RADIUS_MILES = 3;

/** Max distance from rider drop to ride drop when matching nearby rides. */
export const NEARBY_DROP_RADIUS_MILES = 5;

const MILES_PER_KM = 0.621371;

export const milesToKm = (miles: number) => miles / MILES_PER_KM;

export const formatDistanceMiles = (miles: number) => {
    if (miles < 0.1) return '< 0.1 mi';
    if (miles < 10) return `${miles.toFixed(1)} mi`;
    return `${Math.round(miles)} mi`;
};

/** Haversine distance in miles. */
export const distanceMiles = (a: Coordinates, b: Coordinates): number => {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const R_km = 6371;
    const dLat = toRad(b.latitude - a.latitude);
    const dLon = toRad(b.longitude - a.longitude);
    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);
    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    const km = 2 * R_km * Math.asin(Math.sqrt(h));
    return km * MILES_PER_KM;
};

export const geocodeAddress = async (address: string): Promise<Coordinates | null> => {
    const trimmed = address?.trim();
    if (!trimmed) return null;

    try {
        const response = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(trimmed + ', Pune, India')}&key=${GOOGLE_MAPS_API_KEY}`
        );
        const data = await response.json();
        if (data.results?.[0]?.geometry?.location) {
            const { lat, lng } = data.results[0].geometry.location;
            return { latitude: lat, longitude: lng };
        }
    } catch (error) {
        console.warn('geocodeAddress failed:', error);
    }
    return null;
};

export const coordsFromRide = (ride: {
    from_lat?: number | string | null;
    from_lng?: number | string | null;
    to_lat?: number | string | null;
    to_lng?: number | string | null;
}): { from: Coordinates | null; to: Coordinates | null } => {
    const fromLat = Number(ride.from_lat);
    const fromLng = Number(ride.from_lng);
    const toLat = Number(ride.to_lat);
    const toLng = Number(ride.to_lng);

    return {
        from:
            Number.isFinite(fromLat) && Number.isFinite(fromLng)
                ? { latitude: fromLat, longitude: fromLng }
                : null,
        to:
            Number.isFinite(toLat) && Number.isFinite(toLng)
                ? { latitude: toLat, longitude: toLng }
                : null,
    };
};

export const ensureRideCoords = async (
    ride: {
        from_location?: string;
        to_location?: string;
        from_lat?: number | string | null;
        from_lng?: number | string | null;
        to_lat?: number | string | null;
        to_lng?: number | string | null;
    },
    cache: Map<string, Coordinates | null>
): Promise<{ from: Coordinates | null; to: Coordinates | null }> => {
    let { from, to } = coordsFromRide(ride);

    if (!from && ride.from_location) {
        const key = `from:${ride.from_location}`;
        if (!cache.has(key)) {
            cache.set(key, await geocodeAddress(ride.from_location));
        }
        from = cache.get(key) || null;
    }

    if (!to && ride.to_location) {
        const key = `to:${ride.to_location}`;
        if (!cache.has(key)) {
            cache.set(key, await geocodeAddress(ride.to_location));
        }
        to = cache.get(key) || null;
    }

    return { from, to };
};

const destinationMatches = (
    userTo: string,
    rideTo: string,
    userToCoords: Coordinates | null,
    rideToCoords: Coordinates | null
) => {
    const searchTo = userTo.toLowerCase().trim();
    const rideToText = rideTo.toLowerCase().trim();
    if (searchTo && rideToText.includes(searchTo)) return true;
    if (searchTo && searchTo.includes(rideToText.split(',')[0]?.trim() || '')) return true;

    if (userToCoords && rideToCoords) {
        return distanceMiles(userToCoords, rideToCoords) <= NEARBY_DROP_RADIUS_MILES;
    }
    return false;
};

export type NearbyRideMatch = {
    ride: Record<string, unknown>;
    pickupDistanceMiles: number;
    dropDistanceMiles?: number;
    rideFromCoords: Coordinates;
    rideToCoords: Coordinates | null;
};

export type RideSearchPartition = {
    exact: Record<string, unknown>[];
    nearby: NearbyRideMatch[];
    searchFromCoords: Coordinates | null;
    searchToCoords: Coordinates | null;
};

export const partitionRideSearchResults = async (
    rides: Record<string, unknown>[],
    search: {
        from: string;
        to: string;
        fromCoords: Coordinates | null;
        toCoords: Coordinates | null;
    }
): Promise<RideSearchPartition> => {
    const searchFrom = search.from.toLowerCase().trim();
    const searchTo = search.to.toLowerCase().trim();
    const geocodeCache = new Map<string, Coordinates | null>();

    let userFromCoords = search.fromCoords;
    let userToCoords = search.toCoords;
    if (!userFromCoords && search.from) {
        userFromCoords = await geocodeAddress(search.from);
    }
    if (!userToCoords && search.to) {
        userToCoords = await geocodeAddress(search.to);
    }

    const exact: Record<string, unknown>[] = [];
    const nearby: NearbyRideMatch[] = [];

    for (const ride of rides) {
        const rideFrom = String(ride.from_location || '').toLowerCase();
        const rideTo = String(ride.to_location || '').toLowerCase();
        const isExact =
            searchFrom &&
            searchTo &&
            rideFrom.includes(searchFrom) &&
            rideTo.includes(searchTo);

        if (isExact) {
            exact.push(ride);
            continue;
        }

        if (!userFromCoords) continue;

        const rideCoords = await ensureRideCoords(ride, geocodeCache);
        if (!rideCoords.from) continue;

        const pickupDistanceMiles = distanceMiles(userFromCoords, rideCoords.from);
        if (pickupDistanceMiles > NEARBY_PICKUP_RADIUS_MILES) continue;

        if (!destinationMatches(search.to, String(ride.to_location || ''), userToCoords, rideCoords.to)) {
            continue;
        }

        const dropDistanceMiles =
            userToCoords && rideCoords.to
                ? distanceMiles(userToCoords, rideCoords.to)
                : undefined;

        nearby.push({
            ride,
            pickupDistanceMiles,
            dropDistanceMiles,
            rideFromCoords: rideCoords.from,
            rideToCoords: rideCoords.to,
        });
    }

    nearby.sort((a, b) => a.pickupDistanceMiles - b.pickupDistanceMiles);
    return {
        exact,
        nearby,
        searchFromCoords: userFromCoords,
        searchToCoords: userToCoords,
    };
};
