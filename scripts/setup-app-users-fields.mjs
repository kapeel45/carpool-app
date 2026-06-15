#!/usr/bin/env node
/**
 * Ensures app_users has all fields required by the carpool app.
 * Usage: node scripts/setup-app-users-fields.mjs
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

/** Field definitions for Directus app_users collection */
const APP_USER_FIELDS = [
    {
        field: 'phone',
        type: 'string',
        meta: { interface: 'input', required: true, note: '10-digit mobile (unique)' },
        schema: { is_nullable: false, is_unique: true, max_length: 15 },
    },
    {
        field: 'name',
        type: 'string',
        meta: { interface: 'input', required: true },
        schema: { is_nullable: true, max_length: 255 },
    },
    {
        field: 'mpin',
        type: 'string',
        meta: { interface: 'input', hidden: true, note: '4-digit login PIN' },
        schema: { is_nullable: true, max_length: 10 },
    },
    {
        field: 'email',
        type: 'string',
        meta: { interface: 'input', note: 'Official work email' },
        schema: { is_nullable: true, max_length: 255 },
    },
    {
        field: 'email_verified',
        type: 'boolean',
        meta: { interface: 'boolean', display: 'boolean' },
        schema: { default_value: false, is_nullable: true },
    },
    {
        field: 'gender',
        type: 'string',
        meta: {
            interface: 'select-dropdown',
            options: {
                choices: [
                    { text: 'Male', value: 'male' },
                    { text: 'Female', value: 'female' },
                    { text: 'Other', value: 'other' },
                ],
            },
        },
        schema: { is_nullable: true, max_length: 20 },
    },
    {
        field: 'car_model',
        type: 'string',
        meta: { interface: 'input', note: 'Required to offer rides' },
        schema: { is_nullable: true, max_length: 255 },
    },
    {
        field: 'car_number',
        type: 'string',
        meta: { interface: 'input', note: 'Vehicle registration number' },
        schema: { is_nullable: true, max_length: 50 },
    },
    {
        field: 'car_color',
        type: 'string',
        meta: { interface: 'input' },
        schema: { is_nullable: true, max_length: 50 },
    },
    {
        field: 'profile_photo',
        type: 'uuid',
        meta: {
            interface: 'file-image',
            special: ['file'],
            note: 'Profile picture (gallery or camera)',
        },
        schema: {
            is_nullable: true,
            foreign_key_table: 'directus_files',
            foreign_key_column: 'id',
        },
    },
    {
        field: 'total_rides',
        type: 'integer',
        meta: { interface: 'input', hidden: true },
        schema: { default_value: 0, is_nullable: true },
    },
    {
        field: 'total_earnings',
        type: 'decimal',
        meta: { interface: 'input', hidden: true },
        schema: { default_value: 0, is_nullable: true, numeric_precision: 12, numeric_scale: 2 },
    },
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
        schema: { default_value: 'active', is_nullable: true, max_length: 20 },
    },
];

function fieldAlreadyExists(existingFields, fieldName) {
    return existingFields.some((f) => f.field === fieldName);
}

function isDuplicateFieldError(error) {
    const msg = JSON.stringify(error.data || error.message || '').toLowerCase();
    return msg.includes('already exists') || msg.includes('duplicate') || error.status === 400;
}

async function createField(baseUrl, token, definition) {
    try {
        await request(baseUrl, token, 'POST', '/fields/app_users', definition);
        console.log(`  + created: ${definition.field}`);
        return 'created';
    } catch (error) {
        if (isDuplicateFieldError(error)) {
            console.log(`  · exists:  ${definition.field}`);
            return 'exists';
        }
        throw error;
    }
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

    console.log(`Connected to Directus at ${baseUrl}\n`);

    const collections = await request(baseUrl, token, 'GET', '/collections/app_users');
    if (!collections?.data) {
        throw new Error('Collection app_users not found. Create it in Directus Admin first.');
    }

    const fieldsResponse = await request(baseUrl, token, 'GET', '/fields/app_users');
    const existing = fieldsResponse?.data || [];

    console.log('app_users fields:');
    let created = 0;
    let skipped = 0;

    for (const definition of APP_USER_FIELDS) {
        if (fieldAlreadyExists(existing, definition.field)) {
            console.log(`  ✓ present: ${definition.field}`);
            skipped++;
            continue;
        }
        const result = await createField(baseUrl, token, definition);
        if (result === 'created') created++;
        else skipped++;
    }

    console.log(`\nDone. ${created} field(s) created, ${skipped} already present.`);
    console.log('Open the app → Profile → Edit → save car model & number, then offer a ride.');
}

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
