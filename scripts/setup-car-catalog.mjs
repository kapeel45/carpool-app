#!/usr/bin/env node
/**
 * Creates car_catalog collection and seeds India-focused brand/model data.
 * Usage: node scripts/setup-car-catalog.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');

const CATALOG = {
    'Maruti Suzuki': [
        'Alto K10', 'Baleno', 'Brezza', 'Celerio', 'Dzire', 'Ertiga', 'Fronx', 'Grand Vitara',
        'Ignis', 'Invicto', 'Jimny', 'S-Presso', 'Swift', 'Wagon R', 'XL6',
    ],
    Hyundai: ['Aura', 'Creta', 'Exter', 'Grand i10 Nios', 'Ioniq 5', 'Tucson', 'Venue', 'Verna', 'i20'],
    Tata: ['Altroz', 'Curvv', 'Harrier', 'Nexon', 'Punch', 'Safari', 'Tiago', 'Tigor'],
    Mahindra: ['Bolero', 'Bolero Neo', 'Scorpio N', 'Scorpio Classic', 'Thar', 'XUV 3XO', 'XUV400', 'XUV700'],
    Kia: ['Carens', 'Carnival', 'Seltos', 'Sonet', 'EV6'],
    Toyota: ['Camry', 'Fortuner', 'Glanza', 'Hilux', 'Hyryder', 'Innova Crysta', 'Innova Hycross', 'Rumion'],
    Honda: ['Amaze', 'City', 'City e:HEV', 'Elevate'],
    Skoda: ['Kodiaq', 'Kushaq', 'Slavia'],
    Volkswagen: ['Taigun', 'Tiguan', 'Virtus'],
    Renault: ['Kiger', 'Kwid', 'Triber'],
    Nissan: ['Magnite'],
    MG: ['Astor', 'Comet EV', 'Gloster', 'Hector', 'Hector Plus', 'ZS EV'],
    BYD: ['Atto 3', 'e6', 'Seal'],
    Jeep: ['Compass', 'Meridian'],
    Citroen: ['Basalt', 'C3', 'C3 Aircross', 'eC3'],
    BMW: ['2 Series Gran Coupe', '3 Series', '5 Series', '7 Series', 'i4', 'iX', 'X1', 'X3', 'X5'],
    'Mercedes-Benz': ['A-Class Limousine', 'C-Class', 'E-Class', 'EQB', 'EQS', 'GLA', 'GLC', 'GLE'],
    Audi: ['A4', 'A6', 'Q3', 'Q5', 'Q7', 'Q8 e-tron'],
};

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

const duplicateError = (error) => {
    const msg = JSON.stringify(error?.data || error?.message || '').toLowerCase();
    return msg.includes('already exists') || msg.includes('duplicate') || error?.status === 400;
};

async function ensureCollection(baseUrl, token) {
    try {
        await request(baseUrl, token, 'GET', '/collections/car_catalog');
    } catch {
        await request(baseUrl, token, 'POST', '/collections', {
            collection: 'car_catalog',
            meta: {
                icon: 'directions_car',
                note: 'Car brands and models available in India',
            },
            schema: {
                name: 'car_catalog',
            },
        });
    }
}

async function ensureFields(baseUrl, token) {
    const fields = [
        {
            field: 'brand',
            type: 'string',
            meta: { interface: 'input', required: true },
            schema: { is_nullable: false, max_length: 120 },
        },
        {
            field: 'model',
            type: 'string',
            meta: { interface: 'input', required: true },
            schema: { is_nullable: false, max_length: 120 },
        },
        {
            field: 'active',
            type: 'boolean',
            meta: { interface: 'boolean' },
            schema: { is_nullable: true, default_value: true },
        },
    ];
    for (const def of fields) {
        try {
            await request(baseUrl, token, 'POST', '/fields/car_catalog', def);
        } catch (error) {
            if (!duplicateError(error)) throw error;
        }
    }
}

async function seedCatalog(baseUrl, token) {
    const existing = await request(baseUrl, token, 'GET', '/items/car_catalog?limit=2000&fields=brand,model');
    const keySet = new Set(
        (existing?.data || []).map((r) => `${String(r.brand || '').toLowerCase()}|${String(r.model || '').toLowerCase()}`)
    );

    let inserted = 0;
    for (const [brand, models] of Object.entries(CATALOG)) {
        for (const model of models) {
            const key = `${brand.toLowerCase()}|${model.toLowerCase()}`;
            if (keySet.has(key)) continue;
            await request(baseUrl, token, 'POST', '/items/car_catalog', {
                brand,
                model,
                active: true,
            });
            inserted++;
        }
    }
    return inserted;
}

async function main() {
    const env = loadEnv();
    const token = env.EXPO_PUBLIC_DIRECTUS_TOKEN;
    const baseUrl = env.EXPO_PUBLIC_DIRECTUS_URL?.replace(/\/$/, '');
    if (!baseUrl || !token) {
        throw new Error('Set EXPO_PUBLIC_DIRECTUS_URL and EXPO_PUBLIC_DIRECTUS_TOKEN in .env');
    }

    await request(baseUrl, token, 'GET', '/server/health');
    await ensureCollection(baseUrl, token);
    await ensureFields(baseUrl, token);
    const inserted = await seedCatalog(baseUrl, token);
    console.log(`car_catalog ready. Inserted ${inserted} new rows.`);
}

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});

