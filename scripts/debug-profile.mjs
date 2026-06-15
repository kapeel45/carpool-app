#!/usr/bin/env node
/**
 * Prints app_users profile fields from Directus (for debugging sync issues).
 * Usage: node scripts/debug-profile.mjs [phone]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');

function loadEnv() {
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

async function main() {
    const env = loadEnv();
    const base = env.EXPO_PUBLIC_DIRECTUS_URL?.replace(/\/$/, '');
    const token = env.EXPO_PUBLIC_DIRECTUS_TOKEN;
    const phone = (process.argv[2] || '').replace(/\D/g, '').slice(-10);

    const res = await fetch(`${base}/items/app_users?limit=5&sort=-date_created`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!res.ok) {
        console.error('Failed:', res.status, JSON.stringify(json, null, 2));
        process.exit(1);
    }

    let users = json.data || [];
    if (phone) {
        users = users.filter((u) => String(u.phone || '').replace(/\D/g, '').slice(-10) === phone);
    }

    console.log(`Users (${users.length}):\n`);
    for (const u of users) {
        console.log({
            id: u.id,
            phone: u.phone,
            name: u.name,
            email: u.email,
            email_verified: u.email_verified,
            car_model: u.car_model,
            car_number: u.car_number,
            gender: u.gender,
        });
    }
}

main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
});
