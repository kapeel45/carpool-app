#!/usr/bin/env node
/**
 * Pickup requests + live ride tracking fields.
 * Usage: node scripts/setup-pickup-live.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');

function loadEnv() {
    if (!fs.existsSync(envPath)) {
        throw new Error('Missing .env — copy .env.example and set EXPO_PUBLIC_DIRECTUS_URL + EXPO_PUBLIC_DIRECTUS_TOKEN');
    }
    const env = {};
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
    return env;
}

async function request(baseUrl, token, method, route, body) {
    const response = await fetch(`${baseUrl}${route}`, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let data = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = text;
    }
    if (!response.ok) {
        throw new Error(`${method} ${route} failed (${response.status}): ${JSON.stringify(data)}`);
    }
    return data;
}

async function ensureCollection(baseUrl, token, collection, meta = {}) {
    try {
        await request(baseUrl, token, 'GET', `/collections/${collection}`);
        console.log(`  ✓ collection: ${collection}`);
    } catch {
        await request(baseUrl, token, 'POST', '/collections', {
            collection,
            meta: { icon: meta.icon || 'box', note: meta.note || collection, accountability: 'all' },
            schema: {},
        });
        console.log(`  + collection: ${collection}`);
    }
}

async function ensureField(baseUrl, token, collection, definition, existingFields) {
    if (existingFields.some((f) => f.field === definition.field)) {
        console.log(`  ✓ field ${collection}.${definition.field}`);
        return;
    }
    await request(baseUrl, token, 'POST', `/fields/${collection}`, definition);
    console.log(`  + field ${collection}.${definition.field}`);
}

async function ensurePublicCrud(baseUrl, token, collection) {
    try {
        const roles = (await request(baseUrl, token, 'GET', '/roles?limit=-1')).data || [];
        const publicRole = roles.find((r) => r.name === 'Public' || r.name === 'public');
        if (!publicRole) {
            console.log('  ! Public role not found — set pickup_requests permissions in Directus admin');
            return;
        }
        for (const action of ['create', 'read', 'update']) {
            try {
                await request(baseUrl, token, 'POST', '/permissions', {
                    role: publicRole.id,
                    collection,
                    action,
                    fields: '*',
                });
                console.log(`  + permission Public ${action} on ${collection}`);
            } catch (error) {
                const msg = String(error.message || '').toLowerCase();
                if (msg.includes('duplicate') || msg.includes('already')) {
                    console.log(`  ✓ permission Public ${action} on ${collection}`);
                }
            }
        }
    } catch (error) {
        console.warn('  ! Could not set permissions:', error.message);
    }
}

async function main() {
    const env = loadEnv();
    const token = env.EXPO_PUBLIC_DIRECTUS_TOKEN;
    const baseUrl = env.EXPO_PUBLIC_DIRECTUS_URL?.replace(/\/$/, '');

    if (!baseUrl || !token) {
        throw new Error('Set EXPO_PUBLIC_DIRECTUS_URL and EXPO_PUBLIC_DIRECTUS_TOKEN in .env');
    }

    await request(baseUrl, token, 'GET', '/server/health');
    console.log(`Connected to Directus at ${baseUrl}\n`);

    await ensureCollection(baseUrl, token, 'pickup_requests', {
        icon: 'place',
        note: 'Nearby junction pickup requests from riders',
    });

    let pickupFields = [];
    try {
        pickupFields = (await request(baseUrl, token, 'GET', '/fields/pickup_requests')).data || [];
    } catch {
        pickupFields = [];
    }

    const pickupFieldDefs = [
        { field: 'ride_id', type: 'string', meta: { interface: 'input', required: true }, schema: { is_nullable: false, max_length: 64 } },
        { field: 'owner_phone', type: 'string', meta: { interface: 'input', required: true }, schema: { is_nullable: false, max_length: 15 } },
        { field: 'rider_phone', type: 'string', meta: { interface: 'input', required: true }, schema: { is_nullable: false, max_length: 15 } },
        { field: 'rider_name', type: 'string', meta: { interface: 'input' }, schema: { is_nullable: true, max_length: 120 } },
        { field: 'rider_pickup', type: 'text', meta: { interface: 'input-multiline' }, schema: { is_nullable: true } },
        { field: 'junction_point', type: 'text', meta: { interface: 'input-multiline', required: true }, schema: { is_nullable: false } },
        { field: 'junction_lat', type: 'float', meta: { interface: 'input' }, schema: { is_nullable: true } },
        { field: 'junction_lng', type: 'float', meta: { interface: 'input' }, schema: { is_nullable: true } },
        { field: 'pickup_distance_miles', type: 'float', meta: { interface: 'input' }, schema: { is_nullable: true } },
        { field: 'seats_booked', type: 'integer', meta: { interface: 'input' }, schema: { is_nullable: true, default_value: 1 } },
        { field: 'total_price', type: 'integer', meta: { interface: 'input' }, schema: { is_nullable: true } },
        { field: 'booking_id', type: 'string', meta: { interface: 'input' }, schema: { is_nullable: true, max_length: 64 } },
        {
            field: 'status',
            type: 'string',
            meta: {
                interface: 'select-dropdown',
                options: {
                    choices: [
                        { text: 'Pending', value: 'pending' },
                        { text: 'Accepted', value: 'accepted' },
                        { text: 'Cancelled', value: 'cancelled' },
                        { text: 'Rejected', value: 'rejected' },
                    ],
                },
            },
            schema: { default_value: 'pending', is_nullable: false, max_length: 20 },
        },
    ];

    for (const def of pickupFieldDefs) {
        await ensureField(baseUrl, token, 'pickup_requests', def, pickupFields);
    }

    await ensurePublicCrud(baseUrl, token, 'pickup_requests');

    let bookingFields = [];
    try {
        bookingFields = (await request(baseUrl, token, 'GET', '/fields/bookings')).data || [];
    } catch {
        bookingFields = [];
    }

    const bookingFieldDefs = [
        { field: 'junction_point', type: 'text', meta: { interface: 'input-multiline' }, schema: { is_nullable: true } },
        { field: 'junction_lat', type: 'float', meta: { interface: 'input' }, schema: { is_nullable: true } },
        { field: 'junction_lng', type: 'float', meta: { interface: 'input' }, schema: { is_nullable: true } },
    ];
    for (const def of bookingFieldDefs) {
        await ensureField(baseUrl, token, 'bookings', def, bookingFields);
    }

    let rideFields = [];
    try {
        rideFields = (await request(baseUrl, token, 'GET', '/fields/rides')).data || [];
    } catch {
        rideFields = [];
    }

    const rideFieldDefs = [
        {
            field: 'trip_status',
            type: 'string',
            meta: {
                interface: 'select-dropdown',
                options: {
                    choices: [
                        { text: 'Scheduled', value: 'scheduled' },
                        { text: 'In progress', value: 'in_progress' },
                        { text: 'Completed', value: 'completed' },
                    ],
                },
            },
            schema: { default_value: 'scheduled', is_nullable: true, max_length: 20 },
        },
        { field: 'driver_lat', type: 'float', meta: { interface: 'input' }, schema: { is_nullable: true } },
        { field: 'driver_lng', type: 'float', meta: { interface: 'input' }, schema: { is_nullable: true } },
        { field: 'driver_location_updated_at', type: 'timestamp', meta: { interface: 'datetime' }, schema: { is_nullable: true } },
    ];
    for (const def of rideFieldDefs) {
        await ensureField(baseUrl, token, 'rides', def, rideFields);
    }

    console.log('\nDone. Run: npm run setup-pickup-live');
}

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
