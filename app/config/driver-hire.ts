export type DriverHireListing = {
    id: string;
    driver_phone: string;
    driver_name?: string | null;
    title: string;
    intro?: string | null;
    services?: string | null;
    rate_per_shift?: number | null;
    food_allowance?: number | null;
    food_note?: string | null;
    visible_days?: number | null;
    available_until?: string | null;
    status?: string | null;
    date_created?: string | null;
};

export const HIRE_VISIBLE_DAY_OPTIONS = [1, 3, 7, 14, 30];
export const DEFAULT_HIRE_VISIBLE_DAYS = 7;

export const calcAvailableUntil = (visibleDays: number): string => {
    const d = new Date();
    d.setDate(d.getDate() + Math.max(1, Math.floor(visibleDays)));
    return d.toISOString().slice(0, 10);
};

export const isListingExpired = (listing: Pick<DriverHireListing, 'available_until' | 'status'>): boolean => {
    if (!listing.available_until) return false;
    const until = new Date(listing.available_until.includes('T') ? listing.available_until : `${listing.available_until}T23:59:59`);
    return until < new Date();
};

export const formatAvailableUntil = (value?: string | null): string => {
    if (!value) return '';
    const date = new Date(value.includes('T') ? value : `${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

export type DriverHireRequest = {
    id: string;
    listing_id: string;
    driver_phone: string;
    driver_name?: string | null;
    client_phone: string;
    client_name?: string | null;
    trip_date?: string | null;
    start_time?: string | null;
    start_location?: string | null;
    end_location?: string | null;
    hours?: number | null;
    route_note?: string | null;
    estimated_total?: number | null;
    confirmation_code?: string | null;
    status?: string | null;
    date_created?: string | null;
};

export const MIN_HIRE_HOURS = 8;
export const HIRE_HOUR_STEP = 8;
export const MAX_HIRE_HOURS = 72;

export const normalizeHireHours = (hours: number) => {
    const rounded = Math.round(hours / HIRE_HOUR_STEP) * HIRE_HOUR_STEP;
    return Math.min(MAX_HIRE_HOURS, Math.max(MIN_HIRE_HOURS, rounded));
};

export const hireHourOptions = () => {
    const options: number[] = [];
    for (let h = MIN_HIRE_HOURS; h <= MAX_HIRE_HOURS; h += HIRE_HOUR_STEP) {
        options.push(h);
    }
    return options;
};

export const estimateHireTotal = (hours: number, ratePerShift: number) =>
    (normalizeHireHours(hours) / HIRE_HOUR_STEP) * Math.max(0, ratePerShift);

export const HIRE_CONFIRMATION_CODE_LENGTH = 4;

export const normalizeHireConfirmationCode = (value: string) =>
    value.replace(/\D/g, '').slice(0, HIRE_CONFIRMATION_CODE_LENGTH);

export const isValidHireConfirmationCode = (value: string) =>
    normalizeHireConfirmationCode(value).length === HIRE_CONFIRMATION_CODE_LENGTH;

export const formatHireConfirmationCode = (value?: string | null) => {
    const code = normalizeHireConfirmationCode(value || '');
    return code.length === HIRE_CONFIRMATION_CODE_LENGTH ? code : '----';
};

export const sanitizeHireRequestForViewer = (
    request: DriverHireRequest,
    viewerPhone: string
): DriverHireRequest => {
    const isDriver =
        normalizePhone(viewerPhone) === normalizePhone(request.driver_phone || '');
    if (isDriver && request.status === 'pending') {
        return { ...request, confirmation_code: null };
    }
    return request;
};

const normalizePhone = (phone: string) => phone.replace(/\D/g, '').slice(-10);

export const formatHireTripDate = (value?: string | null) => {
    if (!value) return 'Date TBD';
    const date = new Date(value.includes('T') ? value : `${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
};

/** Store time as "HH:MM" (24h). */
export const toHireTimeString = (date: Date) => {
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
};

export const formatHireTripTime = (value?: string | null) => {
    if (!value) return '';
    const [hRaw, mRaw] = String(value).split(':');
    const h = Number(hRaw);
    const m = Number(mRaw);
    if (Number.isNaN(h)) return String(value);
    const d = new Date();
    d.setHours(h, Number.isNaN(m) ? 0 : m, 0, 0);
    return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
};

export const DEFAULT_DRIVER_HIRE_TITLE =
    'Professional drivers — local & outstation';

export const DEFAULT_DRIVER_HIRE_INTRO =
    "Hi — I'm available to drive your car for local and outstation trips. Sedans and SUVs, manual or automatic.";

export const DEFAULT_DRIVER_HIRE_SERVICES = [
    'Airport drops (drop at terminal, drive your car home)',
    'Day trips (single-day round trips)',
    'Vacations / picnics (multi-day weekends)',
].join('\n');

export const DEFAULT_DRIVER_HIRE_RATE = 1200;
export const DEFAULT_DRIVER_HIRE_FOOD_ALLOWANCE = 400;

export const DEFAULT_DRIVER_HIRE_FOOD_NOTE =
    'Food: 2 meals from client, or ₹400 food allowance if meals not provided';

export const buildDefaultDriverHireListing = () => ({
    title: DEFAULT_DRIVER_HIRE_TITLE,
    intro: DEFAULT_DRIVER_HIRE_INTRO,
    services: DEFAULT_DRIVER_HIRE_SERVICES,
    rate_per_shift: DEFAULT_DRIVER_HIRE_RATE,
    food_allowance: DEFAULT_DRIVER_HIRE_FOOD_ALLOWANCE,
    food_note: DEFAULT_DRIVER_HIRE_FOOD_NOTE,
    status: 'active' as const,
});

export const formatDriverHireRate = (listing: Pick<DriverHireListing, 'rate_per_shift' | 'food_allowance' | 'food_note'>) => {
    const shift = Number(listing.rate_per_shift) || DEFAULT_DRIVER_HIRE_RATE;
    const food = listing.food_note?.trim() || `Food: 2 meals from client, or ₹${Number(listing.food_allowance) || DEFAULT_DRIVER_HIRE_FOOD_ALLOWANCE} food allowance if meals not provided`;
    return { shift, food };
};
