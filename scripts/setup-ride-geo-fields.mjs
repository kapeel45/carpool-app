#!/usr/bin/env node
/**
 * Adds lat/lng fields to rides for nearby search.
 * Usage: node scripts/setup-ride-geo-fields.mjs
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

async function ensureField(baseUrl, token, collection, definition, existingFields) {
    if (existingFields.some((f) => f.field === definition.field)) {
        console.log(`  ✓ field ${collection}.${definition.field}`);
        return;
    }
    await request(baseUrl, token, 'POST', `/fields/${collection}`, definition);
    console.log(`  + field ${collection}.${definition.field}`);
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

    const fieldsRes = await request(baseUrl, token, 'GET', '/fields/rides');
    const existing = fieldsRes.data || [];

    const defs = [
        {
            field: 'from_lat',
            type: 'float',
            meta: { interface: 'input', note: 'Pickup latitude' },
            schema: { is_nullable: true },
        },
        {
            field: 'from_lng',
            type: 'float',
            meta: { interface: 'input', note: 'Pickup longitude' },
            schema: { is_nullable: true },
        },
        {
            field: 'to_lat',
            type: 'float',
            meta: { interface: 'input', note: 'Drop latitude' },
            schema: { is_nullable: true },
        },
        {
            field: 'to_lng',
            type: 'float',
            meta: { interface: 'input', note: 'Drop longitude' },
            schema: { is_nullable: true },
        },
    ];

    for (const def of defs) {
        await ensureField(baseUrl, token, 'rides', def, existing);
    }

    console.log('\nDone. Re-publish rides or run search — coords geocode on the fly until saved.');
}

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
