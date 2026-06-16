#!/usr/bin/env node
/**
 * Adds rider car-number verification fields to bookings collection.
 * Usage: node scripts/setup-booking-verification.mjs
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
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
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

const FIELDS = [
    {
        field: 'car_number_verified_by_rider',
        type: 'boolean',
        meta: { interface: 'boolean', note: 'Rider confirmation of owner car number' },
        schema: { is_nullable: true },
    },
    {
        field: 'car_number_verification_note',
        type: 'string',
        meta: { interface: 'select-dropdown', options: { choices: [
            { text: 'Correct', value: 'correct' },
            { text: 'Different', value: 'different' },
        ] } },
        schema: { is_nullable: true, max_length: 20 },
    },
    {
        field: 'car_number_verified_at',
        type: 'timestamp',
        meta: { interface: 'datetime' },
        schema: { is_nullable: true },
    },
];

function duplicate(err) {
    const msg = JSON.stringify(err?.data || err?.message || '').toLowerCase();
    return msg.includes('already exists') || msg.includes('duplicate') || err?.status === 400;
}

async function main() {
    const env = loadEnv();
    const baseUrl = env.EXPO_PUBLIC_DIRECTUS_URL?.replace(/\/$/, '');
    const token = env.EXPO_PUBLIC_DIRECTUS_TOKEN;
    if (!baseUrl || !token) throw new Error('Set EXPO_PUBLIC_DIRECTUS_URL and EXPO_PUBLIC_DIRECTUS_TOKEN in .env');

    await request(baseUrl, token, 'GET', '/collections/bookings');
    for (const def of FIELDS) {
        try {
            await request(baseUrl, token, 'POST', '/fields/bookings', def);
            console.log(`created ${def.field}`);
        } catch (err) {
            if (!duplicate(err)) throw err;
            console.log(`exists ${def.field}`);
        }
    }
    console.log('Booking verification fields are ready.');
}

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});

