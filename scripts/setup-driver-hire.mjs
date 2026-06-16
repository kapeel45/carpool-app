#!/usr/bin/env node
/**
 * Searcher drivers driver-for-hire listings collection.
 * Usage: npm run setup-driver-hire
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
            console.log('  ! Public role not found — set driver_hire_listings permissions in Directus admin');
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

    await ensureCollection(baseUrl, token, 'driver_hire_listings', {
        icon: 'directions_car',
        note: 'Professional drivers available to drive client vehicles',
    });

    let fields = [];
    try {
        fields = (await request(baseUrl, token, 'GET', '/fields/driver_hire_listings')).data || [];
    } catch {
        fields = [];
    }

    const fieldDefs = [
        { field: 'driver_phone', type: 'string', meta: { interface: 'input', required: true }, schema: { is_nullable: false, max_length: 15 } },
        { field: 'driver_name', type: 'string', meta: { interface: 'input' }, schema: { is_nullable: true, max_length: 120 } },
        { field: 'title', type: 'string', meta: { interface: 'input', required: true }, schema: { is_nullable: false, max_length: 255 } },
        { field: 'intro', type: 'text', meta: { interface: 'input-multiline' }, schema: { is_nullable: true } },
        { field: 'services', type: 'text', meta: { interface: 'input-multiline' }, schema: { is_nullable: true } },
        { field: 'rate_per_shift', type: 'integer', meta: { interface: 'input' }, schema: { is_nullable: true, default_value: 1200 } },
        { field: 'food_allowance', type: 'integer', meta: { interface: 'input' }, schema: { is_nullable: true, default_value: 400 } },
        { field: 'food_note', type: 'text', meta: { interface: 'input-multiline' }, schema: { is_nullable: true } },
        { field: 'visible_days', type: 'integer', meta: { interface: 'input', note: 'How many days the listing stays active from publish date' }, schema: { is_nullable: true, default_value: 7 } },
        { field: 'available_until', type: 'date', meta: { interface: 'datetime', note: 'Auto-computed expiry date: publish date + visible_days' }, schema: { is_nullable: true } },
        {
            field: 'status',
            type: 'string',
            meta: {
                interface: 'select-dropdown',
                options: {
                    choices: [
                        { text: 'Active', value: 'active' },
                        { text: 'Inactive', value: 'inactive' },
                    ],
                },
            },
            schema: { default_value: 'active', is_nullable: false, max_length: 20 },
        },
    ];

    for (const def of fieldDefs) {
        await ensureField(baseUrl, token, 'driver_hire_listings', def, fields);
    }

    await ensurePublicCrud(baseUrl, token, 'driver_hire_listings');

    await ensureCollection(baseUrl, token, 'driver_hire_requests', {
        icon: 'event_available',
        note: 'Client requests to hire a professional driver',
    });

    let requestFields = [];
    try {
        requestFields = (await request(baseUrl, token, 'GET', '/fields/driver_hire_requests')).data || [];
    } catch {
        requestFields = [];
    }

    const requestFieldDefs = [
        { field: 'listing_id', type: 'string', meta: { interface: 'input', required: true }, schema: { is_nullable: false, max_length: 64 } },
        { field: 'driver_phone', type: 'string', meta: { interface: 'input', required: true }, schema: { is_nullable: false, max_length: 15 } },
        { field: 'driver_name', type: 'string', meta: { interface: 'input' }, schema: { is_nullable: true, max_length: 120 } },
        { field: 'client_phone', type: 'string', meta: { interface: 'input', required: true }, schema: { is_nullable: false, max_length: 15 } },
        { field: 'client_name', type: 'string', meta: { interface: 'input' }, schema: { is_nullable: true, max_length: 120 } },
        { field: 'trip_date', type: 'date', meta: { interface: 'datetime' }, schema: { is_nullable: false } },
        { field: 'start_time', type: 'string', meta: { interface: 'input', note: 'Time to start driving, stored as HH:MM (24h)' }, schema: { is_nullable: true, max_length: 5 } },
        { field: 'start_location', type: 'text', meta: { interface: 'input', note: 'Where the driving starts' }, schema: { is_nullable: true } },
        { field: 'end_location', type: 'text', meta: { interface: 'input', note: 'Where the driving ends' }, schema: { is_nullable: true } },
        { field: 'hours', type: 'integer', meta: { interface: 'input', required: true }, schema: { is_nullable: false, default_value: 8 } },
        { field: 'route_note', type: 'text', meta: { interface: 'input-multiline' }, schema: { is_nullable: true } },
        { field: 'estimated_total', type: 'integer', meta: { interface: 'input' }, schema: { is_nullable: true } },
        { field: 'confirmation_code', type: 'string', meta: { interface: 'input', required: true, note: '4-digit code from client; driver enters on accept' }, schema: { is_nullable: false, max_length: 4 } },
        {
            field: 'status',
            type: 'string',
            meta: {
                interface: 'select-dropdown',
                options: {
                    choices: [
                        { text: 'Pending', value: 'pending' },
                        { text: 'Accepted', value: 'accepted' },
                        { text: 'Rejected', value: 'rejected' },
                        { text: 'Cancelled', value: 'cancelled' },
                    ],
                },
            },
            schema: { default_value: 'pending', is_nullable: false, max_length: 20 },
        },
    ];

    for (const def of requestFieldDefs) {
        await ensureField(baseUrl, token, 'driver_hire_requests', def, requestFields);
    }

    await ensurePublicCrud(baseUrl, token, 'driver_hire_requests');

    console.log('\nDone. Run: npm run setup-driver-hire');
}

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
