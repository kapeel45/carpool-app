#!/usr/bin/env node
/**
 * Ensures bookings + app_notifications collections exist for cancel alerts.
 * Usage: node scripts/setup-notifications.mjs
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
        const err = new Error(`${method} ${route} failed (${response.status}): ${JSON.stringify(data)}`);
        err.status = response.status;
        err.data = data;
        throw err;
    }
    return data;
}

function isDuplicateError(error) {
    const msg = JSON.stringify(error.data || error.message || '').toLowerCase();
    return msg.includes('already exists') || msg.includes('duplicate') || error.status === 400;
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
    try {
        await request(baseUrl, token, 'POST', `/fields/${collection}`, definition);
        console.log(`  + field ${collection}.${definition.field}`);
    } catch (error) {
        if (isDuplicateError(error)) {
            console.log(`  · field ${collection}.${definition.field}`);
            return;
        }
        throw error;
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

    await ensureCollection(baseUrl, token, 'bookings', { icon: 'event_seat', note: 'Ride bookings' });
    await ensureCollection(baseUrl, token, 'app_notifications', {
        icon: 'notifications',
        note: 'In-app cancellation and ride alerts',
    });

    let bookingFields = [];
    try {
        bookingFields = (await request(baseUrl, token, 'GET', '/fields/bookings')).data || [];
    } catch {
        bookingFields = [];
    }

    await ensureField(baseUrl, token, 'bookings', {
        field: 'status',
        type: 'string',
        meta: {
            interface: 'select-dropdown',
            options: {
                choices: [
                    { text: 'Confirmed', value: 'confirmed' },
                    { text: 'Cancelled', value: 'cancelled' },
                ],
            },
        },
        schema: { default_value: 'confirmed', is_nullable: true, max_length: 20 },
    }, bookingFields);

    let notifFields = [];
    try {
        notifFields = (await request(baseUrl, token, 'GET', '/fields/app_notifications')).data || [];
    } catch {
        notifFields = [];
    }

    const notificationFieldDefs = [
        {
            field: 'recipient_phone',
            type: 'string',
            meta: { interface: 'input', required: true },
            schema: { is_nullable: false, max_length: 15 },
        },
        {
            field: 'title',
            type: 'string',
            meta: { interface: 'input', required: true },
            schema: { is_nullable: false, max_length: 255 },
        },
        {
            field: 'message',
            type: 'text',
            meta: { interface: 'input-multiline' },
            schema: { is_nullable: true },
        },
        {
            field: 'booking_id',
            type: 'string',
            meta: { interface: 'input' },
            schema: { is_nullable: true, max_length: 50 },
        },
        {
            field: 'read',
            type: 'boolean',
            meta: { interface: 'boolean' },
            schema: { default_value: false, is_nullable: true },
        },
    ];

    for (const def of notificationFieldDefs) {
        await ensureField(baseUrl, token, 'app_notifications', def, notifFields);
    }

    await ensureCollectionPermissions(baseUrl, token, 'app_notifications');

    console.log('\nDone. Run the app and cancel a booking to test notifications.');
}

async function ensureCollectionPermissions(baseUrl, token, collection) {
    try {
        const rolesRes = await request(baseUrl, token, 'GET', '/roles?limit=-1');
        const roles = rolesRes.data || [];
        const adminRole = roles.find((r) => r.name === 'Administrator') || roles[0];
        if (!adminRole?.id) {
            console.log('  · skipped permissions (no role found)');
            return;
        }

        const permsRes = await request(
            baseUrl,
            token,
            'GET',
            `/permissions?filter[collection][_eq]=${collection}&filter[role][_eq]=${adminRole.id}&limit=-1`
        );
        const existing = permsRes.data || [];
        const actions = ['create', 'read', 'update', 'delete'];

        for (const action of actions) {
            const has = existing.some((p) => p.action === action);
            if (has) {
                console.log(`  ✓ permission ${collection}.${action}`);
                continue;
            }
            try {
                await request(baseUrl, token, 'POST', '/permissions', {
                    collection,
                    action,
                    role: adminRole.id,
                    fields: ['*'],
                    permissions: {},
                    validation: {},
                });
                console.log(`  + permission ${collection}.${action}`);
            } catch (error) {
                if (isDuplicateError(error)) {
                    console.log(`  · permission ${collection}.${action}`);
                } else {
                    console.warn(`  ! permission ${collection}.${action}:`, error.message);
                }
            }
        }
    } catch (error) {
        console.warn('  ! could not set permissions:', error.message);
    }
}

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
