import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend/.env first, then root .env as fallback
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
// Default to 3001 to align with Vite's dev proxy (/api -> http://localhost:3001)
const PORT = Number(process.env.PORT || 3001);

// Middleware
const allowedOrigins = (
  process.env.FRONTEND_URL ||
  'http://localhost:5173,http://127.0.0.1:5173'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`Origin not allowed by CORS: ${origin}`));
  }
}));
app.use(express.json({ limit: '2mb' }));

// Ensure database schema is initialized on serverless environments (Vercel)
let dbInitPromise = null;
function ensureDbReady() {
  if (!pool) return Promise.resolve();
  if (!dbInitPromise) {
    dbInitPromise = initDatabase().catch((err) => {
      dbInitPromise = null;
      console.error('Database initialization error:', err.message);
    });
  }
  return dbInitPromise;
}

app.use(async (_req, _res, next) => {
  if (pool && isDbConnected) {
    await ensureDbReady();
  }
  next();
});

// Default demo user ID for out-of-the-box local testing & grading presentations
const DEMO_USER_ID = 'a0000000-0000-0000-0000-000000000001';
const DEMO_USER = {
  id: DEMO_USER_ID,
  username: 'student_demo',
  email: 'student@arcaneforge.edu',
  display_name: 'Student Deckbuilder (Neon Cloud)'
};

// ============================================================================
// 1. POSTGRESQL CONNECTION POOL (NEON SERVERLESS CLOUD)
// ============================================================================
let pool = null;
let isDbConnected = false;

if (process.env.DATABASE_URL) {
  const isLocalDb =
    process.env.DATABASE_URL.includes('localhost') ||
    process.env.DATABASE_URL.includes('127.0.0.1');

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isLocalDb ? false : { rejectUnauthorized: false }
  });

  pool.on('error', (err) => {
    console.error('Unexpected error on idle PostgreSQL client:', err);
  });
} else {
  console.warn('⚠️  DATABASE_URL is not set. Operating in fallback mode (JSON file store).');
  console.warn('👉 Add your Neon connection string to backend/.env to enable PostgreSQL.');
}

// ============================================================================
// 2. AUTOMATIC SCHEMA CREATION (ON STARTUP)
// ============================================================================
async function initDatabase() {
  if (!pool) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Enable pgcrypto for UUID generation if supported
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');
    } catch {
      // pgcrypto may already be enabled or restricted by cloud role; continue safely
    }

    // Table 1: users (Player accounts)
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(64) UNIQUE,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash TEXT,
        display_name VARCHAR(120),
        avatar_url TEXT,
        provider VARCHAR(32) DEFAULT 'local',
        provider_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Compatibility migration for databases created with an older users schema
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(64);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(120);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS provider VARCHAR(32) DEFAULT 'local';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_id TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
      ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    `);

    await client.query(`
      UPDATE users SET
        username = COALESCE(username, 'student_demo'),
        display_name = COALESCE(display_name, 'Student Deckbuilder'),
        provider = COALESCE(provider, 'local'),
        provider_id = COALESCE(provider_id, ''),
        updated_at = COALESCE(updated_at, NOW())
      WHERE username IS NULL
         OR display_name IS NULL
         OR provider IS NULL
         OR provider_id IS NULL
         OR updated_at IS NULL;
    `);

    // Table 2: cards (Scryfall Card Cache — Relational Columns + JSONB)
    await client.query(`
      CREATE TABLE IF NOT EXISTS cards (
        scryfall_id TEXT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        mana_cost VARCHAR(64),
        cmc NUMERIC(5, 1) DEFAULT 0,
        type_line VARCHAR(255),
        color_identity TEXT[] DEFAULT '{}',
        image_uris JSONB DEFAULT '{}'::jsonb,
        prices JSONB DEFAULT '{}'::jsonb,
        legalities JSONB DEFAULT '{}'::jsonb,
        data JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Compatibility check: ensure all columns exist if table was previously created
    await client.query(`
      ALTER TABLE cards ADD COLUMN IF NOT EXISTS scryfall_id TEXT;
      ALTER TABLE cards ADD COLUMN IF NOT EXISTS mana_cost VARCHAR(64);
      ALTER TABLE cards ADD COLUMN IF NOT EXISTS cmc NUMERIC(5, 1) DEFAULT 0;
      ALTER TABLE cards ADD COLUMN IF NOT EXISTS type_line VARCHAR(255);
      ALTER TABLE cards ADD COLUMN IF NOT EXISTS color_identity TEXT[] DEFAULT '{}';
      ALTER TABLE cards ADD COLUMN IF NOT EXISTS image_uris JSONB DEFAULT '{}'::jsonb;
      ALTER TABLE cards ADD COLUMN IF NOT EXISTS prices JSONB DEFAULT '{}'::jsonb;
      ALTER TABLE cards ADD COLUMN IF NOT EXISTS legalities JSONB DEFAULT '{}'::jsonb;
      ALTER TABLE cards ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}'::jsonb;
    `);

    // Table 3: decks (Deck Metadata)
    await client.query(`
      CREATE TABLE IF NOT EXISTS decks (
        id TEXT PRIMARY KEY,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        format VARCHAR(32) NOT NULL DEFAULT 'commander',
        description TEXT DEFAULT '',
        commander_card_id TEXT REFERENCES cards(scryfall_id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Table 4: deck_cards (Many-to-Many Join Table)
    await client.query(`
      CREATE TABLE IF NOT EXISTS deck_cards (
        id SERIAL PRIMARY KEY,
        deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
        card_id TEXT NOT NULL REFERENCES cards(scryfall_id) ON DELETE RESTRICT,
        zone VARCHAR(32) NOT NULL CHECK (zone IN ('commander', 'mainboard', 'sideboard')),
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        UNIQUE (deck_id, card_id, zone)
      );
    `);

    // Relational Performance Indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS deck_cards_deck_id_idx ON deck_cards(deck_id);
      CREATE INDEX IF NOT EXISTS deck_cards_card_id_idx ON deck_cards(card_id);
      CREATE INDEX IF NOT EXISTS decks_user_id_idx ON decks(user_id);
      CREATE INDEX IF NOT EXISTS decks_updated_at_idx ON decks(updated_at DESC);
      CREATE INDEX IF NOT EXISTS cards_name_idx ON cards(name);
    `);

    // Seed default student demo account
    await client.query(`
      INSERT INTO users (id, username, email, display_name)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) DO NOTHING;
    `, [DEMO_USER.id, DEMO_USER.username, DEMO_USER.email, DEMO_USER.display_name]);

    await client.query('COMMIT');
    isDbConnected = true;
    console.log('✅ PostgreSQL Schema initialized on Neon: users, cards, decks, deck_cards ready!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Database schema initialization error:', error.message);
  } finally {
    client.release();
  }
}

// ============================================================================
// 3. FILE-BASED FALLBACK STORAGE (Used only if DATABASE_URL is not set)
// ============================================================================
const DATA_DIR = path.join(__dirname, 'data');
const DECKS_FILE = path.join(DATA_DIR, 'decks.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
ensureFallbackStarterDecks();

function readDecksFromDisk() {
  try {
    if (!fs.existsSync(DECKS_FILE)) {
      fs.writeFileSync(DECKS_FILE, JSON.stringify([], null, 2));
      return [];
    }
    const raw = fs.readFileSync(DECKS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading decks.json:', err);
    return [];
  }
}

function writeDecksToDisk(decks) {
  fs.writeFileSync(DECKS_FILE, JSON.stringify(decks, null, 2));
}

function ensureFallbackStarterDecks() {
  const existing = readDecksFromDisk();
  if (existing.length > 0) return existing;

  const card = (id, name, typeLine, cmc, colorIdentity, oracleText = '') => ({
    id,
    name,
    type_line: typeLine,
    cmc,
    color_identity: colorIdentity,
    oracle_text: oracleText,
    mana_cost: '',
    image_uris: {},
    prices: { usd: '0', eur: '0' },
    legalities: { commander: 'legal', modern: 'legal', standard: 'legal' }
  });

  const niv = card('starter-niv', 'Niv-Mizzet, Parun', 'Legendary Creature — Dragon Wizard', 6, ['U', 'R']);
  const bolt = card('starter-bolt', 'Lightning Bolt', 'Instant', 1, ['R']);
  const island = card('starter-island', 'Island', 'Basic Land — Island', 0, []);
  const mountain = card('starter-mountain', 'Mountain', 'Basic Land — Mountain', 0, []);

  const starters = [
    {
      id: 'deck-izzet-commander',
      name: 'Izzet Spellslinger',
      format: 'commander',
      description: 'Starter Commander deck.',
      entries: [
        { card: niv, quantity: 1, zone: 'commander' },
        { card: bolt, quantity: 36, zone: 'mainboard' },
        { card: island, quantity: 31, zone: 'mainboard' },
        { card: mountain, quantity: 32, zone: 'mainboard' }
      ]
    },
    {
      id: 'deck-modern-burn',
      name: 'Modern Burn',
      format: 'modern',
      description: 'Starter Modern deck.',
      entries: [
        { card: bolt, quantity: 4, zone: 'mainboard' },
        { card: mountain, quantity: 56, zone: 'mainboard' }
      ]
    }
  ];

  writeDecksToDisk(starters);
  return starters;
}

// ============================================================================
// 4. POSTGRESQL RELATIONAL DECK QUERIES
// ============================================================================
function normalizeDeck(deck) {
  return {
    id: String(deck.id),
    name: deck.name,
    format: deck.format || 'commander',
    description: deck.description || '',
    entries: Array.isArray(deck.entries)
      ? deck.entries.map((entry) => ({
          card: entry.card,
          quantity: Number(entry.quantity) || 1,
          zone: entry.zone || 'mainboard'
        }))
      : []
  };
}

async function readDecksFromPostgres(userId = null) {
  const { rows } = await pool.query(
    `SELECT
       d.id,
       d.name,
       d.format,
       d.description,
       d.commander_card_id,
       d.created_at,
       d.updated_at,
       COALESCE(
         jsonb_agg(
           jsonb_build_object(
             'card', CASE
                       WHEN c.data IS NOT NULL AND c.data != '{}'::jsonb THEN c.data
                       ELSE jsonb_build_object(
                         'id', c.scryfall_id,
                         'name', c.name,
                         'mana_cost', c.mana_cost,
                         'cmc', c.cmc,
                         'type_line', c.type_line,
                         'color_identity', c.color_identity,
                         'image_uris', c.image_uris,
                         'prices', c.prices,
                         'legalities', c.legalities
                       )
                     END,
             'quantity', dc.quantity,
             'zone', dc.zone
           )
           ORDER BY dc.zone, c.name
         ) FILTER (WHERE dc.card_id IS NOT NULL),
         '[]'::jsonb
       ) AS entries
     FROM decks d
     LEFT JOIN deck_cards dc ON dc.deck_id = d.id
     LEFT JOIN cards c ON c.scryfall_id = dc.card_id
     WHERE ($1::uuid IS NULL OR d.user_id = $1::uuid OR d.user_id IS NULL)
     GROUP BY d.id
     ORDER BY d.updated_at DESC`,
    [userId]
  );

  return rows.map(normalizeDeck);
}

async function saveDeckToPostgres(deck, userId = DEMO_USER_ID) {
  const normalized = normalizeDeck(deck);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Upsert all cards in this deck into the `cards` table cache
    for (const entry of normalized.entries) {
      if (!entry.card || !entry.card.name) continue;

      const scryfallId = String(entry.card.id || entry.card.scryfall_id || entry.card.name);
      const name = entry.card.name;
      const manaCost = entry.card.mana_cost || null;
      const cmc = typeof entry.card.cmc === 'number' ? entry.card.cmc : (parseFloat(entry.card.cmc) || 0);
      const typeLine = entry.card.type_line || null;
      const colorIdentity = Array.isArray(entry.card.color_identity) ? entry.card.color_identity : [];
      const imageUris = entry.card.image_uris || (entry.card.card_faces?.[0]?.image_uris) || {};
      const prices = entry.card.prices || {};
      const legalities = entry.card.legalities || {};
      const fullData = { ...entry.card, id: scryfallId };

      await client.query(
        `INSERT INTO cards (
           scryfall_id, name, mana_cost, cmc, type_line, color_identity, image_uris, prices, legalities, data, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, NOW())
         ON CONFLICT (scryfall_id) DO UPDATE SET
           name = EXCLUDED.name,
           mana_cost = EXCLUDED.mana_cost,
           cmc = EXCLUDED.cmc,
           type_line = EXCLUDED.type_line,
           color_identity = EXCLUDED.color_identity,
           image_uris = EXCLUDED.image_uris,
           prices = EXCLUDED.prices,
           legalities = EXCLUDED.legalities,
           data = EXCLUDED.data,
           updated_at = NOW()`,
        [
          scryfallId,
          name,
          manaCost,
          cmc,
          typeLine,
          colorIdentity,
          JSON.stringify(imageUris),
          JSON.stringify(prices),
          JSON.stringify(legalities),
          JSON.stringify(fullData)
        ]
      );
    }

    // 2. Identify designated commander card if any
    const commanderEntry = normalized.entries.find((e) => e.zone === 'commander');
    const commanderCardId = commanderEntry
      ? String(commanderEntry.card.id || commanderEntry.card.scryfall_id || commanderEntry.card.name)
      : null;

    // 3. Upsert deck metadata in `decks`
    await client.query(
      `INSERT INTO decks (id, user_id, name, format, description, commander_card_id, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (id) DO UPDATE SET
         user_id = COALESCE(EXCLUDED.user_id, decks.user_id),
         name = EXCLUDED.name,
         format = EXCLUDED.format,
         description = EXCLUDED.description,
         commander_card_id = EXCLUDED.commander_card_id,
         updated_at = NOW()`,
      [
        normalized.id,
        userId,
        normalized.name,
        normalized.format,
        normalized.description,
        commanderCardId
      ]
    );

    // 4. Overwrite deck_cards entries for this deck
    await client.query('DELETE FROM deck_cards WHERE deck_id = $1', [normalized.id]);

    for (const entry of normalized.entries) {
      if (!entry.card || !entry.card.name || entry.quantity < 1) continue;
      const cardId = String(entry.card.id || entry.card.scryfall_id || entry.card.name);

      await client.query(
        `INSERT INTO deck_cards (deck_id, card_id, zone, quantity)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (deck_id, card_id, zone) DO UPDATE SET
           quantity = EXCLUDED.quantity`,
        [normalized.id, cardId, entry.zone || 'mainboard', entry.quantity || 1]
      );
    }

    await client.query('COMMIT');
    return normalized;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to save deck to PostgreSQL:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function deleteDeckFromPostgres(deckId) {
  // ON DELETE CASCADE automatically removes join rows in deck_cards
  const result = await pool.query('DELETE FROM decks WHERE id = $1', [deckId]);
  return result.rowCount > 0;
}

// ============================================================================
// 5. IN-MEMORY SCRYFALL SEARCH CACHE (Speeds up queries & prevents 429s)
// ============================================================================
const searchCache = new Map();
const CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutes

const BASIC_LANDS = new Set([
  'Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes',
  'Snow-Covered Plains', 'Snow-Covered Island', 'Snow-Covered Swamp',
  'Snow-Covered Mountain', 'Snow-Covered Forest'
]);

function getPrimaryCategory(typeLine = '') {
  const type = typeLine.toLowerCase();
  if (type.includes('creature')) return 'Creatures';
  if (type.includes('planeswalker')) return 'Planeswalkers';
  if (type.includes('instant') || type.includes('sorcery')) return 'Instants & Sorceries';
  if (type.includes('land')) return 'Lands';
  return 'Artifacts & Enchantments';
}

function buildValidation(deck) {
  const checks = [];
  const entries = deck.entries || [];
  const format = deck.format || 'commander';
  const commanderEntries = entries.filter((entry) => entry.zone === 'commander');
  const mainboardEntries = entries.filter((entry) => entry.zone === 'mainboard');
  const sideboardEntries = entries.filter((entry) => entry.zone === 'sideboard');
  const commanderCount = commanderEntries.reduce((sum, entry) => sum + entry.quantity, 0);
  const mainCount = mainboardEntries.reduce((sum, entry) => sum + entry.quantity, 0);
  const sideCount = sideboardEntries.reduce((sum, entry) => sum + entry.quantity, 0);
  const totalMainAndCommander = commanderCount + mainCount;

  if (format === 'commander') {
    checks.push({
      id: 'commander-slot',
      title: 'Commander Designated (1 Legendary)',
      status: commanderCount === 1 ? 'pass' : 'fail',
      detail: commanderCount === 1
        ? `Commander: ${commanderEntries[0].card.name}`
        : `Found ${commanderCount} cards in Commander zone (requires 1).`
    });
    checks.push({
      id: 'deck-size',
      title: '100-Card Deck Size Requirement',
      status: totalMainAndCommander === 100 ? 'pass' : 'warn',
      detail: `${totalMainAndCommander} / 100 cards.`
    });
  } else {
    checks.push({
      id: 'deck-size',
      title: 'Minimum 60 Mainboard Cards',
      status: mainCount >= 60 ? 'pass' : 'fail',
      detail: `${mainCount} / 60 Mainboard cards.`
    });
    checks.push({
      id: 'sideboard-size',
      title: 'Maximum 15 Sideboard Cards',
      status: sideCount <= 15 ? 'pass' : 'fail',
      detail: `${sideCount} / 15 Sideboard cards.`
    });
  }

  const copyLimit = format === 'commander' ? 1 : 4;
  const countsByName = {};
  entries.forEach((entry) => {
    countsByName[entry.card.name] = (countsByName[entry.card.name] || 0) + entry.quantity;
  });
  const copyViolations = Object.entries(countsByName).filter(
    ([name, quantity]) => !BASIC_LANDS.has(name) && quantity > copyLimit
  );
  checks.push({
    id: 'copy-limit',
    title: format === 'commander' ? 'Singleton Rule (Max 1 Copy)' : '4-Copy Playset Rule (Max 4 Copies)',
    status: copyViolations.length === 0 ? 'pass' : 'fail',
    detail: copyViolations.length === 0
      ? `All non-basic cards obey the ${copyLimit}-copy limit.`
      : `Violations: ${copyViolations.map(([name, quantity]) => `${name} (${quantity}x)`).join(', ')}`
  });

  if (format === 'commander') {
    const identity = new Set(commanderEntries[0]?.card?.color_identity || []);
    const violations = entries.flatMap((entry) =>
      (entry.card.color_identity || [])
        .filter((color) => !identity.has(color))
        .length > 0
        ? [`${entry.card.name} [${(entry.card.color_identity || []).join('')}]`]
        : []
    );
    checks.push({
      id: 'color-identity',
      title: `Commander Color Identity (${Array.from(identity).join('') || 'C'})`,
      status: commanderCount === 0 ? 'warn' : violations.length === 0 ? 'pass' : 'fail',
      detail: commanderCount === 0
        ? 'Select a Commander to validate color identity.'
        : violations.length === 0
          ? "All cards match your Commander's color identity."
          : `Off-color cards: ${violations.join(', ')}`
    });
  }

  const illegalCards = entries.flatMap((entry) => {
    const legality = entry.card.legalities?.[format];
    return legality && legality !== 'legal' && legality !== 'restricted'
      ? [`${entry.card.name} (${legality.replace('_', ' ')})`]
      : [];
  });
  checks.push({
    id: 'format-banlist',
    title: `Official ${format.toUpperCase()} Format Legality`,
    status: illegalCards.length === 0 ? 'pass' : 'fail',
    detail: illegalCards.length === 0
      ? `Every card is legal in ${format.toUpperCase()}.`
      : `Illegal/Banned: ${illegalCards.slice(0, 4).join(', ')}${illegalCards.length > 4 ? ` +${illegalCards.length - 4} more` : ''}`
  });

  const hasFail = checks.some((check) => check.status === 'fail');
  const hasWarn = checks.some((check) => check.status === 'warn');
  return {
    overall: hasFail ? 'illegal' : hasWarn ? 'incomplete' : 'legal',
    checks,
    counts: { commanderCount, mainCount, sideCount, totalMainAndCommander }
  };
}

function buildAnalytics(deck) {
  const curveBins = [
    { cmc: '0', count: 0 }, { cmc: '1', count: 0 }, { cmc: '2', count: 0 },
    { cmc: '3', count: 0 }, { cmc: '4', count: 0 }, { cmc: '5', count: 0 },
    { cmc: '6+', count: 0 }
  ];
  const colorCounts = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  const typeCounts = {
    Creatures: 0,
    'Instants & Sorceries': 0,
    'Artifacts & Enchantments': 0,
    Planeswalkers: 0,
    Lands: 0
  };
  let totalEur = 0;
  let totalUsd = 0;
  let totalNonLandCmc = 0;
  let totalNonLandCards = 0;

  for (const entry of deck.entries || []) {
    const { card, quantity, zone } = entry;
    totalEur += (parseFloat(card.prices?.eur || '0') || 0) * quantity;
    totalUsd += (parseFloat(card.prices?.usd || '0') || 0) * quantity;
    if (zone === 'sideboard') continue;

    const category = getPrimaryCategory(card.type_line);
    if (typeCounts[category] !== undefined) typeCounts[category] += quantity;
    const isLand = (card.type_line || '').toLowerCase().includes('land');
    if (!isLand) {
      const cmc = Math.floor(Number(card.cmc) || 0);
      totalNonLandCmc += cmc * quantity;
      totalNonLandCards += quantity;
      curveBins[cmc >= 6 ? 6 : cmc].count += quantity;
    }

    const identity = card.color_identity || [];
    if (identity.length === 0 && !isLand) colorCounts.C += quantity;
    else identity.forEach((color) => {
      if (colorCounts[color] !== undefined) colorCounts[color] += quantity;
    });
  }

  const manaColors = [
    { name: 'White', code: 'W', accent: '#f8fafc' },
    { name: 'Blue', code: 'U', accent: '#38bdf8' },
    { name: 'Black', code: 'B', accent: '#64748b' },
    { name: 'Red', code: 'R', accent: '#fb7185' },
    { name: 'Green', code: 'G', accent: '#4ade80' },
    { name: 'Colorless', code: 'C', accent: '#94a3b8' }
  ];
  const colorPieData = manaColors
    .map((color) => ({ ...color, value: colorCounts[color.code] || 0 }))
    .filter((color) => color.value > 0);

  return {
    curveBins,
    colorPieData,
    typeCounts,
    totalEur: totalEur.toFixed(2),
    totalUsd: totalUsd.toFixed(2),
    avgCmc: totalNonLandCards > 0 ? (totalNonLandCmc / totalNonLandCards).toFixed(2) : '0.00'
  };
}

function buildArenaExport(deck) {
  const lines = [];
  const commanders = deck.entries.filter((entry) => entry.zone === 'commander');
  const mainboard = deck.entries.filter((entry) => entry.zone === 'mainboard');
  const sideboard = deck.entries.filter((entry) => entry.zone === 'sideboard');
  if (commanders.length > 0) {
    lines.push('Commander');
    commanders.forEach((entry) => lines.push(`${entry.quantity} ${entry.card.name}`));
    lines.push('');
  }
  lines.push('Deck');
  mainboard.forEach((entry) => lines.push(`${entry.quantity} ${entry.card.name}`));
  if (sideboard.length > 0) {
    lines.push('', 'Sideboard');
    sideboard.forEach((entry) => lines.push(`${entry.quantity} ${entry.card.name}`));
  }
  return lines.join('\n');
}

// ============================================================================
// 6. CORE API ENDPOINTS
// ============================================================================

// Welcome route
app.get('/', (_req, res) => {
  res.json({
    message: 'Welcome to the ArcaneForge MTG Deckbuilder Backend API',
    database: pool ? 'PostgreSQL (Neon Cloud)' : 'Local File Store',
    endpoints: {
      health: 'GET /api/health',
      user: 'GET /api/me',
      searchCards: 'GET /api/cards/search?q=sol+ring',
      decks: 'GET /api/decks',
      saveDeck: 'PUT /api/decks/:id or POST /api/decks',
      deleteDeck: 'DELETE /api/decks/:id',
      validateDeck: 'POST /api/decks/validate',
      parseArenaText: 'POST /api/decks/parse'
    }
  });
});

// Health check & database metrics endpoint
app.get('/api/health', async (_req, res) => {
  if (pool && isDbConnected) {
    try {
      const client = await pool.connect();
      try {
        const [deckCountRes, cardCountRes] = await Promise.all([
          client.query('SELECT COUNT(*)::int AS count FROM decks'),
          client.query('SELECT COUNT(*)::int AS count FROM cards')
        ]);

        return res.json({
          ok: true,
          status: 'online',
          dbConnected: isDbConnected,
          service: 'ArcaneForge MTG Deckbuilder API',
          storageMode: 'PostgreSQL (Neon Serverless Cloud)',
          tables: ['users', 'cards', 'decks', 'deck_cards'],
          savedDecksCount: deckCountRes.rows[0].count,
          cachedCardsCount: cardCountRes.rows[0].count,
          cachedSearchQueries: searchCache.size,
          uptimeSeconds: Math.floor(process.uptime()),
          timestamp: new Date().toISOString()
        });
      } finally {
        client.release();
      }
    } catch (err) {
      console.error('Database query failed in /api/health:', err.message);
      return res.status(503).json({
        ok: false,
        status: 'degraded',
        error: 'Database connection failed',
        details: err.message
      });
    }
  }

  // Fallback to disk if DATABASE_URL is not set
  const decks = readDecksFromDisk();
  res.json({
    ok: true,
    status: 'online',
    service: 'ArcaneForge MTG Deckbuilder API',
    storageMode: 'JSON File Store (Pre-Neon)',
    savedDecksCount: decks.length,
    cachedSearchQueries: searchCache.size,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// Current user profile endpoint (Provides demo student profile so frontend sync works out-of-the-box)
app.get('/api/me', (_req, res) => {
  res.json({ user: DEMO_USER });
});

app.post('/api/auth/logout', (_req, res) => {
  res.status(204).end();
});

// Scryfall Proxy + Read-Through In-Memory Cache
app.get('/api/cards/search', async (req, res) => {
  const { q = 'f:commander', colors = '', type = '' } = req.query;

  let scryfallQuery = q.trim() || 'f:commander';
  if (colors) {
    scryfallQuery += ` id<=${colors.replace(/,/g, '')}`;
  }
  if (type && type !== 'all') {
    scryfallQuery += ` t:${type}`;
  }

  const cacheKey = scryfallQuery.toLowerCase();
  const cached = searchCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return res.json({
      source: 'server-cache',
      query: scryfallQuery,
      total_cards: cached.data.length,
      data: cached.data
    });
  }

  try {
    const url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(scryfallQuery)}&order=edhrec`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ArcaneForge-SchoolProject/1.0',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'No cards matched your query on Scryfall.',
        data: []
      });
    }

    const payload = await response.json();
    const cards = (payload.data || []).slice(0, 40);

    searchCache.set(cacheKey, {
      timestamp: Date.now(),
      data: cards
    });

    res.json({
      source: 'scryfall-live',
      query: scryfallQuery,
      total_cards: cards.length,
      data: cards
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reach Scryfall API', details: error.message });
  }
});

// ============================================================================
// 7. DECK CRUD ENDPOINTS (PostgreSQL with disk fallback)
// ============================================================================

// GET all decks
app.get('/api/decks', async (_req, res) => {
  try {
    if (pool && isDbConnected) {
      const decks = await readDecksFromPostgres();
      return res.json(decks);
    }
    const decks = readDecksFromDisk();
    res.json(decks);
  } catch (error) {
    console.error('Failed to get decks:', error);
    res.status(500).json({ error: 'Failed to load decks from database' });
  }
});

// GET single deck by ID
app.get('/api/decks/:id', async (req, res) => {
  try {
    if (pool && isDbConnected) {
      const decks = await readDecksFromPostgres();
      const deck = decks.find((d) => d.id === req.params.id);
      if (!deck) return res.status(404).json({ error: 'Deck not found' });
      return res.json(deck);
    }
    const decks = readDecksFromDisk();
    const deck = decks.find((d) => d.id === req.params.id);
    if (!deck) return res.status(404).json({ error: 'Deck not found' });
    res.json(deck);
  } catch (error) {
    console.error('Failed to load deck:', error);
    res.status(500).json({ error: 'Failed to load deck' });
  }
});

// PUT /api/decks/:id — Update or create deck (matches React client fetch call)
app.put('/api/decks/:id', async (req, res) => {
  const deck = { ...req.body, id: req.params.id };

  if (!deck.name) {
    return res.status(400).json({ error: 'Deck name is required.' });
  }

  try {
    if (pool && isDbConnected) {
      await saveDeckToPostgres(deck, DEMO_USER_ID);
      return res.status(204).end();
    }

    const decks = readDecksFromDisk();
    const index = decks.findIndex((d) => d.id === deck.id);
    if (index >= 0) {
      decks[index] = deck;
    } else {
      decks.push(deck);
    }
    writeDecksToDisk(decks);
    res.status(204).end();
  } catch (error) {
    console.error('Failed to save deck:', error);
    res.status(500).json({ error: 'Failed to save deck to database' });
  }
});

// POST /api/decks — Create or save deck
app.post('/api/decks', async (req, res) => {
  const { id, name, format, entries = [], commander = null, cards = [] } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Deck name is required.' });
  }

  // Handle both { entries: [...] } and legacy { cards: [...] } payloads
  let normalizedEntries = entries;
  if (normalizedEntries.length === 0 && Array.isArray(cards) && cards.length > 0) {
    normalizedEntries = cards.map((c) => ({
      card: c,
      quantity: c.quantity || 1,
      zone: c.zone || 'mainboard'
    }));
    if (commander) {
      normalizedEntries.push({ card: commander, quantity: 1, zone: 'commander' });
    }
  }

  const deckToSave = {
    id: id || `deck-${Date.now()}`,
    name,
    format: format || 'commander',
    description: req.body.description || '',
    entries: normalizedEntries
  };

  try {
    if (pool && isDbConnected) {
      const saved = await saveDeckToPostgres(deckToSave, DEMO_USER_ID);
      return res.status(201).json(saved);
    }

    const decks = readDecksFromDisk();
    const existingIndex = decks.findIndex((d) => d.id === deckToSave.id);
    if (existingIndex >= 0) {
      decks[existingIndex] = deckToSave;
    } else {
      decks.push(deckToSave);
    }
    writeDecksToDisk(decks);
    res.status(201).json(deckToSave);
  } catch (error) {
    console.error('Failed to create deck:', error);
    res.status(500).json({ error: 'Failed to save deck' });
  }
});

// DELETE a deck
app.delete('/api/decks/:id', async (req, res) => {
  try {
    if (pool && isDbConnected) {
      const deleted = await deleteDeckFromPostgres(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: 'Deck not found' });
      }
      return res.json({ deleted: true, id: req.params.id });
    }

    const decks = readDecksFromDisk();
    const filtered = decks.filter((d) => d.id !== req.params.id);
    writeDecksToDisk(filtered);
    res.json({ deleted: true, id: req.params.id });
  } catch (error) {
    console.error('Failed to delete deck:', error);
    res.status(500).json({ error: 'Failed to delete deck' });
  }
});

// Server-owned deck view: validation, analytics, grouping, and export.
app.get('/api/decks/:id/view', async (req, res) => {
  try {
    const decks = pool && isDbConnected
      ? await readDecksFromPostgres(DEMO_USER_ID)
      : readDecksFromDisk();
    const deck = decks.find((item) => item.id === req.params.id);
    if (!deck) return res.status(404).json({ error: 'Deck not found' });

    return res.json({
      deck,
      validation: buildValidation(deck),
      analytics: buildAnalytics(deck),
      arenaExport: buildArenaExport(deck)
    });
  } catch (error) {
    console.error('Failed to build deck view:', error);
    res.status(500).json({ error: 'Failed to build deck view' });
  }
});

async function resolveScryfallCard(name) {
  const response = await fetch(
    `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`,
    { headers: { 'User-Agent': 'ArcaneForge-SchoolProject/1.0', Accept: 'application/json' } }
  );
  if (!response.ok) return null;
  return response.json();
}

// Server-owned deck mutations.
app.patch('/api/decks/:id', async (req, res) => {
  try {
    const allDecks = pool && isDbConnected
      ? await readDecksFromPostgres(DEMO_USER_ID)
      : readDecksFromDisk();
    const deck = allDecks.find((item) => item.id === req.params.id);
    if (!deck) return res.status(404).json({ error: 'Deck not found' });

    const { action, card, cardName, zone, fromZone, toZone, delta, format, text, name } = req.body;

    if (action === 'set-name') {
      if (!String(name || '').trim()) return res.status(400).json({ error: 'Deck name is required' });
      deck.name = String(name).trim();
    } else if (action === 'set-format') {
      deck.format = format;
      deck.entries = deck.entries.map((entry) =>
        format !== 'commander' && entry.zone === 'commander'
          ? { ...entry, zone: 'mainboard' }
          : entry
      );
    } else if (action === 'add-card') {
      if (zone === 'commander') {
        deck.entries = [
          ...deck.entries.filter((entry) => entry.zone !== 'commander'),
          { card, quantity: 1, zone: 'commander' }
        ];
      } else {
        const existing = deck.entries.find((entry) =>
          entry.card.name === card.name && entry.zone === zone
        );
        if (existing) existing.quantity += 1;
        else deck.entries.push({ card, quantity: 1, zone: zone || 'mainboard' });
      }
    } else if (action === 'change-quantity') {
      deck.entries = deck.entries
        .map((entry) => entry.card.name === cardName && entry.zone === zone
          ? { ...entry, quantity: entry.quantity + delta }
          : entry
        )
        .filter((entry) => entry.quantity > 0);
    } else if (action === 'move-card') {
      const sourceIndex = deck.entries.findIndex((entry) =>
        entry.card.name === cardName && entry.zone === fromZone
      );
      if (sourceIndex !== -1) {
        const source = deck.entries[sourceIndex];
        deck.entries.splice(sourceIndex, 1);
        if (toZone === 'commander') {
          deck.entries = deck.entries.map((entry) =>
            entry.zone === 'commander' ? { ...entry, zone: 'mainboard' } : entry
          );
          deck.entries.unshift({ card: source.card, quantity: 1, zone: 'commander' });
        } else {
          const target = deck.entries.find((entry) =>
            entry.card.name === cardName && entry.zone === toZone
          );
          if (target) target.quantity += source.quantity;
          else deck.entries.push({ ...source, zone: toZone });
        }
      }
    } else if (action === 'import-arena') {
      const parseResponse = await resolveArenaText(text);
      deck.entries = parseResponse.entries;
    } else {
      return res.status(400).json({ error: 'Unknown deck action' });
    }

    if (pool && isDbConnected) await saveDeckToPostgres(deck, DEMO_USER_ID);
    else {
      const index = allDecks.findIndex((item) => item.id === deck.id);
      allDecks[index] = deck;
      writeDecksToDisk(allDecks);
    }

    return res.json({
      deck,
      validation: buildValidation(deck),
      analytics: buildAnalytics(deck),
      arenaExport: buildArenaExport(deck)
    });
  } catch (error) {
    console.error('Failed to mutate deck:', error);
    res.status(500).json({ error: 'Failed to mutate deck' });
  }
});

async function resolveArenaText(text) {
  const entries = [];
  let zone = 'mainboard';
  for (const rawLine of String(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean)) {
    const lower = rawLine.toLowerCase();
    if (/^commander:?$/.test(lower) || /^command zone:?$/.test(lower)) {
      zone = 'commander';
      continue;
    }
    if (/^sideboard:?$/.test(lower)) {
      zone = 'sideboard';
      continue;
    }
    if (/^deck:?$/.test(lower) || /^mainboard:?$/.test(lower)) {
      zone = 'mainboard';
      continue;
    }

    const match = rawLine.match(/^(\d+)x?\s+([^(]+?)(?:\s+\([A-Z0-9]+\)\s*\d*)?$/i);
    if (!match) continue;
    const quantity = parseInt(match[1], 10);
    const name = match[2].trim();
    const card = await resolveScryfallCard(name);
    if (card) entries.push({ card, quantity, zone });
  }
  return { entries };
}

app.post('/api/decks/:id/playtest/opening-hand', (req, res) => {
  const mulligans = Math.max(0, Math.min(7, Number(req.body.mulligans) || 0));
  res.status(501).json({ error: 'Use POST /api/decks/:id/playtest for server-side playtest state' });
});

app.post('/api/decks/:id/playtest', async (req, res) => {
  try {
    const decks = pool && isDbConnected
      ? await readDecksFromPostgres(DEMO_USER_ID)
      : readDecksFromDisk();
    const deck = decks.find((item) => item.id === req.params.id);
    if (!deck) return res.status(404).json({ error: 'Deck not found' });

    const mulligans = Math.max(0, Math.min(7, Number(req.body.mulligans) || 0));
    const poolCards = [];
    deck.entries.forEach((entry) => {
      if (entry.zone === 'mainboard') {
        for (let index = 0; index < entry.quantity; index++) poolCards.push(entry.card);
      }
    });
    for (let index = poolCards.length - 1; index > 0; index--) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [poolCards[index], poolCards[randomIndex]] = [poolCards[randomIndex], poolCards[index]];
    }
    const drawCount = Math.max(1, 7 - mulligans);
    res.json({
      hand: poolCards.slice(0, drawCount),
      library: poolCards.slice(drawCount),
      mulliganCount: mulligans
    });
  } catch (error) {
    console.error('Failed to create playtest hand:', error);
    res.status(500).json({ error: 'Failed to create playtest hand' });
  }
});

app.get('/api/cards/named', async (req, res) => {
  const name = String(req.query.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Card name is required' });
  try {
    const card = await resolveScryfallCard(name);
    if (!card) return res.status(404).json({ error: 'Card not found' });
    res.json(card);
  } catch (error) {
    res.status(500).json({ error: 'Failed to resolve card', details: error.message });
  }
});

app.post('/api/decks/demo/reset', async (req, res) => {
  try {
    const decks = pool && isDbConnected
      ? await readDecksFromPostgres(DEMO_USER_ID)
      : readDecksFromDisk();
    res.json({ decks });
  } catch (error) {
    console.error('Failed to reset demo decks:', error);
    res.status(500).json({ error: 'Failed to reset demo decks' });
  }
});

// ============================================================================
// 8. SERVER-SIDE LEGALITY & RULES VALIDATION ENGINE
// ============================================================================
app.post('/api/decks/validate', (req, res) => {
  const { format = 'commander', commander = null, cards = [] } = req.body;
  const issues = [];

  const mainboard = cards.filter((c) => c.zone === 'mainboard');
  const sideboard = cards.filter((c) => c.zone === 'sideboard');

  const mainCount = mainboard.reduce((sum, c) => sum + (c.quantity || 1), 0);
  const sideCount = sideboard.reduce((sum, c) => sum + (c.quantity || 1), 0);
  const totalCommanderCount = mainCount + (commander ? 1 : 0);

  if (format.toLowerCase() === 'commander') {
    if (!commander) {
      issues.push({ severity: 'error', message: 'Commander deck requires a designated Commander.' });
    }
    if (totalCommanderCount !== 100) {
      issues.push({
        severity: 'warning',
        message: `Commander deck has ${totalCommanderCount}/100 cards (needs exactly 100).`
      });
    }

    const cmdColors = new Set(commander?.color_identity || []);

    for (const item of mainboard) {
      const isBasic = BASIC_LANDS.has(item.name) || (item.type_line || '').includes('Basic Land');
      if (!isBasic && item.quantity > 1) {
        issues.push({
          severity: 'error',
          message: `Singleton violation: ${item.name} has ${item.quantity} copies (max 1 allowed).`
        });
      }

      if (commander) {
        const cardColors = item.color_identity || [];
        const outsideColor = cardColors.some((col) => !cmdColors.has(col));
        if (outsideColor) {
          issues.push({
            severity: 'error',
            message: `Color Identity violation: ${item.name} (${cardColors.join('')}) is outside ${commander.name}'s identity (${[...cmdColors].join('') || 'Colorless'}).`
          });
        }
      }
    }
  } else {
    // Constructed formats (Modern / Standard / Pioneer)
    if (mainCount < 60) {
      issues.push({
        severity: 'warning',
        message: `Mainboard has ${mainCount}/60 minimum cards.`
      });
    }
    if (sideCount > 15) {
      issues.push({
        severity: 'error',
        message: `Sideboard has ${sideCount}/15 maximum cards.`
      });
    }

    // Combine main + side quantities for 4-of check
    const countsByName = {};
    for (const item of [...mainboard, ...sideboard]) {
      countsByName[item.name] = (countsByName[item.name] || 0) + (item.quantity || 1);
    }

    for (const [cardName, qty] of Object.entries(countsByName)) {
      if (!BASIC_LANDS.has(cardName) && qty > 4) {
        issues.push({
          severity: 'error',
          message: `4-Copy Rule violation: ${cardName} has ${qty} total copies (max 4 allowed).`
        });
      }
    }
  }

  res.json({
    isValid: issues.filter((i) => i.severity === 'error').length === 0,
    format,
    stats: {
      mainboardCards: mainCount,
      sideboardCards: sideCount,
      totalCards: format.toLowerCase() === 'commander' ? totalCommanderCount : mainCount + sideCount
    },
    issues
  });
});

// ============================================================================
// 9. MTG ARENA TEXT PARSER ENDPOINT
// ============================================================================
app.post('/api/decks/parse', (req, res) => {
  const { text = '' } = req.body;
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let currentZone = 'mainboard';
  const parsedEntries = [];

  for (const line of lines) {
    if (/^(commander|command zone):?$/i.test(line)) {
      currentZone = 'commander';
      continue;
    }
    if (/^(sideboard):?$/i.test(line)) {
      currentZone = 'sideboard';
      continue;
    }
    if (/^(deck|mainboard):?$/i.test(line)) {
      currentZone = 'mainboard';
      continue;
    }

    const match = line.match(/^(\d+)x?\s+([^(\n\r]+?)(?:\s+\([A-Z0-9]+\)\s*\d*)?$/i);
    if (match) {
      parsedEntries.push({
        quantity: parseInt(match[1], 10),
        name: match[2].trim(),
        zone: currentZone
      });
    }
  }

  res.json({
    count: parsedEntries.length,
    entries: parsedEntries
  });
});

// ============================================================================
// 10. SERVER STARTUP & DATABASE INITIALIZATION
// ============================================================================
if (!process.env.VERCEL) {
  app.listen(PORT, async () => {
    console.log(`\n============================================================`);
    console.log(`🔥 ArcaneForge Backend API running on http://localhost:${PORT}`);
    console.log(`🔍 Health check: http://localhost:${PORT}/api/health`);
    console.log(`============================================================`);

    if (pool) {
      console.log('⚡ Connecting to Neon PostgreSQL...');
      try {
        await initDatabase();
      } catch (err) {
        console.error('❌ Failed to initialize Neon PostgreSQL on startup:', err.message);
      }
    } else {
      console.log('ℹ️  No DATABASE_URL configured in .env. Using temporary file store.');
    }
  });
}

export default app;
