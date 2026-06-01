#!/usr/bin/env node
/**
 * Removes duplicate emails from app_users (keeps oldest account per email).
 * Clears email + email_verified on duplicate accounts; resets verification on keeper.
 * Usage: node scripts/fix-duplicate-emails.mjs
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

function normalizeEmail(email) {
    return (email || '').trim().toLowerCase();
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

async function fetchAllUsers(baseUrl, token) {
    const all = [];
    let offset = 0;

    while (true) {
        const result = await request(
            baseUrl,
            token,
            'GET',
            `/items/app_users?fields=id,email,email_verified,date_created&limit=100&offset=${offset}&sort=date_created`
        );
        const batch = result?.data || [];
        all.push(...batch);
        if (batch.length < 100) break;
        offset += 100;
    }

    return all;
}

async function patchUser(baseUrl, token, userId, data) {
    await request(baseUrl, token, 'PATCH', `/items/app_users/${userId}`, data);
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

    const users = await fetchAllUsers(baseUrl, token);
    console.log(`Loaded ${users.length} user(s)`);

    const byEmail = new Map();

    for (const user of users) {
        const key = normalizeEmail(user.email);
        if (!key) continue;
        if (!byEmail.has(key)) byEmail.set(key, []);
        byEmail.get(key).push(user);
    }

    let duplicateGroups = 0;
    let clearedAccounts = 0;

    for (const [email, group] of byEmail) {
        if (group.length <= 1) {
            const only = group[0];
            const normalized = normalizeEmail(only.email);
            if (normalized !== only.email) {
                await patchUser(baseUrl, token, only.id, {
                    email: normalized,
                });
                console.log(`  Normalized email casing for user ${only.id}`);
            }
            continue;
        }

        duplicateGroups += 1;
        group.sort(
            (a, b) =>
                new Date(a.date_created || 0).getTime() - new Date(b.date_created || 0).getTime()
        );

        const keeper = group[0];
        const duplicates = group.slice(1);

        await patchUser(baseUrl, token, keeper.id, {
            email,
            email_verified: false,
        });
        console.log(`  Keeper user ${keeper.id} keeps ${email} (verification reset)`);

        for (const dup of duplicates) {
            await patchUser(baseUrl, token, dup.id, {
                email: null,
                email_verified: false,
            });
            clearedAccounts += 1;
            console.log(`  Cleared duplicate email from user ${dup.id}`);
        }
    }

    if (duplicateGroups === 0) {
        console.log('\nNo duplicate emails found.');
    } else {
        console.log(
            `\nFixed ${duplicateGroups} duplicate email group(s); cleared ${clearedAccounts} account(s).`
        );
        console.log('Affected users must verify their email again in the app.');
    }
}

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
