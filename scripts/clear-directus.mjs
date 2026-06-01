#!/usr/bin/env node
/**
 * Clears all carpool app data from Directus and re-seeds fuel prices.
 * Usage: node scripts/clear-directus.mjs
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

async function clearCollection(baseUrl, token, collection) {
    let totalDeleted = 0;

    while (true) {
        const result = await request(
            baseUrl,
            token,
            'GET',
            `/items/${collection}?fields=id&limit=100`
        );
        const items = result?.data || [];
        if (items.length === 0) break;

        const keys = items.map((item) => item.id);
        await request(baseUrl, token, 'DELETE', `/items/${collection}`, { keys });
        totalDeleted += keys.length;

        if (items.length < 100) break;
    }

    return totalDeleted;
}

async function seedFuelPrices(baseUrl, token) {
    await request(baseUrl, token, 'POST', '/items/fuel_prices', {
        fuel_type: 'Petrol',
        price: 105,
        city: 'Pune',
        status: 'active',
    });
    await request(baseUrl, token, 'POST', '/items/fuel_prices', {
        fuel_type: 'Diesel',
        price: 92,
        city: 'Pune',
        status: 'active',
    });
    await request(baseUrl, token, 'POST', '/items/fuel_prices', {
        fuel_type: 'CNG',
        price: 75,
        city: 'Pune',
        status: 'active',
    });
}

async function main() {
    const env = loadEnv();
    const token = env.EXPO_PUBLIC_DIRECTUS_TOKEN;
    const configuredUrl = env.EXPO_PUBLIC_DIRECTUS_URL?.replace(/\/$/, '');

    if (!configuredUrl || !token) {
        throw new Error('Set EXPO_PUBLIC_DIRECTUS_URL and EXPO_PUBLIC_DIRECTUS_TOKEN in .env');
    }

    const candidates = [configuredUrl];
    if (configuredUrl.includes('192.168.') || configuredUrl.includes('localhost')) {
        candidates.push('http://localhost:8055', 'http://127.0.0.1:8055');
    }

    let baseUrl = null;
    for (const url of [...new Set(candidates)]) {
        try {
            await request(url, token, 'GET', '/server/health');
            baseUrl = url;
            break;
        } catch {
            // try next
        }
    }

    if (!baseUrl) {
        throw new Error(`Directus not reachable. Tried: ${[...new Set(candidates)].join(', ')}`);
    }

    console.log(`Connected to Directus at ${baseUrl}`);

    const collections = ['bookings', 'rides', 'email_otps', 'app_users', 'fuel_prices'];

    for (const collection of collections) {
        const deleted = await clearCollection(baseUrl, token, collection);
        console.log(`  ${collection}: deleted ${deleted} item(s)`);
    }

    await seedFuelPrices(baseUrl, token);
    console.log('  fuel_prices: seeded Petrol ₹105 and Diesel ₹92 for Pune');

    console.log('\nDone. Directus is reset.');
    console.log('In the app: Profile → Logout, then sign up with a new phone number.');
}

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
