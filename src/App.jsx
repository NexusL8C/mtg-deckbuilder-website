import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { apiUrl } from './api';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Layers,
  List,
  LayoutGrid,
  Shuffle,
  Download,
  Upload,
  RotateCcw,
  RefreshCw,
  Crown,
  BookOpen,
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Copy,
  Check,
  ChevronRight,
  Info,
  Euro,
  DollarSign,
  Database,
  Server,
  Globe,
  SlidersHorizontal,
  X,
  Eye,
  ArrowRightLeft,
  Flame,
  Droplets,
  Skull,
  Sun,
  Trees,
  CircleDot
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie
} from 'recharts';

// ============================================================================
// 1. CONSTANTS, MANA SYMBOL RENDERER & HELPERS
// ============================================================================

const MANA_COLORS = [
  { code: 'W', name: 'White', bg: 'bg-amber-100', text: 'text-amber-950', border: 'border-amber-300', hex: '#F8F6D8', accent: '#EAB308' },
  { code: 'U', name: 'Blue', bg: 'bg-sky-500', text: 'text-white', border: 'border-sky-300', hex: '#0E68AB', accent: '#38BDF8' },
  { code: 'B', name: 'Black', bg: 'bg-zinc-800', text: 'text-zinc-100', border: 'border-zinc-500', hex: '#6B21A8', accent: '#A855F7' },
  { code: 'R', name: 'Red', bg: 'bg-rose-600', text: 'text-white', border: 'border-rose-400', hex: '#D3202A', accent: '#F43F5E' },
  { code: 'G', name: 'Green', bg: 'bg-emerald-600', text: 'text-white', border: 'border-emerald-400', hex: '#00733E', accent: '#10B981' },
  { code: 'C', name: 'Colorless', bg: 'bg-slate-400', text: 'text-slate-950', border: 'border-slate-300', hex: '#94A3B8', accent: '#CBD5E1' },
];

const CARD_TYPES = [
  'All',
  'Creature',
  'Instant',
  'Sorcery',
  'Artifact',
  'Enchantment',
  'Planeswalker',
  'Land'
];

const BASIC_LAND_NAMES = new Set([
  'Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes',
  'Snow-Covered Plains', 'Snow-Covered Island', 'Snow-Covered Swamp',
  'Snow-Covered Mountain', 'Snow-Covered Forest'
]);

const FALLBACK_CARD_IMAGE =
  'https://cards.scryfall.io/large/front/0/c/0c082aa8-bf7f-47f2-baf8-43ad253fd7d7.jpg';

// Helper to extract front/back image URIs safely from Scryfall card objects
function getCardImage(card, faceIndex = 0) {
  if (!card) return '';
  if (card.card_faces && card.card_faces[faceIndex]?.image_uris?.normal) {
    return card.card_faces[faceIndex].image_uris.normal;
  }
  if (card.image_uris?.normal) {
    return card.image_uris.normal;
  }
  if (card.card_faces && card.card_faces[0]?.image_uris?.normal) {
    return card.card_faces[0].image_uris.normal;
  }
  return FALLBACK_CARD_IMAGE;
}

function isDoubleFaced(card) {
  return Boolean(
    card?.card_faces &&
    card.card_faces.length > 1 &&
    card.card_faces[0]?.image_uris &&
    card.card_faces[1]?.image_uris
  );
}

// Categorize a card into primary deckbuilding group
function getPrimaryCategory(typeLine = '') {
  const lower = typeLine.toLowerCase();
  if (lower.includes('land')) return 'Lands';
  if (lower.includes('creature')) return 'Creatures';
  if (lower.includes('planeswalker')) return 'Planeswalkers';
  if (lower.includes('instant') || lower.includes('sorcery')) return 'Instants & Sorceries';
  if (lower.includes('artifact') || lower.includes('enchantment') || lower.includes('battle')) return 'Artifacts & Enchantments';
  return 'Other Spells';
}

// Parse Scryfall mana cost string like "{2}{U}{U}{R}" into crisp visual badges
function ManaCostBadges({ manaCost, size = 'sm' }) {
  if (!manaCost) return null;
  // Handle split/double-faced mana costs like "{1}{U} // {2}{R}"
  const parts = manaCost.split('//');
  const sizeClasses = size === 'sm'
    ? 'w-4 h-4 text-[10px]'
    : 'w-5 h-5 text-xs';

  const renderSymbols = (str, groupIdx) => {
    const matches = str.match(/\{([^}]+)\}/g) || [];
    return matches.map((raw, idx) => {
      const symbol = raw.replace(/[{}]/g, '');
      let styleClass = 'bg-slate-300 text-slate-900 border-slate-400';
      if (symbol === 'W') styleClass = 'bg-amber-100 text-amber-950 border-amber-300';
      else if (symbol === 'U') styleClass = 'bg-sky-500 text-white border-sky-300';
      else if (symbol === 'B') styleClass = 'bg-zinc-800 text-zinc-100 border-zinc-500';
      else if (symbol === 'R') styleClass = 'bg-rose-600 text-white border-rose-400';
      else if (symbol === 'G') styleClass = 'bg-emerald-600 text-white border-emerald-400';
      else if (symbol.includes('/')) styleClass = 'bg-gradient-to-br from-amber-300 to-sky-500 text-slate-950 border-white/50';

      return (
        <span
          key={`${groupIdx}-${idx}`}
          className={`inline-flex items-center justify-center rounded-full font-bold border shadow-sm leading-none select-none ${sizeClasses} ${styleClass}`}
          title={`Mana symbol ${raw}`}
        >
          {symbol}
        </span>
      );
    });
  };

  return (
    <div className="inline-flex items-center gap-0.5 flex-wrap">
      {parts.map((part, idx) => (
        <React.Fragment key={idx}>
          {idx > 0 && <span className="text-slate-500 text-xs mx-0.5">//</span>}
          {renderSymbols(part, idx)}
        </React.Fragment>
      ))}
    </div>
  );
}

// ============================================================================
// 2. PRE-LOADED AUTHENTIC STARTER DECKS & FALLBACK CARD CACHE
// ============================================================================

const PRELOADED_CARDS = [
  {
    id: '230b6900-4469-4a13-b5f1-22c01f400f67',
    name: 'Niv-Mizzet, Parun',
    mana_cost: '{U}{U}{U}{R}{R}{R}',
    cmc: 6,
    type_line: 'Legendary Creature — Dragon Wizard',
    oracle_text: "This spell can't be countered.\nFlying\nWhenever you draw a card, Niv-Mizzet, Parun deals 1 damage to any target.\nWhenever a player casts an instant or sorcery spell, you draw a card.",
    color_identity: ['U', 'R'],
    colors: ['U', 'R'],
    legalities: { commander: 'legal', modern: 'legal', standard: 'not_legal' },
    prices: { eur: '1.85', usd: '1.99' },
    image_uris: {
      normal: 'https://cards.scryfall.io/normal/front/3/0/3035a97f-5104-4b56-84a4-5206e75607fc.jpg'
    }
  },
  {
    id: 'f3b9818f-3a55-43f3-8687-f844e859f896',
    name: 'Veyran, Voice of Duality',
    mana_cost: '{1}{U}{R}',
    cmc: 3,
    type_line: 'Legendary Creature — Efreet Wizard',
    oracle_text: 'Magecraft — Whenever you cast or copy an instant or sorcery spell, Veyran, Voice of Duality gets +1/+1 until end of turn.\nIf you casting or copying an instant or sorcery spell causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.',
    color_identity: ['U', 'R'],
    colors: ['U', 'R'],
    legalities: { commander: 'legal', modern: 'not_legal', standard: 'not_legal' },
    prices: { eur: '6.50', usd: '7.40' },
    image_uris: {
      normal: 'https://cards.scryfall.io/normal/front/5/6/56d93855-c749-4bdf-9a90-4f69f4226e46.jpg'
    }
  },
  {
    id: 'fa96b8dc-0b8a-4100-9b34-707200e01153',
    name: 'Storm-Kiln Artist',
    mana_cost: '{3}{R}',
    cmc: 4,
    type_line: 'Creature — Dwarf Shaman',
    oracle_text: 'Storm-Kiln Artist gets +1/+0 for each artifact you control.\nMagecraft — Whenever you cast or copy an instant or sorcery spell, create a Treasure token.',
    color_identity: ['R'],
    colors: ['R'],
    legalities: { commander: 'legal', modern: 'legal', standard: 'not_legal' },
    prices: { eur: '2.90', usd: '3.25' },
    image_uris: {
      normal: 'https://cards.scryfall.io/normal/front/f/a/fa96b8dc-0b8a-4100-9b34-707200e01153.jpg'
    }
  },
  {
    id: '761df6cd-0928-4167-8902-58fdb50181a0',
    name: 'Archmage Emeritus',
    mana_cost: '{2}{U}{U}',
    cmc: 4,
    type_line: 'Creature — Human Wizard',
    oracle_text: 'Magecraft — Whenever you cast or copy an instant or sorcery spell, draw a card.',
    color_identity: ['U'],
    colors: ['U'],
    legalities: { commander: 'legal', modern: 'legal', standard: 'not_legal' },
    prices: { eur: '3.40', usd: '4.10' },
    image_uris: {
      normal: 'https://cards.scryfall.io/normal/front/7/6/761df6cd-0928-4167-8902-58fdb50181a0.jpg'
    }
  },
  {
    id: '04d1ca66-b511-41f8-95c2-b927d0b8bd25',
    name: 'Goblin Electromancer',
    mana_cost: '{U}{R}',
    cmc: 2,
    type_line: 'Creature — Goblin Wizard',
    oracle_text: 'Instant and sorcery spells you cast cost {1} less to cast.',
    color_identity: ['U', 'R'],
    colors: ['U', 'R'],
    legalities: { commander: 'legal', modern: 'legal', standard: 'not_legal' },
    prices: { eur: '0.35', usd: '0.45' },
    image_uris: {
      normal: 'https://cards.scryfall.io/normal/front/e/c/ecb1edcf-f8bf-4ccb-9182-844289140a36.jpg'
    }
  },
  {
    id: '219577e6-758a-4135-9a80-32491c091a16',
    name: 'Young Pyromancer',
    mana_cost: '{1}{R}',
    cmc: 2,
    type_line: 'Creature — Human Shaman',
    oracle_text: 'Whenever you cast an instant or sorcery spell, create a 1/1 red Elemental creature token.',
    color_identity: ['R'],
    colors: ['R'],
    legalities: { commander: 'legal', modern: 'legal', standard: 'not_legal' },
    prices: { eur: '0.40', usd: '0.50' },
    image_uris: {
      normal: 'https://cards.scryfall.io/normal/front/2/1/219577e6-758a-4135-9a80-32491c091a16.jpg'
    }
  },
  {
    id: '7ed62869-a060-4722-9757-485c91f0c158',
    name: 'Guttersnipe',
    mana_cost: '{2}{R}',
    cmc: 3,
    type_line: 'Creature — Goblin Shaman',
    oracle_text: 'Whenever you cast an instant or sorcery spell, Guttersnipe deals 2 damage to each opponent.',
    color_identity: ['R'],
    colors: ['R'],
    legalities: { commander: 'legal', modern: 'legal', standard: 'not_legal' },
    prices: { eur: '0.50', usd: '0.65' },
    image_uris: {
      normal: 'https://cards.scryfall.io/normal/front/7/e/7ed62869-a060-4722-9757-485c91f0c158.jpg'
    }
  },
  {
    id: '1b83260b-8c53-424b-b635-0e072f660065',
    name: 'Counterspell',
    mana_cost: '{U}{U}',
    cmc: 2,
    type_line: 'Instant',
    oracle_text: 'Counter target spell.',
    color_identity: ['U'],
    colors: ['U'],
    legalities: { commander: 'legal', modern: 'legal', standard: 'not_legal' },
    prices: { eur: '1.20', usd: '1.45' },
    image_uris: {
      normal: 'https://cards.scryfall.io/normal/front/8/4/8493131c-0a7b-4be6-a8a2-0b425f4f67fb.jpg'
    }
  },
  {
    id: '48070245-1370-4cf1-be15-d4e8a8b92ba8',
    name: 'Brainstorm',
    mana_cost: '{U}',
    cmc: 1,
    type_line: 'Instant',
    oracle_text: 'Draw three cards, then put two cards from your hand on top of your library in any order.',
    color_identity: ['U'],
    colors: ['U'],
    legalities: { commander: 'legal', modern: 'not_legal', standard: 'not_legal' },
    prices: { eur: '1.10', usd: '1.30' },
    image_uris: {
      normal: 'https://cards.scryfall.io/normal/front/4/8/48070245-1370-4cf1-be15-d4e8a8b92ba8.jpg'
    }
  },
  {
    id: '323db259-d35e-467d-9a46-4adcb2fc107c',
    name: 'Opt',
    mana_cost: '{U}',
    cmc: 1,
    type_line: 'Instant',
    oracle_text: 'Scry 1.\nDraw a card.',
    color_identity: ['U'],
    colors: ['U'],
    legalities: { commander: 'legal', modern: 'legal', standard: 'legal' },
    prices: { eur: '0.20', usd: '0.25' },
    image_uris: {
      normal: 'https://cards.scryfall.io/normal/front/3/2/323db259-d35e-467d-9a46-4adcb2fc107c.jpg'
    }
  },
  {
    id: 'c144b325-53a3-4234-a423-3597101f9e75',
    name: 'Chaos Warp',
    mana_cost: '{2}{R}',
    cmc: 3,
    type_line: 'Instant',
    oracle_text: 'The owner of target permanent shuffles it into their library, then reveals the top card of their library. If it is a permanent card, they put it onto the battlefield.',
    color_identity: ['R'],
    colors: ['R'],
    legalities: { commander: 'legal', modern: 'not_legal', standard: 'not_legal' },
    prices: { eur: '1.50', usd: '1.80' },
    image_uris: {
      normal: 'https://cards.scryfall.io/normal/front/c/1/c144b325-53a3-4234-a423-3597101f9e75.jpg'
    }
  },
  {
    id: '0f2fb8f8-7e69-47bf-9e3c-896f2d8a2104',
    name: 'Ponder',
    mana_cost: '{U}',
    cmc: 1,
    type_line: 'Sorcery',
    oracle_text: 'Look at the top three cards of your library, then put them back in any order. You may shuffle.\nDraw a card.',
    color_identity: ['U'],
    colors: ['U'],
    legalities: { commander: 'legal', modern: 'banned', standard: 'not_legal' },
    prices: { eur: '1.90', usd: '2.40' },
    image_uris: {
      normal: 'https://cards.scryfall.io/normal/front/9/c/9c9d0d52-5008-463a-bf09-7b9272b884b4.jpg'
    }
  },
  {
    id: 'f5f8d927-2b46-4627-98b5-5303f27b6a52',
    name: 'Preordain',
    mana_cost: '{U}',
    cmc: 1,
    type_line: 'Sorcery',
    oracle_text: 'Scry 2, then draw a card.',
    color_identity: ['U'],
    colors: ['U'],
    legalities: { commander: 'legal', modern: 'legal', standard: 'not_legal' },
    prices: { eur: '1.15', usd: '1.40' },
    image_uris: {
      normal: 'https://cards.scryfall.io/normal/front/d/1/d10b9be3-d4ff-4e3c-b0d5-5ab2c4e6d684.jpg'
    }
  },
  {
    id: '8c98de02-6520-4161-90c4-75a022c02a27',
    name: 'Blasphemous Act',
    mana_cost: '{8}{R}',
    cmc: 9,
    type_line: 'Sorcery',
    oracle_text: 'This spell costs {1} less to cast for each creature on the battlefield.\nBlasphemous Act deals 13 damage to each creature.',
    color_identity: ['R'],
    colors: ['R'],
    legalities: { commander: 'legal', modern: 'legal', standard: 'not_legal' },
    prices: { eur: '2.60', usd: '3.10' },
    image_uris: {
      normal: 'https://cards.scryfall.io/normal/front/8/a/8aa9682d-5176-4475-a000-0997f1a3e612.jpg'
    }
  },
  {
    id: '583a9928-dd27-4f3c-b700-3a6a12113429',
    name: "Jeska's Will",
    mana_cost: '{2}{R}',
    cmc: 3,
    type_line: 'Sorcery',
    oracle_text: 'Choose one. If you control a commander as you cast this spell, you may choose both instead.\n• Add {R} for each card in target opponent\'s hand.\n• Exile the top three cards of your library. You may play them this turn.',
    color_identity: ['R'],
    colors: ['R'],
    legalities: { commander: 'legal', modern: 'not_legal', standard: 'not_legal' },
    prices: { eur: '18.50', usd: '21.99' },
    image_uris: {
      normal: 'https://cards.scryfall.io/normal/front/9/9/99e0c371-1024-4432-9fd9-3bc29c8d38e4.jpg'
    }
  },
  {
    id: '4ee17db9-a26b-4600-8968-829034003f0b',
    name: 'Sol Ring',
    mana_cost: '{1}',
    cmc: 1,
    type_line: 'Artifact',
    oracle_text: '{T}: Add {C}{C}.',
    color_identity: [],
    colors: [],
    legalities: { commander: 'legal', modern: 'not_legal', standard: 'not_legal' },
    prices: { eur: '1.30', usd: '1.50' },
    image_uris: {
      normal: 'https://cards.scryfall.io/normal/front/6/c/6c5c9437-3d99-4a7c-8255-9acdcb11975c.jpg'
    }
  },
  {
    id: 'f2b9983e-20d4-4d12-9e2c-ec6d9a345787',
    name: 'Arcane Signet',
    mana_cost: '{2}',
    cmc: 2,
    type_line: 'Artifact',
    oracle_text: '{T}: Add one mana of any color in your commander\'s color identity.',
    color_identity: [],
    colors: [],
    legalities: { commander: 'legal', modern: 'legal', standard: 'not_legal' },
    prices: { eur: '0.80', usd: '0.99' },
    image_uris: {
      normal: 'https://cards.scryfall.io/normal/front/f/c/fc6c69a0-ac24-4486-8893-a6303d08fc6e.jpg'
    }
  },
  {
    id: 'a3407b09-f246-45c6-8892-9f904b9384a0',
    name: 'Izzet Signet',
    mana_cost: '{2}',
    cmc: 2,
    type_line: 'Artifact',
    oracle_text: '{1}, {T}: Add {U}{R}.',
    color_identity: ['U', 'R'],
    colors: [],
    legalities: { commander: 'legal', modern: 'legal', standard: 'not_legal' },
    prices: { eur: '0.45', usd: '0.60' },
    image_uris: {
      normal: 'https://cards.scryfall.io/normal/front/9/d/9d968231-b187-404c-8ceb-f2eb2f58e21c.jpg'
    }
  },
  {
    id: 'd69143f2-f877-4239-8c34-f1ab31fc6b86',
    name: 'Rhystic Study',
    mana_cost: '{2}{U}',
    cmc: 3,
    type_line: 'Enchantment',
    oracle_text: 'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.',
    color_identity: ['U'],
    colors: ['U'],
    legalities: { commander: 'legal', modern: 'not_legal', standard: 'not_legal' },
    prices: { eur: '36.00', usd: '42.50' },
    image_uris: {
      normal: 'https://cards.scryfall.io/normal/front/d/6/d69143f2-f877-4239-8c34-f1ab31fc6b86.jpg'
    }
  },
  {
    id: '275c0806-b641-4c26-8450-12a30a041335',
    name: 'Thousand-Year Storm',
    mana_cost: '{4}{U}{R}',
    cmc: 6,
    type_line: 'Enchantment',
    oracle_text: 'Whenever you cast an instant or sorcery spell, copy it for each other instant and sorcery spell you\'ve cast before it this turn. You may choose new targets for the copies.',
    color_identity: ['U', 'R'],
    colors: ['U', 'R'],
    legalities: { commander: 'legal', modern: 'legal', standard: 'legal' },
    prices: { eur: '2.20', usd: '2.80' },
    image_uris: {
      normal: 'https://cards.scryfall.io/normal/front/2/7/274e22fb-7107-41b3-a2b3-04c27eb91926.jpg'
    }
  },
  {
    id: 'b8be8f63-6d70-4c11-8b5b-5f3b0259d47c',
    name: 'Steam Vents',
    mana_cost: '',
    cmc: 0,
    type_line: 'Land — Island Mountain',
    oracle_text: '({T}: Add {U} or {R}.)\nAs Steam Vents enters the battlefield, you may pay 2 life. If you don\'t, it enters the battlefield tapped.',
    color_identity: ['U', 'R'],
    colors: [],
    legalities: { commander: 'legal', modern: 'legal', standard: 'not_legal' },
    prices: { eur: '14.50', usd: '16.90' },
    image_uris: {
      normal: 'https://cards.scryfall.io/normal/front/b/8/b8be8f63-6d70-4c11-8b5b-5f3b0259d47c.jpg'
    }
  },
  {
    id: '0f10d0f3-4f83-4821-b823-0b1f14c37069',
    name: 'Command Tower',
    mana_cost: '',
    cmc: 0,
    type_line: 'Land',
    oracle_text: '{T}: Add one mana of any color in your commander\'s color identity.',
    color_identity: [],
    colors: [],
    legalities: { commander: 'legal', modern: 'not_legal', standard: 'not_legal' },
    prices: { eur: '0.25', usd: '0.35' },
    image_uris: {
      normal: 'https://cards.scryfall.io/normal/front/0/f/0f10d0f3-4f83-4821-b823-0b1f14c37069.jpg'
    }
  },
  {
    id: 'b2b2709b-57a9-4a12-8b9f-73b82d16f338',
    name: 'Island',
    mana_cost: '',
    cmc: 0,
    type_line: 'Basic Land — Island',
    oracle_text: '({T}: Add {U}.)',
    color_identity: ['U'],
    colors: [],
    legalities: { commander: 'legal', modern: 'legal', standard: 'legal' },
    prices: { eur: '0.10', usd: '0.15' },
    image_uris: {
      normal: 'https://cards.scryfall.io/normal/front/1/2/12b2bae7-8c04-4651-a2b3-736730417811.jpg'
    }
  },
  {
    id: 'c86a760b-7094-41c8-a074-5f5f59732761',
    name: 'Mountain',
    mana_cost: '',
    cmc: 0,
    type_line: 'Basic Land — Mountain',
    oracle_text: '({T}: Add {R}.)',
    color_identity: ['R'],
    colors: [],
    legalities: { commander: 'legal', modern: 'legal', standard: 'legal' },
    prices: { eur: '0.10', usd: '0.15' },
    image_uris: {
      normal: 'https://cards.scryfall.io/normal/front/a/e/ae3d2835-9543-4274-9614-142014c81c2b.jpg'
    }
  },
  {
    id: 'f29ba16f-c8fb-42fe-aabf-87089cb214a7',
    name: 'Lightning Bolt',
    mana_cost: '{R}',
    cmc: 1,
    type_line: 'Instant',
    oracle_text: 'Lightning Bolt deals 3 damage to any target.',
    color_identity: ['R'],
    colors: ['R'],
    legalities: { commander: 'legal', modern: 'legal', standard: 'not_legal' },
    prices: { eur: '1.50', usd: '1.99' },
    image_uris: {
      normal: 'https://cards.scryfall.io/normal/front/f/2/f29ba16f-c8fb-42fe-aabf-87089cb214a7.jpg'
    }
  },
  {
    id: '3c0f95e7-f954-4677-b6f3-21b0d8a55613',
    name: 'Goblin Guide',
    mana_cost: '{R}',
    cmc: 1,
    type_line: 'Creature — Goblin Scout',
    oracle_text: 'Haste\nWhenever Goblin Guide attacks, defending player reveals the top card of their library. If it\'s a land card, that player puts it into their hand.',
    color_identity: ['R'],
    colors: ['R'],
    legalities: { commander: 'legal', modern: 'legal', standard: 'not_legal' },
    prices: { eur: '3.80', usd: '4.50' },
    image_uris: {
      normal: 'https://cards.scryfall.io/normal/front/3/c/3c0f95e7-f954-4677-b6f3-21b0d8a55613.jpg'
    }
  },
  {
    id: 'd66d4303-7265-4e09-8c37-c3e6bc137a10',
    name: 'Monastery Swiftspear',
    mana_cost: '{R}',
    cmc: 1,
    type_line: 'Creature — Human Monk',
    oracle_text: 'Haste\nProwess (Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.)',
    color_identity: ['R'],
    colors: ['R'],
    legalities: { commander: 'legal', modern: 'legal', standard: 'legal' },
    prices: { eur: '0.60', usd: '0.80' },
    image_uris: {
      normal: 'https://cards.scryfall.io/normal/front/d/6/d66d4303-7265-4e09-8c37-c3e6bc137a10.jpg'
    }
  },
  {
    id: '162ef72f-3690-45a2-999c-0351899a279a',
    name: 'Eidolon of the Great Revel',
    mana_cost: '{R}{R}',
    cmc: 2,
    type_line: 'Enchantment Creature — Spirit',
    oracle_text: 'Whenever a player casts a spell with mana value 3 or less, Eidolon of the Great Revel deals 2 damage to that player.',
    color_identity: ['R'],
    colors: ['R'],
    legalities: { commander: 'legal', modern: 'legal', standard: 'not_legal' },
    prices: { eur: '5.50', usd: '6.25' },
    image_uris: {
      normal: 'https://cards.scryfall.io/normal/front/1/8/183ef738-0559-49ca-85b4-e6836521f203.jpg'
    }
  },
  {
    id: 'd7a7f8a0-0118-4518-8374-a813f2eb8f90',
    name: 'Lava Spike',
    mana_cost: '{R}',
    cmc: 1,
    type_line: 'Sorcery — Arcane',
    oracle_text: 'Lava Spike deals 3 damage to target player or planeswalker.',
    color_identity: ['R'],
    colors: ['R'],
    legalities: { commander: 'legal', modern: 'legal', standard: 'not_legal' },
    prices: { eur: '2.10', usd: '2.50' },
    image_uris: {
      normal: 'https://cards.scryfall.io/normal/front/7/9/79c21c1f-eaa4-454d-a1c7-b41466d0a428.jpg'
    }
  },
  {
    id: '42a5710b-8918-413b-990a-5e2a418194a5',
    name: 'Rift Bolt',
    mana_cost: '{2}{R}',
    cmc: 3,
    type_line: 'Sorcery',
    oracle_text: 'Rift Bolt deals 3 damage to any target.\nSuspend 1—{R}',
    color_identity: ['R'],
    colors: ['R'],
    legalities: { commander: 'legal', modern: 'legal', standard: 'not_legal' },
    prices: { eur: '0.65', usd: '0.85' },
    image_uris: {
      normal: 'https://cards.scryfall.io/normal/front/4/c/4ccd0ff8-41b9-4Ce1-9028-f9b6bd916c0c.jpg'
    }
  },
  {
    id: '4820471f-2928-4012-8b90-811b0c980041',
    name: 'Skullcrack',
    mana_cost: '{1}{R}',
    cmc: 2,
    type_line: 'Instant',
    oracle_text: 'Players can\'t gain life this turn. Damage can\'t be prevented this turn. Skullcrack deals 3 damage to target player or planeswalker.',
    color_identity: ['R'],
    colors: ['R'],
    legalities: { commander: 'legal', modern: 'legal', standard: 'not_legal' },
    prices: { eur: '1.40', usd: '1.75' },
    image_uris: {
      normal: 'https://cards.scryfall.io/normal/front/7/f/7f399983-d70a-4cf3-b76e-bb0c472e7c6f.jpg'
    }
  },
  {
    id: 'f5b5b5f8-0c6b-4b4e-83f9-269c0d7d814b',
    name: 'Searing Blaze',
    mana_cost: '{R}{R}',
    cmc: 2,
    type_line: 'Instant',
    oracle_text: 'Searing Blaze deals 1 damage to target player or planeswalker and 1 damage to target creature that player or that planeswalker\'s controller controls.\nLandfall — If you had a land enter the battlefield under your control this turn, Searing Blaze deals 3 damage to that player or planeswalker and 3 damage to that creature instead.',
    color_identity: ['R'],
    colors: ['R'],
    legalities: { commander: 'legal', modern: 'legal', standard: 'not_legal' },
    prices: { eur: '1.80', usd: '2.20' },
    image_uris: {
      normal: 'https://cards.scryfall.io/normal/front/f/6/f659d464-13dd-49e2-a842-098dcba49659.jpg'
    }
  },
  {
    id: '3b6d619c-202b-4962-9602-799f47b8c135',
    name: 'Demonic Tutor',
    mana_cost: '{1}{B}',
    cmc: 2,
    type_line: 'Sorcery',
    oracle_text: 'Search your library for a card, put that card into your hand, then shuffle.',
    color_identity: ['B'],
    colors: ['B'],
    legalities: { commander: 'legal', modern: 'not_legal', standard: 'not_legal' },
    prices: { eur: '34.00', usd: '39.99' },
    image_uris: {
      normal: 'https://cards.scryfall.io/normal/front/a/2/a24b4cb6-cebb-428b-8654-74347a6a8d63.jpg'
    }
  }
];

const CARD_MAP = Object.fromEntries(PRELOADED_CARDS.map((c) => [c.name, c]));

const INITIAL_DECKS = [
  {
    id: 'deck-izzet-commander',
    name: 'Izzet Spellslinger — Niv-Mizzet EDH',
    format: 'commander',
    description: 'High-synergy Commander spellslinger deck focused on cantrips, Magecraft triggers, and Niv-Mizzet ping combos.',
    entries: [
      { card: CARD_MAP['Niv-Mizzet, Parun'], quantity: 1, zone: 'commander' },
      { card: CARD_MAP['Veyran, Voice of Duality'], quantity: 1, zone: 'mainboard' },
      { card: CARD_MAP['Storm-Kiln Artist'], quantity: 1, zone: 'mainboard' },
      { card: CARD_MAP['Archmage Emeritus'], quantity: 1, zone: 'mainboard' },
      { card: CARD_MAP['Goblin Electromancer'], quantity: 1, zone: 'mainboard' },
      { card: CARD_MAP['Young Pyromancer'], quantity: 1, zone: 'mainboard' },
      { card: CARD_MAP['Guttersnipe'], quantity: 1, zone: 'mainboard' },
      { card: CARD_MAP['Goblin Guide'], quantity: 1, zone: 'mainboard' },
      { card: CARD_MAP['Monastery Swiftspear'], quantity: 1, zone: 'mainboard' },
      { card: CARD_MAP['Eidolon of the Great Revel'], quantity: 1, zone: 'mainboard' },
      { card: CARD_MAP['Counterspell'], quantity: 1, zone: 'mainboard' },
      { card: CARD_MAP['Brainstorm'], quantity: 1, zone: 'mainboard' },
      { card: CARD_MAP['Opt'], quantity: 1, zone: 'mainboard' },
      { card: CARD_MAP['Chaos Warp'], quantity: 1, zone: 'mainboard' },
      { card: CARD_MAP['Lightning Bolt'], quantity: 1, zone: 'mainboard' },
      { card: CARD_MAP['Skullcrack'], quantity: 1, zone: 'mainboard' },
      { card: CARD_MAP['Searing Blaze'], quantity: 1, zone: 'mainboard' },
      { card: CARD_MAP['Ponder'], quantity: 1, zone: 'mainboard' },
      { card: CARD_MAP['Preordain'], quantity: 1, zone: 'mainboard' },
      { card: CARD_MAP['Blasphemous Act'], quantity: 1, zone: 'mainboard' },
      { card: CARD_MAP["Jeska's Will"], quantity: 1, zone: 'mainboard' },
      { card: CARD_MAP['Lava Spike'], quantity: 1, zone: 'mainboard' },
      { card: CARD_MAP['Rift Bolt'], quantity: 1, zone: 'mainboard' },
      { card: CARD_MAP['Sol Ring'], quantity: 1, zone: 'mainboard' },
      { card: CARD_MAP['Arcane Signet'], quantity: 1, zone: 'mainboard' },
      { card: CARD_MAP['Izzet Signet'], quantity: 1, zone: 'mainboard' },
      { card: CARD_MAP['Rhystic Study'], quantity: 1, zone: 'mainboard' },
      { card: CARD_MAP['Thousand-Year Storm'], quantity: 1, zone: 'mainboard' },
      { card: CARD_MAP['Steam Vents'], quantity: 1, zone: 'mainboard' },
      { card: CARD_MAP['Command Tower'], quantity: 1, zone: 'mainboard' },
      { card: CARD_MAP['Island'], quantity: 36, zone: 'mainboard' },
      { card: CARD_MAP['Mountain'], quantity: 34, zone: 'mainboard' },
    ]
  },
  {
    id: 'deck-modern-burn',
    name: 'Red Deck Wins — 60-Card Modern Burn',
    format: 'modern',
    description: 'Aggressive 60-card Modern constructed burn deck with 4-of playsets and a 4-card sideboard starter.',
    entries: [
      { card: CARD_MAP['Goblin Guide'], quantity: 4, zone: 'mainboard' },
      { card: CARD_MAP['Monastery Swiftspear'], quantity: 4, zone: 'mainboard' },
      { card: CARD_MAP['Eidolon of the Great Revel'], quantity: 4, zone: 'mainboard' },
      { card: CARD_MAP['Young Pyromancer'], quantity: 4, zone: 'mainboard' },
      { card: CARD_MAP['Guttersnipe'], quantity: 2, zone: 'mainboard' },
      { card: CARD_MAP['Lightning Bolt'], quantity: 4, zone: 'mainboard' },
      { card: CARD_MAP['Lava Spike'], quantity: 4, zone: 'mainboard' },
      { card: CARD_MAP['Rift Bolt'], quantity: 4, zone: 'mainboard' },
      { card: CARD_MAP['Skullcrack'], quantity: 4, zone: 'mainboard' },
      { card: CARD_MAP['Searing Blaze'], quantity: 4, zone: 'mainboard' },
      { card: CARD_MAP['Steam Vents'], quantity: 2, zone: 'mainboard' },
      { card: CARD_MAP['Mountain'], quantity: 20, zone: 'mainboard' },
      { card: CARD_MAP['Blasphemous Act'], quantity: 2, zone: 'sideboard' },
      { card: CARD_MAP['Counterspell'], quantity: 2, zone: 'sideboard' },
    ]
  }
];

// ============================================================================
// 4. MAIN APPLICATION COMPONENT
// ============================================================================

export default function App() {
  // --- Persistent Decks State ---
  const [decks, setDecks] = useState([]);
  const [persistenceReady, setPersistenceReady] = useState(false);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [activeDeckId, setActiveDeckId] = useState('');
  const [serverDeckView, setServerDeckView] = useState(null);

  useEffect(() => {
    if (!activeDeckId) return;
    let cancelled = false;
    fetch(apiUrl(`/api/decks/${encodeURIComponent(activeDeckId)}/view`))
      .then((response) => response.ok ? response.json() : null)
      .then((view) => {
        if (!view || cancelled) return;
        setServerDeckView(view);
        setDecks((current) =>
          current.map((deck) => deck.id === view.deck.id ? view.deck : deck)
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeDeckId]);

  useEffect(() => {
    let cancelled = false;

    fetch(apiUrl('/api/me'))
      .then((response) => {
        if (!response.ok) throw new Error(`Auth API returned ${response.status}`);
        return response.json();
      })
      .then(({ user: currentUser }) => {
        if (cancelled) return;
        setUser(currentUser);
        if (!currentUser) return;

        return fetch(apiUrl('/api/decks'))
          .then((response) => {
            if (!response.ok) throw new Error(`Deck API returned ${response.status}`);
            return response.json();
          })
          .then((serverDecks) => {
            if (cancelled) return;
            if (Array.isArray(serverDecks) && serverDecks.length > 0) {
              setDecks(serverDecks);
              setActiveDeckId((currentId) =>
                serverDecks.some((deck) => deck.id === currentId)
                  ? currentId
                  : serverDecks[0].id
              );
            }
          });
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn('Authentication API unavailable; using local browser storage:', error);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setAuthLoading(false);
          setPersistenceReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const activeDeck = useMemo(
    () => decks.find((d) => d.id === activeDeckId) || decks[0] || {
      id: '',
      name: 'Loading deck...',
      format: 'commander',
      entries: []
    },
    [decks, activeDeckId]
  );

  const [fanIndex, setFanIndex] = useState(0);
  const [showSeparatedStacks, setShowSeparatedStacks] = useState(false);
  const [miniFanIndices, setMiniFanIndices] = useState({});
  const [miniTouchStart, setMiniTouchStart] = useState(null);

  const fanEntries = useMemo(
    () => activeDeck?.entries?.filter(({ zone }) => zone !== 'sideboard') || [],
    [activeDeck]
  );

  useEffect(() => {
    setFanIndex(0);
    setMiniFanIndices({});
  }, [activeDeckId]);

  const cardTypeStacks = useMemo(() => {
    const stackMap = new Map();

    fanEntries.forEach((entry) => {
      let label = getPrimaryCategory(entry.card?.type_line);
      if (entry.zone === 'commander') label = 'Commander';

      if (!stackMap.has(label)) {
        stackMap.set(label, []);
      }
      stackMap.get(label).push(entry);
    });

    return [...stackMap.entries()]
      .map(([label, entries]) => ({
        label,
        entries,
        count: entries.reduce((sum, entry) => sum + (entry.quantity || 1), 0)
      }))
      .sort((a, b) => b.count - a.count);
  }, [fanEntries]);

  useEffect(() => {
    if (!fanEntries.length) return;
    const currentEntry = fanEntries[fanIndex];
    if (currentEntry?.card) {
      setInspectedCard(currentEntry.card);
    }
  }, [fanIndex, fanEntries]);

  useEffect(() => {
    if (!deckListScrollRef.current || !fanEntries[fanIndex]) return;
    const activeEntry = fanEntries[fanIndex];
    const activeRow = deckListScrollRef.current.querySelector(
      `[data-deck-card-id="${activeEntry.card.id}"]`
    );
    activeRow?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [fanIndex, fanEntries]);

  // --- Card Search & Scryfall API State ---
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedColors, setSelectedColors] = useState([]);
  const [selectedType, setSelectedType] = useState('All');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchSource, setSearchSource] = useState('Starter Cache (Ready)');
  const [cardFaceMap, setCardFaceMap] = useState({}); // cardId -> 0 | 1 for double-faced cards
  const [showCardBrowser, setShowCardBrowser] = useState(false);
  const [showInspector, setShowInspector] = useState(false);
  const [touchStart, setTouchStart] = useState(null);
  const deckListScrollRef = useRef(null);
  const [panelWidths, setPanelWidths] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('arcane-panel-widths') || '{}');
      return {
        left: typeof saved.left === 'number' ? saved.left : 350,
        right: typeof saved.right === 'number' ? saved.right : 350
      };
    } catch {
      return { left: 350, right: 350 };
    }
  });

  // --- Inspector & Workspace UI State ---
  const [inspectedCard, setInspectedCard] = useState(null);
  const [rightTab, setRightTab] = useState('analytics'); // 'analytics' | 'rules' | 'inspector'
  const [toast, setToast] = useState(null);

  // --- Modals State ---
  const [showPlaytestModal, setShowPlaytestModal] = useState(false);
  const [showImportExportModal, setShowImportExportModal] = useState(false);
  const [showArchitectureModal, setShowArchitectureModal] = useState(false);
  const [showRulesPopup, setShowRulesPopup] = useState(false);
  const [showNewDeckModal, setShowNewDeckModal] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');
  const [newDeckFormat, setNewDeckFormat] = useState('commander');

  // --- Playtest / Opening Hand Simulator State ---
  const [playtestLibrary, setPlaytestLibrary] = useState([]);
  const [playtestHand, setPlaytestHand] = useState([]);
  const [mulliganCount, setMulliganCount] = useState(0);

  // --- Import/Export State ---
  const [importText, setImportText] = useState('');
  const [copiedExport, setCopiedExport] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Show temporary notification toast
  const triggerToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
  }, []);

  const resizePanel = useCallback((side, clientX) => {
    const viewportWidth = window.innerWidth;
    setPanelWidths((current) => {
      const next =
        side === 'left'
          ? Math.max(240, Math.min(500, clientX))
          : Math.max(240, Math.min(500, viewportWidth - clientX));
      const updated = { ...current, [side]: next };
      localStorage.setItem('arcane-panel-widths', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const repairCardImage = useCallback(async (card, event, faceIndex = 0) => {
    const imageElement = event.currentTarget;
    imageElement.src = FALLBACK_CARD_IMAGE;

    try {
      const response = await fetch(
        apiUrl(`/api/cards/named?name=${encodeURIComponent(card.name)}`)
      );
      if (!response.ok) throw new Error(`Scryfall image lookup failed: ${response.status}`);

      const repairedCard = await response.json();
      const repairedImage =
        repairedCard.card_faces?.[faceIndex]?.image_uris?.normal ||
        repairedCard.image_uris?.normal ||
        repairedCard.card_faces?.[0]?.image_uris?.normal;

      if (!repairedImage) throw new Error(`No image returned for ${card.name}`);
      imageElement.src = repairedImage;
    } catch (error) {
      console.error(`Failed to repair image for ${card.name}:`, error);
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  // --- Live Scryfall Search Effect ---
  useEffect(() => {
    const trimmed = searchQuery.trim();
    const hasFilters = selectedColors.length > 0 || selectedType !== 'All';

    // If no query and no filters, show preloaded iconic cards immediately
    if (!trimmed && !hasFilters) {
      setSearchResults(PRELOADED_CARDS);
      setSearchSource('Local Cache (29 Iconic Cards)');
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsSearching(true);

      // Build Scryfall syntax query
      const queryParts = ['game:paper'];
      if (trimmed) queryParts.push(trimmed);
      if (selectedType !== 'All') queryParts.push(`t:${selectedType.toLowerCase()}`);
      if (selectedColors.length > 0) {
        const colorStr = selectedColors.filter((c) => c !== 'C').join('');
        if (selectedColors.includes('C') && !colorStr) {
          queryParts.push('id:c');
        } else if (colorStr) {
          queryParts.push(`id>=${colorStr}`);
        }
      }

      try {
        const res = await fetch(
          apiUrl(`/api/cards/search?q=${encodeURIComponent(queryParts.join(' '))}`),
          { signal: controller.signal }
        );
        if (!res.ok) {
          if (res.status === 404) {
            setSearchResults([]);
            setSearchSource('Scryfall API (0 results)');
            setIsSearching(false);
            return;
          }
          if (res.status === 429) {
            setSearchResults([]);
            setSearchSource('Scryfall rate limit reached');
            setIsSearching(false);
            return;
          }
          throw new Error(`Scryfall status ${res.status}`);
        }
        const data = await res.json();
        setSearchResults((data.data || []).slice(0, 36));
        setSearchSource(`Live Scryfall API (${data.total_cards || 0} matches)`);
      } catch (err) {
        if (err.name === 'AbortError') return;
        setSearchResults([]);
        setSearchSource('Card API unavailable');
      } finally {
        setIsSearching(false);
      }
    }, 380);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery, selectedColors, selectedType]);

  // --- Deck Manipulation Actions ---
  const addCardToDeck = useCallback(
    (card, zone = 'mainboard') => {
      setInspectedCard(card);
      setShowInspector(true);
      fetch(apiUrl(`/api/decks/${encodeURIComponent(activeDeck.id)}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add-card', card, zone })
      })
        .then((response) => response.ok ? response.json() : null)
        .then((view) => {
          if (!view) return;
          setServerDeckView(view);
          setDecks((current) =>
            current.map((deck) => deck.id === view.deck.id ? view.deck : deck)
          );
        });

      triggerToast(
        zone === 'commander'
          ? `Set ${card.name} as your Commander!`
          : `Added 1x ${card.name} to ${zone === 'sideboard' ? 'Sideboard' : 'Mainboard'}`
      );
    },
    [activeDeck.id, triggerToast]
  );

  const changeCardQuantity = useCallback(
    (cardName, zone, delta) => {
      fetch(apiUrl(`/api/decks/${encodeURIComponent(activeDeck.id)}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'change-quantity', cardName, zone, delta })
      })
        .then((response) => response.ok ? response.json() : null)
        .then((view) => {
          if (!view) return;
          setServerDeckView(view);
          setDecks((current) =>
            current.map((deck) => deck.id === view.deck.id ? view.deck : deck)
          );
        });
    },
    [activeDeck.id]
  );

  const moveCardZone = useCallback(
    (card, fromZone, toZone) => {
      fetch(apiUrl(`/api/decks/${encodeURIComponent(activeDeck.id)}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'move-card', cardName: card.name, fromZone, toZone })
      })
        .then((response) => response.ok ? response.json() : null)
        .then((view) => {
          if (!view) return;
          setServerDeckView(view);
          setDecks((current) =>
            current.map((deck) => deck.id === view.deck.id ? view.deck : deck)
          );
        });
      triggerToast(`Moved ${card.name} to ${toZone}`);
    },
    [activeDeck.id, triggerToast]
  );

  const handleFormatChange = (newFormat) => {
    fetch(apiUrl(`/api/decks/${encodeURIComponent(activeDeck.id)}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set-format', format: newFormat })
    })
      .then((response) => response.ok ? response.json() : null)
      .then((view) => {
        if (!view) return;
        setServerDeckView(view);
        setDecks((current) =>
          current.map((deck) => deck.id === view.deck.id ? view.deck : deck)
        );
      });
    triggerToast(`Format switched to ${newFormat.toUpperCase()} — rules re-validated!`);
  };

  const handleCreateDeck = (e) => {
    e.preventDefault();
    fetch(apiUrl('/api/decks'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newDeckName.trim() || 'Untitled Arcane Brew',
        format: newDeckFormat,
        entries: []
      })
    })
      .then((response) => response.ok ? response.json() : null)
      .then((created) => {
        if (!created) return;
        setDecks((current) => [...current, created]);
        setActiveDeckId(created.id);
        setNewDeckName('');
        setShowNewDeckModal(false);
        triggerToast(`Created new ${created.format.toUpperCase()} deck "${created.name}"`);
      });
  };

  const handleResetDemoDecks = () => {
    fetch(apiUrl('/api/decks/demo/reset'), { method: 'POST' })
      .then((response) => response.ok ? response.json() : null)
      .then((result) => {
        if (!result) return;
        setDecks(result.decks);
        setActiveDeckId(result.decks[0]?.id);
        triggerToast('Reset all starter decks to factory defaults!');
      });
  };

  // Inject an intentional rule violation (Demonic Tutor in Izzet Commander) for live demo grading!
  const handleInjectDemoViolation = () => {
    const tutor = CARD_MAP['Demonic Tutor'];
    addCardToDeck(tutor, 'mainboard');
    setRightTab('rules');
    triggerToast('Added Demonic Tutor (Black) to demonstrate live Color Identity & Banlist validation!', 'warn');
  };

  // Validation and analytics are server-owned.
  const validation = serverDeckView?.validation || {
    overall: 'incomplete',
    checks: [],
    counts: { commanderCount: 0, mainCount: 0, sideCount: 0, totalMainAndCommander: 0 }
  };
  const analytics = serverDeckView?.analytics || {
    curveBins: [
      { cmc: '0', count: 0 }, { cmc: '1', count: 0 }, { cmc: '2', count: 0 },
      { cmc: '3', count: 0 }, { cmc: '4', count: 0 }, { cmc: '5', count: 0 },
      { cmc: '6+', count: 0 }
    ],
    colorPieData: [],
    typeCounts: {},
    totalEur: '0.00',
    totalUsd: '0.00',
    avgCmc: '0.00'
  };

  // Group active deck entries into clean visual sections
  const groupedSections = useMemo(() => {
    const groups = {
      Commander: [],
      Creatures: [],
      Planeswalkers: [],
      'Instants & Sorceries': [],
      'Artifacts & Enchantments': [],
      Lands: [],
      Sideboard: []
    };

    activeDeck.entries.forEach((entry) => {
      if (entry.zone === 'commander') {
        groups.Commander.push(entry);
      } else if (entry.zone === 'sideboard') {
        groups.Sideboard.push(entry);
      } else {
        const cat = getPrimaryCategory(entry.card.type_line);
        if (groups[cat]) groups[cat].push(entry);
        else groups['Artifacts & Enchantments'].push(entry);
      }
    });

    return Object.entries(groups).filter(([key, list]) => {
      if (key === 'Commander' && activeDeck.format !== 'commander') return false;
      return list.length > 0 || key === 'Commander';
    });
  }, [activeDeck]);

  // --- Opening Hand Playtest Simulator Functions ---
  const startNewOpeningHand = useCallback(
    async (mulligans = 0) => {
      const response = await fetch(apiUrl(`/api/decks/${encodeURIComponent(activeDeck.id)}/playtest`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mulligans })
      });
      if (!response.ok) return;
      const result = await response.json();
      setPlaytestHand(result.hand);
      setPlaytestLibrary(result.library);
      setMulliganCount(result.mulliganCount);
    },
    [activeDeck.entries]
  );

  const drawOnePlaytestCard = () => {
    if (playtestLibrary.length === 0) return;
    const [nextCard, ...rest] = playtestLibrary;
    setPlaytestHand((prev) => [...prev, nextCard]);
    setPlaytestLibrary(rest);
  };

  // --- MTG Arena Text Export & Import ---
  const exportedArenaText = serverDeckView?.arenaExport || '';

  const handleCopyExport = () => {
    navigator.clipboard.writeText(exportedArenaText);
    setCopiedExport(true);
    setTimeout(() => setCopiedExport(false), 2000);
    triggerToast('Decklist copied to clipboard in MTG Arena format!');
  };

  const handleImportDeckText = async () => {
    if (!importText.trim()) return;
    setIsImporting(true);
    try {
      const response = await fetch(apiUrl(`/api/decks/${encodeURIComponent(activeDeck.id)}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import-arena', text: importText })
      });
      if (!response.ok) throw new Error('Import failed');
      const view = await response.json();
      setServerDeckView(view);
      setDecks((current) =>
        current.map((deck) => deck.id === view.deck.id ? view.deck : deck)
      );
      setShowImportExportModal(false);
      setImportText('');
      triggerToast(`Imported deck text into ${activeDeck.name}!`);
    } catch {
      triggerToast('Could not import the deck text.', 'warn');
    } finally {
      setIsImporting(false);
    }
  };

  // Toggle color filter button
  const toggleColorFilter = (code) => {
    setSelectedColors((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const toggleCardFlip = (cardId, e) => {
    if (e) e.stopPropagation();
    setCardFaceMap((prev) => ({
      ...prev,
      [cardId]: prev[cardId] === 1 ? 0 : 1
    }));
  };

  return (
    <div className="app-shell min-h-screen text-slate-100 flex flex-col font-sans selection:bg-amber-500/30 selection:text-amber-200">
      {/* ================================================================== */}
      {/* TOP NAVIGATION BAR                                                 */}
      {/* ================================================================== */}
      <header className="app-header sticky top-0 z-30 px-4 py-2.5">
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-3 min-w-0">
          {/* Minimal brand */}
          <div className="flex items-center gap-3">
            <div className="brand-mark w-9 h-9 rounded-full flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <h1 className="brand-name text-base font-bold tracking-tight">
              ArcaneForge
            </h1>
          </div>

          {/* Deck actions */}
          <div className="flex flex-wrap items-center justify-end gap-2 min-w-0">
            <button
              onClick={() => setShowCardBrowser((current) => !current)}
              className={`app-icon-button ${showCardBrowser ? 'is-active' : ''}`}
              title="Browse cards"
            >
              <Search className="w-4 h-4" />
              <span className="hidden sm:inline">Cards</span>
            </button>
            <button
              onClick={() => setShowInspector((current) => !current)}
              className={`app-icon-button ${showInspector ? 'is-active' : ''}`}
              title="Inspect card"
            >
              <Eye className="w-4 h-4" />
            </button>
            <div className="deck-selector flex items-center rounded-lg p-1 min-w-0">
              <Layers className="w-4 h-4 ml-2 mr-1.5 shrink-0" />
              <select
                value={activeDeck.id}
                onChange={(e) => setActiveDeckId(e.target.value)}
                className="bg-transparent text-sm font-semibold pr-5 py-1.5 focus:outline-none cursor-pointer max-w-[16rem] truncate"
                aria-label="Select Active Deck"
              >
                {decks.map((d) => (
                  <option key={d.id} value={d.id} className="bg-slate-900 text-slate-100">
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => setShowNewDeckModal(true)}
              className="app-icon-button"
              title="New Deck"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden md:inline">New</span>
            </button>

            <button
              onClick={() => {
                startNewOpeningHand(0);
                setShowPlaytestModal(true);
              }}
              className="app-icon-button"
              title="Test Hand"
            >
              <Shuffle className="w-4 h-4" />
              <span className="hidden md:inline">Test</span>
            </button>

            <button
              type="button"
              onClick={() => setShowSeparatedStacks((current) => !current)}
              className={`app-icon-button ${showSeparatedStacks ? 'is-active' : ''}`}
              title={showSeparatedStacks ? 'Show one card stack' : 'Arrange cards by type'}
              aria-pressed={showSeparatedStacks}
            >
              <LayoutGrid className="w-4 h-4" />
              <span className="hidden md:inline">
                {showSeparatedStacks ? 'Single stack' : 'Stacks'}
              </span>
            </button>

            <button
              onClick={() => setShowImportExportModal(true)}
              className="app-icon-button"
              title="Import / Export"
            >
              <ArrowRightLeft className="w-4 h-4" />
            </button>

            {authLoading ? null : user ? (
              <div className="inline-flex items-center gap-2">
                {user.avatar_url && (
                  <img src={user.avatar_url} alt="" className="w-7 h-7 rounded-full" />
                )}
                <button
                  onClick={async () => {
                    await fetch(apiUrl('/api/auth/logout'), { method: 'POST' });
                    setUser(null);
                    setPersistenceReady(false);
                    triggerToast('Signed out.');
                  }}
                  className="app-icon-button"
                  title="Sign out"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="inline-flex items-center gap-1">
                <a
                  href={apiUrl('/api/auth/github')}
                  className="inline-flex items-center justify-center px-2.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700"
                >
                  GitHub
                </a>
                <a
                  href={apiUrl('/api/auth/google')}
                  className="inline-flex items-center justify-center px-2.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap bg-amber-500 hover:bg-amber-400 text-slate-950"
                >
                  Google
                </a>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ================================================================== */}
      {/* FLOATING TOAST NOTIFICATION                                        */}
      {/* ================================================================== */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm animate-bounce">
          <div
            className={`flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-2xl border backdrop-blur-md text-xs font-semibold ${
              toast.type === 'warn'
                ? 'bg-amber-950/95 border-amber-500/50 text-amber-200'
                : 'bg-slate-900/95 border-emerald-500/40 text-emerald-200'
            }`}
          >
            {toast.type === 'warn' ? (
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* MAIN 3-COLUMN WORKSPACE                                            */}
      {/* ================================================================== */}
      <main
        className="game-workspace flex-1 w-full mx-auto p-4 min-w-0"
        style={{
          '--left-panel-width': `${showCardBrowser ? panelWidths.left : 0}px`,
          '--right-panel-width': `${showInspector ? panelWidths.right : 0}px`
        }}
      >
        {/* ---------------------------------------------------------------- */}
        {/* LEFT COLUMN (3 cols): LIVE SCRYFALL CARD SEARCH & FILTERS        */}
        {/* ---------------------------------------------------------------- */}
        <section className={`card-browser ${showCardBrowser ? 'is-open' : ''}`}>
          <button
            type="button"
            className="panel-resize-handle panel-resize-handle-right"
            onMouseDown={(event) => {
              event.preventDefault();
              const move = (moveEvent) =>
                resizePanel('left', moveEvent.clientX);
              const up = () => {
                window.removeEventListener('mousemove', move);
                window.removeEventListener('mouseup', up);
              };
              window.addEventListener('mousemove', move);
              window.addEventListener('mouseup', up);
            }}
            aria-label="Resize card browser"
          />
          <div className="p-3.5 border-b border-slate-800 space-y-3 bg-slate-900/90 min-w-0">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5 min-w-0">
                <Search className="w-3.5 h-3.5 text-amber-400" />
                Scryfall Card Database
              </span>
              <span className="text-[10px] text-slate-400 font-medium px-2 py-0.5 rounded bg-slate-800 shrink-0 max-w-[9rem] truncate">
                {isSearching ? 'Querying API...' : searchSource}
              </span>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search cards (e.g. Niv-Mizzet, Counterspell, Dragon)..."
                className="w-full bg-slate-950 border border-slate-700/80 focus:border-amber-400 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* WUBRG Mana Color Filters */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] text-slate-400 font-medium">Mana Color Identity</span>
                {selectedColors.length > 0 && (
                  <button
                    onClick={() => setSelectedColors([])}
                    className="text-[10px] text-amber-400 hover:underline"
                  >
                    Clear colors
                  </button>
                )}
              </div>
              <div className="grid grid-cols-6 gap-1.5">
                {MANA_COLORS.map((mc) => {
                  const active = selectedColors.includes(mc.code);
                  return (
                    <button
                      key={mc.code}
                      onClick={() => toggleColorFilter(mc.code)}
                      title={`Filter by ${mc.name} (${mc.code})`}
                      className={`py-1.5 rounded-lg font-extrabold text-xs border transition flex items-center justify-center gap-1 ${
                        active
                          ? 'bg-amber-500/20 border-amber-400 text-amber-200 shadow-sm shadow-amber-500/20 scale-105'
                          : 'bg-slate-950/90 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <span
                        className={`w-4 h-4 rounded-full inline-flex items-center justify-center text-[10px] border ${mc.bg} ${mc.text} ${mc.border}`}
                      >
                        {mc.code}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Card Type Filter Pills */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar">
              {CARD_TYPES.map((type) => (
                <button
                  key={type}
                  onClick={() => setSelectedType(type)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition ${
                    selectedType === type
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Scrollable Card Results List */}
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5">
            {searchResults.length === 0 ? (
              <div className="text-center py-12 px-4 text-slate-400 space-y-2">
                <Search className="w-8 h-8 mx-auto text-slate-600" />
                <p className="text-sm font-semibold text-slate-300">No Magic cards matched</p>
                <p className="text-xs text-slate-500">
                  Try searching for a card name like &ldquo;Sol Ring&rdquo;, &ldquo;Atraxa&rdquo;, or clear active color filters.
                </p>
              </div>
            ) : (
              searchResults.map((card) => {
                const faceIdx = cardFaceMap[card.id] || 0;
                const imgUrl = getCardImage(card, faceIdx);
                const canFlip = isDoubleFaced(card);
                const isLegendary =
                  (card.type_line || '').includes('Legendary') &&
                  ((card.type_line || '').includes('Creature') ||
                    (card.oracle_text || '').includes('can be your commander'));

                return (
                  <div
                    key={card.id}
                    onClick={() => {
                      setInspectedCard(card);
                      setShowInspector(true);
                    }}
                    className={`group flex gap-3 p-2 rounded-xl border transition cursor-pointer ${
                      inspectedCard?.id === card.id
                        ? 'bg-slate-800/90 border-amber-500/50'
                        : 'bg-slate-950/60 hover:bg-slate-900 border-slate-800/80'
                    }`}
                  >
                    {/* Card Thumbnail */}
                    <div className="relative w-14 h-20 rounded-lg overflow-hidden bg-slate-900 shrink-0 border border-slate-700/60">
                      <img
                        src={imgUrl}
                        alt={card.name}
                        loading="lazy"
                        onError={(e) => repairCardImage(card, e, faceIdx)}
                        className="w-full h-full object-cover object-top group-hover:scale-105 transition duration-300"
                      />
                      {canFlip && (
                        <button
                          onClick={(e) => toggleCardFlip(card.id, e)}
                          title="Flip Double-Faced Card"
                          className="absolute bottom-1 right-1 p-1 rounded-full bg-slate-950/85 text-amber-300 hover:bg-amber-500 hover:text-slate-950 transition"
                        >
                          <RefreshCw className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {/* Card Details & Quick-Add Buttons */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between gap-1">
                          <h4 className="text-xs font-bold text-slate-100 truncate">
                            {card.name}
                          </h4>
                          <ManaCostBadges
                            manaCost={
                              card.mana_cost || card.card_faces?.[faceIdx]?.mana_cost
                            }
                            size="sm"
                          />
                        </div>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">
                          {card.type_line}
                        </p>
                      </div>

                      <div className="flex items-center justify-between gap-1 mt-2">
                        <span className="text-[11px] font-semibold text-emerald-400">
                          {card.prices?.eur
                            ? `€${card.prices.eur}`
                            : card.prices?.usd
                            ? `$${card.prices.usd}`
                            : '—'}
                        </span>

                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => addCardToDeck(card, 'mainboard')}
                            className="inline-flex w-[68px] h-[26px] items-center justify-center whitespace-nowrap shrink-0 px-1 leading-none rounded-md bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 text-[10px] font-bold border border-amber-500/30 transition"
                            title="Add to Mainboard"
                          >
                            + Main
                          </button>

                          {activeDeck.format === 'commander' && isLegendary ? (
                            <button
                              onClick={() => addCardToDeck(card, 'commander')}
                              className="inline-flex w-[62px] h-[26px] items-center justify-center whitespace-nowrap shrink-0 px-1 leading-none rounded-md bg-violet-500/20 hover:bg-violet-500 text-violet-300 hover:text-white text-[10px] font-bold border border-violet-500/30 transition"
                              title="Set as Deck Commander"
                            >
                              <Crown className="w-3 h-3" />
                              Cmdr
                            </button>
                          ) : (
                            <button
                              onClick={() => addCardToDeck(card, 'sideboard')}
                              className="px-1.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold border border-slate-700 transition"
                              title="Add to Sideboard"
                            >
                              + Side
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* CENTER WORKSPACE (6 cols): DECK HEADER, STATUS & VISUAL STACKS   */}
        {/* ---------------------------------------------------------------- */}
        <section className="game-table min-w-0 flex flex-col gap-4">
          {/* Deck Header Card */}
          <div className="deck-header-card bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 border border-slate-800 rounded-2xl p-4 shadow-xl">
            <div className="deck-header-row flex flex-wrap items-start justify-between gap-3">
              <div className="deck-name-block space-y-1 flex-1 min-w-[220px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="text"
                    value={activeDeck.name}
                    onChange={(e) =>
                       setDecks((current) =>
                         current.map((deck) =>
                           deck.id === activeDeck.id ? { ...deck, name: e.target.value } : deck
                         )
                       )
                    }
                    onBlur={(e) => {
                       if (!activeDeck.id) return;
                       fetch(apiUrl(`/api/decks/${encodeURIComponent(activeDeck.id)}`), {
                         method: 'PATCH',
                         headers: { 'Content-Type': 'application/json' },
                         body: JSON.stringify({ action: 'set-name', name: e.target.value })
                       });
                    }}
                    className="bg-transparent text-lg sm:text-xl font-extrabold text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-400/50 rounded px-1 -ml-1"
                    aria-label="Deck Name"
                  />
                </div>
              </div>

              {/* Format Selector & View Mode Toggle */}
              <div className="deck-header-controls flex items-center gap-2 flex-wrap">
                <div className="format-selector inline-flex rounded-xl bg-slate-950 p-1 border border-slate-800">
                  {['commander', 'modern', 'standard'].map((fmt) => (
                    <button
                      key={fmt}
                      onClick={() => handleFormatChange(fmt)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wide transition ${
                        activeDeck.format === fmt
                          ? 'bg-amber-500 text-slate-950 shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>

              </div>
            </div>

            {/* Live KPI Strip + Legality Status Banner */}
            <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
              {/* Legality Badge */}
              <button
                onClick={() => setShowRulesPopup((open) => !open)}
                aria-expanded={showRulesPopup}
                className={`deck-rule-status inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                  validation.overall === 'legal'
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : validation.overall === 'incomplete'
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                    : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                }`}
              >
                {validation.overall === 'legal' ? (
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                ) : (
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                )}
                <span>
                  {validation.overall === 'legal'
                    ? `${activeDeck.format.toUpperCase()} LEGAL`
                    : validation.overall === 'incomplete'
                    ? 'DECK INCOMPLETE'
                    : 'RULE VIOLATION DETECTED'}
                </span>
                <ChevronRight className="w-3.5 h-3.5 opacity-70" />
              </button>

              {/* Key Deck Stats */}
              <div className="flex items-center gap-4 text-xs flex-wrap">
                <div>
                  <span className="text-slate-400">Mainboard: </span>
                  <span className="font-extrabold text-slate-100">
                    {activeDeck.format === 'commander'
                      ? `${validation.counts.totalMainAndCommander} / 100`
                      : `${validation.counts.mainCount} / 60`}
                  </span>
                </div>

                {activeDeck.format !== 'commander' && (
                  <div>
                    <span className="text-slate-400">Sideboard: </span>
                    <span className="font-extrabold text-slate-100">
                      {validation.counts.sideCount} / 15
                    </span>
                  </div>
                )}

                <div>
                  <span className="text-slate-400">Avg CMC: </span>
                  <span className="font-extrabold text-amber-300">{analytics.avgCmc}</span>
                </div>

                <div className="flex items-center gap-2 bg-slate-950/90 px-2.5 py-1 rounded-lg border border-slate-800">
                  <span className="text-emerald-400 font-bold">€{analytics.totalEur}</span>
                  <span className="text-slate-600">|</span>
                  <span className="text-sky-400 font-bold">${analytics.totalUsd}</span>
                </div>

                {activeDeck.format === 'commander' && (
                  <button
                    onClick={handleInjectDemoViolation}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition"
                    title="Inject an off-color Black card (Demonic Tutor) to test the live Rules Engine!"
                  >
                    Test Rule Alert
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Whole-deck analytics */}
          <div className="deck-analytics" aria-label="Deck analytics">
            <div className="deck-analytics-section deck-analytics-curve">
              <span className="deck-analytics-label">Mana curve</span>
              <div className="mini-curve" aria-label={`Average CMC ${analytics.avgCmc}`}>
                {analytics.curveBins.map((bin) => {
                  const maxCount = Math.max(
                    1,
                    ...analytics.curveBins.map((item) => item.count)
                  );
                  return (
                    <div className="mini-curve-column" key={bin.cmc}>
                      <span
                        className="mini-curve-bar"
                        style={{ height: `${Math.max(6, (bin.count / maxCount) * 72)}px` }}
                      />
                      <span className="mini-curve-label">{bin.cmc}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mini-curve-average" aria-label="Average mana value">
                <span>AVG</span>
                <strong>{analytics.avgCmc}</strong>
              </div>
            </div>

            <div className="deck-analytics-section deck-analytics-colors">
              <span className="deck-analytics-label">Identity</span>
              <div className="mini-colors">
                {analytics.colorPieData.map((item) => (
                  <div
                    className="mini-color"
                    key={item.code}
                    title={`${item.name}: ${item.value}`}
                  >
                    <span
                      className="mini-color-dot"
                      style={{ backgroundColor: item.color }}
                    />
                    <span>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="deck-analytics-section deck-analytics-types">
              <span className="deck-analytics-label">Types</span>
              <div className="mini-types">
                {Object.entries(analytics.typeCounts).map(([type, count]) => (
                  <div className="mini-type" key={type}>
                    <span>{type}</span>
                    <strong>{count}</strong>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {showRulesPopup && (
            <div
              className="rules-popup"
              role="dialog"
              aria-label="Rules validation"
              ref={(popup) => {
                if (!popup || window.innerWidth <= 800) return;
                const anchor = document.querySelector('.deck-rule-status');
                if (!anchor) return;
                const rect = anchor.getBoundingClientRect();
                const width = Math.min(420, window.innerWidth - 24);
                const left = Math.max(
                  12,
                  Math.min(rect.right - width, window.innerWidth - width - 12)
                );
                const desiredTop = rect.bottom + 8;
                const height = Math.min(
                  360,
                  Math.max(180, window.innerHeight - desiredTop - 12)
                );
                popup.style.left = `${left}px`;
                popup.style.right = 'auto';
                popup.style.top = `${desiredTop}px`;
                popup.style.bottom = 'auto';
                popup.style.width = `${width}px`;
                popup.style.height = `${height}px`;
                popup.style.maxHeight = `${height}px`;
                popup.style.transform = 'none';
              }}
            >
              <div className="rules-popup-header">
                <strong>{activeDeck.format.toUpperCase()} Rules</strong>
                <button
                  type="button"
                  onClick={() => setShowRulesPopup(false)}
                  aria-label="Close rules"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <div className="rules-popup-list">
                {validation.checks.map((check) => (
                  <div className={`rules-popup-row is-${check.status}`} key={check.id}>
                    <span className="rules-popup-icon" aria-hidden="true">
                      {check.status === 'pass'
                        ? '✅'
                        : check.status === 'warn'
                        ? '🟡'
                        : '❌'}
                    </span>
                    <div>
                      <strong>{check.title}</strong>
                      <p>{check.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Card stack */}
          <div
              className={`card-fan ${showSeparatedStacks ? 'is-separated' : ''}`}
              aria-label="Cards in the deck"
              onTouchStart={(event) => {
                const touch = event.touches[0];
                setTouchStart({ x: touch.clientX, y: touch.clientY });
              }}
              onTouchEnd={(event) => {
                if (showSeparatedStacks) return;
                if (!touchStart || !fanEntries.length) return;
                const touch = event.changedTouches[0];
                const deltaX = touch.clientX - touchStart.x;
                const deltaY = touch.clientY - touchStart.y;
                setTouchStart(null);

                if (Math.abs(deltaX) < 38 && Math.abs(deltaY) < 38) return;

                if (Math.abs(deltaX) >= Math.abs(deltaY)) {
                  setFanIndex((current) =>
                    deltaX < 0
                      ? (current + 1) % fanEntries.length
                      : (current - 1 + fanEntries.length) % fanEntries.length
                  );
                } else {
                  setFanIndex((current) =>
                    deltaY < 0
                      ? (current + 1) % fanEntries.length
                      : (current - 1 + fanEntries.length) % fanEntries.length
                  );
                }
              }}
              onWheel={(event) => {
                if (showSeparatedStacks) return;
                if (!fanEntries.length) return;
                if (Math.abs(event.deltaY) < 8) return;
                setFanIndex((current) =>
                  event.deltaY > 0
                    ? (current + 1) % fanEntries.length
                    : (current - 1 + fanEntries.length) % fanEntries.length
                );
              }}
            >
              {showSeparatedStacks ? (
                cardTypeStacks.length > 0 ? (
                  <div className="card-stack-groups" aria-label="Cards arranged by type">
                    {cardTypeStacks.map((stack, stackIndex) => (
                      <section
                        className="card-type-stack"
                        key={stack.label}
                        style={{ '--stack-index': stackIndex }}
                        aria-label={`${stack.label}, ${stack.count} cards`}
                        onWheel={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          if (stack.entries.length < 2 || Math.abs(event.deltaY) < 8) return;
                          const miniIndex = miniFanIndices[stack.label] || 0;
                          const nextIndex = event.deltaY > 0
                            ? (miniIndex + 1) % stack.entries.length
                            : (miniIndex - 1 + stack.entries.length) % stack.entries.length;
                          setMiniFanIndices((current) => ({
                            ...current,
                            [stack.label]: nextIndex
                          }));
                          setInspectedCard(stack.entries[nextIndex].card);
                        }}
                        onTouchStart={(event) => {
                          const touch = event.touches[0];
                          setMiniTouchStart({ x: touch.clientX, y: touch.clientY, label: stack.label });
                        }}
                        onTouchEnd={(event) => {
                          if (!miniTouchStart || miniTouchStart.label !== stack.label) return;
                          const touch = event.changedTouches[0];
                          const deltaX = touch.clientX - miniTouchStart.x;
                          const deltaY = touch.clientY - miniTouchStart.y;
                          setMiniTouchStart(null);
                          if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 38) return;
                          const miniIndex = miniFanIndices[stack.label] || 0;
                          const forward = Math.abs(deltaX) >= Math.abs(deltaY)
                            ? deltaX < 0
                            : deltaY < 0;
                          const nextIndex = forward
                            ? (miniIndex + 1) % stack.entries.length
                            : (miniIndex - 1 + stack.entries.length) % stack.entries.length;
                          setMiniFanIndices((current) => ({
                            ...current,
                            [stack.label]: nextIndex
                          }));
                          setInspectedCard(stack.entries[nextIndex].card);
                        }}
                      >
                        <div className="card-type-stack-header">
                          <span>{stack.label}</span>
                          <strong>{stack.count}</strong>
                        </div>
                        <div className="card-type-stack-cards">
                          {stack.entries.map((entry, entryIndex) => {
                            const miniIndex = miniFanIndices[stack.label] || 0;
                            const offset = (
                              entryIndex - miniIndex + stack.entries.length
                            ) % stack.entries.length;
                            if (offset > 3) return null;

                            return (
                              <button
                                type="button"
                                className={`separated-card ${
                                  offset === 0 ? 'is-selected' : ''
                                }`}
                                key={`${entry.zone}-${entry.card.id}-${entry.card.name}`}
                                style={{ '--card-index': offset, zIndex: 10 - offset }}
                                onClick={() => {
                                  setMiniFanIndices((current) => ({
                                    ...current,
                                    [stack.label]: entryIndex
                                  }));
                                  setFanIndex(
                                    Math.max(0, fanEntries.findIndex(
                                      (item) =>
                                        item.card.id === entry.card.id &&
                                        item.card.name === entry.card.name
                                    ))
                                  );
                                  setInspectedCard(entry.card);
                                  setShowInspector(true);
                                }}
                                title={`${entry.card.name} — ${entry.quantity}×`}
                              >
                                <img
                                  src={getCardImage(entry.card, cardFaceMap[entry.card.id] || 0)}
                                  alt={entry.card.name}
                                  onError={(event) =>
                                    repairCardImage(entry.card, event, cardFaceMap[entry.card.id] || 0)
                                  }
                                />
                                {entry.quantity > 1 && (
                                  <span className="fan-card-count">{entry.quantity}</span>
                                )}
                              </button>
                            );
                          })}
                          <span className="mini-stack-status">
                            {(miniFanIndices[stack.label] || 0) + 1}/{stack.entries.length}
                          </span>
                        </div>
                      </section>
                    ))}
                  </div>
                ) : (
                  <div className="empty-table">No cards on the table</div>
                )
              ) : fanEntries.length > 0 ? (
                <>
                  {fanEntries.map(({ card, quantity, zone }, index) => {
                    const offset =
                      (index - fanIndex + fanEntries.length) % fanEntries.length;
                    const isVisible = offset <= 3;

                    if (!isVisible) return null;

                    return (
                      <button
                        key={`${zone}-${card.name}`}
                        type="button"
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = 'move';
                          event.dataTransfer.setData('text/plain', `${zone}:${card.name}`);
                        }}
                        onDragOver={(event) => {
                          event.preventDefault();
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          const source = event.dataTransfer
                            .getData('text/plain')
                            .split(':');
                          const sourceName = source.slice(1).join(':');
                          const sourceZone = source[0];
                          if (sourceName && sourceZone !== zone) {
                            moveCardZone(card, sourceZone, zone);
                          }
                          setFanIndex(index);
                        }}
                        className={`stack-card ${
                          offset === 0 ? 'is-current' : ''
                        }`}
                        style={{
                          '--card-offset': offset,
                          zIndex: 20 - offset,
                          transform: `translateX(${offset * 16}px) translateY(${offset * 16}px) rotate(${offset * 1.1}deg) scale(${offset === 0 ? 1 : 0.985 - offset * 0.012})`,
                        }}
                        onClick={() => {
                          setFanIndex(index);
                          setInspectedCard(card);
                          setShowInspector((open) =>
                            inspectedCard?.id === card.id ? !open : true
                          );
                        }}
                        title={`${card.name} — drag to reorder`}
                      >
                        <img
                          src={getCardImage(card, cardFaceMap[card.id] || 0)}
                          alt={card.name}
                          draggable="false"
                          onError={(e) =>
                            repairCardImage(card, e, cardFaceMap[card.id] || 0)
                          }
                        />
                        {quantity > 1 && (
                          <span className="fan-card-count">{quantity}</span>
                        )}
                        {zone === 'commander' && (
                          <span className="fan-card-zone">
                            <Crown className="w-3 h-3" />
                          </span>
                        )}
                      </button>
                    );
                  })}

                  <div className="stack-status">
                    <span>{fanIndex + 1}</span>
                    <span className="stack-status-divider" />
                    <span>{fanEntries.length}</span>
                  </div>
                </>
              ) : (
                <div className="empty-table">No cards on the table</div>
              )}
            </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* RIGHT PANEL (3 cols): CARD INSPECTOR, ANALYTICS & RULES CHECKLIST */}
        {/* ---------------------------------------------------------------- */}
        <aside className={`card-inspector ${showInspector ? 'is-open' : ''}`}>
          <button
            type="button"
            className="panel-resize-handle panel-resize-handle-left"
            onMouseDown={(event) => {
              event.preventDefault();
              const move = (moveEvent) =>
                resizePanel('right', moveEvent.clientX);
              const up = () => {
                window.removeEventListener('mousemove', move);
                window.removeEventListener('mouseup', up);
              };
              window.addEventListener('mousemove', move);
              window.addEventListener('mouseup', up);
            }}
            aria-label="Resize card inspector"
          />
          {/* Card Inspector Spotlight */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowInspector(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                  title="Close card inspector"
                  aria-label="Close card inspector"
                >
                  <X className="w-4 h-4" />
                </button>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-amber-400" />
                  Card Inspector
                </span>
              </div>
              {isDoubleFaced(inspectedCard) && (
                <button
                  onClick={() => toggleCardFlip(inspectedCard.id)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 text-[11px] font-bold"
                >
                  <RefreshCw className="w-3 h-3" />
                  Flip Card
                </button>
              )}
            </div>

            {inspectedCard && (
              <div className="space-y-3">
                <div className="relative mx-auto w-48 sm:w-52 rounded-xl overflow-hidden shadow-2xl border border-slate-700/80">
                  <img
                    src={getCardImage(
                      inspectedCard,
                      cardFaceMap[inspectedCard.id] || 0
                    )}
                    alt={inspectedCard.name}
                    onError={(e) =>
                      repairCardImage(
                        inspectedCard,
                        e,
                        cardFaceMap[inspectedCard.id] || 0
                      )
                    }
                    className="w-full h-auto block"
                  />
                </div>

                <div className="bg-slate-950/80 border border-slate-800/90 rounded-xl p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-extrabold text-slate-100">
                      {inspectedCard.name}
                    </h3>
                    <ManaCostBadges manaCost={inspectedCard.mana_cost} size="sm" />
                  </div>
                  <p className="text-[11px] font-semibold text-amber-300/90">
                    {inspectedCard.type_line}
                  </p>
                  <p className="text-xs text-slate-300 whitespace-pre-line leading-relaxed max-h-28 overflow-y-auto pr-1">
                    {inspectedCard.oracle_text ||
                      inspectedCard.card_faces?.[0]?.oracle_text ||
                      'No Oracle text.'}
                  </p>

                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-bold">
                        €{inspectedCard.prices?.eur || '0.20'}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 font-bold">
                        ${inspectedCard.prices?.usd || '0.25'}
                      </span>
                    </div>

                    <button
                      onClick={() => addCardToDeck(inspectedCard, 'mainboard')}
                      className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs transition"
                    >
                      + Add to Deck
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Analytics & Rules Validation Tabs */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3.5 flex-1 flex flex-col">
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800 mb-3">
              <button
                onClick={() => setRightTab('analytics')}
                className={`py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                  rightTab === 'analytics'
                    ? 'bg-slate-800 text-amber-300 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                Analytics
              </button>
              <button
                onClick={() => setRightTab('rules')}
                className={`py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                  rightTab === 'rules'
                    ? 'bg-slate-800 text-amber-300 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Rules Engine
                {validation.overall !== 'legal' && (
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                )}
              </button>
            </div>

            {rightTab === 'analytics' ? (
              <div className="space-y-4">
                {/* Mana Curve Bar Chart */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-slate-300">
                      Mana Curve (Non-Land Spells)
                    </span>
                    <span className="text-[11px] text-amber-300 font-semibold">
                      Avg {analytics.avgCmc} CMC
                    </span>
                  </div>
                  <div className="h-36 w-full bg-slate-950/60 rounded-xl p-2 border border-slate-800/80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analytics.curveBins} margin={{ top: 5, right: 5, left: -24, bottom: 0 }}>
                        <XAxis
                          dataKey="cmc"
                          stroke="#94a3b8"
                          fontSize={11}
                          tickLine={false}
                        />
                        <YAxis
                          stroke="#64748b"
                          fontSize={10}
                          tickLine={false}
                          allowDecimals={false}
                        />
                        <RechartsTooltip
                          contentStyle={{
                            backgroundColor: '#0f172a',
                            border: '1px solid #334155',
                            borderRadius: '8px',
                            fontSize: '12px'
                          }}
                        />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                          {analytics.curveBins.map((entry, idx) => (
                            <Cell
                              key={idx}
                              fill={entry.count > 0 ? '#f59e0b' : '#1e293b'}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Color Distribution Breakdown */}
                <div>
                  <span className="text-xs font-bold text-slate-300 block mb-2">
                    Color Identity Breakdown
                  </span>
                  <div className="space-y-1.5">
                    {analytics.colorPieData.map((item) => (
                      <div key={item.code} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="text-slate-300 font-medium">{item.name}</span>
                        </div>
                        <span className="font-bold text-slate-200">{item.value} cards</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Card Type Composition */}
                <div className="pt-2 border-t border-slate-800">
                  <span className="text-xs font-bold text-slate-300 block mb-2">
                    Card Type Composition
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(analytics.typeCounts).map(([type, count]) => (
                      <div
                        key={type}
                        className="bg-slate-950/70 border border-slate-800/80 rounded-lg px-2.5 py-1.5 flex items-center justify-between text-xs"
                      >
                        <span className="text-slate-400 truncate pr-1">{type}</span>
                        <span className="font-extrabold text-amber-300">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* Real-time Rules & Legality Checklist */
              <div className="space-y-2.5">
                <p className="text-xs text-slate-400">
                  Automated validation against official{' '}
                  <span className="text-slate-200 font-semibold uppercase">
                    {activeDeck.format}
                  </span>{' '}
                  constructed rules:
                </p>

                {validation.checks.map((chk) => (
                  <div
                    key={chk.id}
                    className={`p-3 rounded-xl border text-xs space-y-1 ${
                      chk.status === 'pass'
                        ? 'bg-emerald-950/25 border-emerald-500/30'
                        : chk.status === 'warn'
                        ? 'bg-amber-950/25 border-amber-500/30'
                        : 'bg-rose-950/35 border-rose-500/40'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold">
                      {chk.status === 'pass' && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      )}
                      {chk.status === 'warn' && (
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      )}
                      {chk.status === 'fail' && (
                        <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      )}
                      <span className="text-slate-100">{chk.title}</span>
                    </div>
                    <p className="text-slate-300 pl-6 leading-relaxed">{chk.detail}</p>
                  </div>
                ))}

                <div className="pt-2 flex justify-between items-center">
                  <button
                    onClick={handleResetDemoDecks}
                    className="text-xs text-slate-400 hover:text-amber-300 flex items-center gap-1"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset Demo Decks
                  </button>
                </div>
              </div>
            )}
          </div>
        </aside>
        <aside className="deck-table-panel" aria-label="Deck card table">
          <div className="deck-list-header">
            <span>All cards</span>
            <strong>{activeDeck.entries.reduce((sum, entry) => sum + entry.quantity, 0)}</strong>
          </div>
          <div className="deck-list-scroll" ref={deckListScrollRef}>
            {activeDeck.entries.map(({ card, quantity, zone }) => (
              <button
                type="button"
                key={`${zone}-${card.id}-${card.name}`}
                data-deck-card-id={card.id}
                className={`deck-list-row ${
                  inspectedCard?.id === card.id ? 'is-selected' : ''
                }`}
                onClick={() => {
                  setInspectedCard(card);
                  setShowInspector(true);
                  setFanIndex(
                    Math.max(
                      0,
                      fanEntries.findIndex(
                        (entry) =>
                          entry.card.id === card.id &&
                          entry.card.name === card.name
                      )
                    )
                  );
                }}
              >
                <span className="deck-list-qty">{quantity}×</span>
                <img
                  src={getCardImage(card, cardFaceMap[card.id] || 0)}
                  alt=""
                  onError={(event) =>
                    repairCardImage(card, event, cardFaceMap[card.id] || 0)
                  }
                />
                <span className="deck-list-name">{card.name}</span>
                <ManaCostBadges manaCost={card.mana_cost} size="sm" />
              </button>
            ))}
          </div>
        </aside>
      </main>

      {/* ================================================================== */}
      {/* MODAL 1: OPENING HAND & LONDON MULLIGAN SIMULATOR                  */}
      {/* ================================================================== */}
      {showPlaytestModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-5xl w-full p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-lg font-extrabold text-slate-100 flex items-center gap-2">
                  <Shuffle className="w-5 h-5 text-violet-400" />
                  Opening Hand & Mulligan Simulator
                </h2>
                <p className="text-xs text-slate-400">
                  Shuffled from {activeDeck.name} • Mulligans taken: {mulliganCount} • Library remaining: {playtestLibrary.length} cards
                </p>
              </div>
              <button
                onClick={() => setShowPlaytestModal(false)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Hand Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3 py-2">
              {playtestHand.map((card, idx) => (
                <div
                  key={`${card.id}-${idx}`}
                  className="bg-slate-950 rounded-xl p-1.5 border border-slate-800 flex flex-col items-center text-center shadow-lg hover:-translate-y-1 transition"
                >
                  <img
                    src={getCardImage(card)}
                    alt={card.name}
                    onError={(e) => repairCardImage(card, e)}
                    className="w-full h-auto rounded-lg"
                  />
                  <span className="text-[11px] font-bold text-slate-200 mt-1.5 truncate w-full">
                    {card.name}
                  </span>
                </div>
              ))}
            </div>

            {/* Simulator Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => startNewOpeningHand(0)}
                  className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 transition"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                  New 7-Card Hand
                </button>
                <button
                  onClick={() => startNewOpeningHand(mulliganCount + 1)}
                  className="px-3.5 py-2 rounded-xl bg-violet-600/25 hover:bg-violet-600/40 text-violet-200 border border-violet-500/40 font-bold text-xs transition"
                >
                  Mulligan to {Math.max(1, 7 - (mulliganCount + 1))}
                </button>
                <button
                  onClick={drawOnePlaytestCard}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition"
                >
                  + Draw 1 Card (Next Turn)
                </button>
              </div>
              <span className="text-xs text-slate-400">
                Lands in hand:{' '}
                <strong className="text-emerald-400">
                  {
                    playtestHand.filter((c) =>
                      (c.type_line || '').toLowerCase().includes('land')
                    ).length
                  }
                </strong>{' '}
                / {playtestHand.length}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* MODAL 2: MTG ARENA IMPORT / EXPORT                                 */}
      {/* ================================================================== */}
      {showImportExportModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-3xl w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-lg font-extrabold text-slate-100">
                  MTG Arena / MTGO Decklist Import & Export
                </h2>
                <p className="text-xs text-slate-400">
                  Copy your formatted decklist for MTG Arena or paste a list to import via Scryfall.
                </p>
              </div>
              <button
                onClick={() => setShowImportExportModal(false)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Export Column */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300">
                    Export Current Deck ({activeDeck.name})
                  </label>
                  <button
                    onClick={handleCopyExport}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 font-bold text-xs"
                  >
                    {copiedExport ? (
                      <>
                        <Check className="w-3.5 h-3.5" /> Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Copy List
                      </>
                    )}
                  </button>
                </div>
                <textarea
                  readOnly
                  value={exportedArenaText}
                  className="w-full h-64 bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-200 focus:outline-none"
                />
              </div>

              {/* Import Column */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300">
                    Import Decklist from Text
                  </label>
                  <button
                    onClick={handleImportDeckText}
                    disabled={isImporting}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs disabled:opacity-50"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {isImporting ? 'Resolving via Scryfall...' : 'Import Deck'}
                  </button>
                </div>
                <textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder={`Paste Arena format here, e.g.:\nCommander\n1 Niv-Mizzet, Parun\n\nDeck\n1 Sol Ring\n1 Counterspell\n1Rhystic Study`}
                  className="w-full h-64 bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-xl p-3 text-xs font-mono text-slate-200 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* MODAL 3: NEW DECK MODAL                                            */}
      {/* ================================================================== */}
      {showNewDeckModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateDeck}
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-extrabold text-slate-100">
                Create New MTG Deck
              </h2>
              <button
                type="button"
                onClick={() => setShowNewDeckModal(false)}
                className="p-1 rounded-lg bg-slate-800 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  Deck Name
                </label>
                <input
                  type="text"
                  required
                  value={newDeckName}
                  onChange={(e) => setNewDeckName(e.target.value)}
                  placeholder="e.g., Atraxa Superfriends or Azorius Control"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  Format & Validation Ruleset
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {['commander', 'modern', 'standard'].map((fmt) => (
                    <button
                      type="button"
                      key={fmt}
                      onClick={() => setNewDeckFormat(fmt)}
                      className={`py-2 rounded-xl text-xs font-bold uppercase border transition ${
                        newDeckFormat === fmt
                          ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewDeckModal(false)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-xl bg-amber-500 text-slate-950 text-xs font-extrabold"
              >
                Create Deck
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ================================================================== */}
      {/* MODAL 4: SCHOOL PROJECT SYSTEM ARCHITECTURE & TECH STACK OVERVIEW  */}
      {/* ================================================================== */}
      {showArchitectureModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                  School Project Defense Reference
                </span>
                <h2 className="text-lg font-extrabold text-slate-100">
                  ArcaneForge Full-Stack System Architecture
                </h2>
              </div>
              <button
                onClick={() => setShowArchitectureModal(false)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                  <Globe className="w-4 h-4" />
                  1. React + Tailwind Client
                </div>
                <p className="text-slate-300 leading-relaxed">
                  Manages optimistic deck state, real-time mana curve analytics (Recharts),
                  London Mulligan hand simulation, and lazy-loads card scans directly from
                  Scryfall&apos;s CDN (<code className="text-amber-300">cards.scryfall.io</code>).
                </p>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-violet-400 font-bold text-sm">
                  <Server className="w-4 h-4" />
                  2. FastAPI / Node.js Backend
                </div>
                <p className="text-slate-300 leading-relaxed">
                  Exposes REST endpoints (<code className="text-violet-300">/api/decks</code>,{' '}
                  <code className="text-violet-300">/api/cards/search</code>), enforces
                  Commander/Modern legality rules on save, and parses MTG Arena text imports.
                </p>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                  <Database className="w-4 h-4" />
                  3. PostgreSQL + JSONB Cache
                </div>
                <p className="text-slate-300 leading-relaxed">
                  Uses relational tables (<code className="text-emerald-300">users</code>,{' '}
                  <code className="text-emerald-300">decks</code>,{' '}
                  <code className="text-emerald-300">deck_cards</code>) joined with a local{' '}
                  <code className="text-emerald-300">cards</code> table storing Scryfall
                  double-faced layouts and prices in a <code className="text-emerald-300">JSONB</code> column.
                </p>
              </div>
            </div>

            <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-4 text-xs space-y-2">
              <h4 className="font-bold text-slate-200">
                Relational Database Schema Summary (PostgreSQL)
              </h4>
              <pre className="text-[11px] font-mono text-emerald-300 overflow-x-auto leading-relaxed">
{`CREATE TABLE cards (
  scryfall_id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  cmc NUMERIC(4,1) NOT NULL,
  type_line VARCHAR(255),
  color_identity VARCHAR(10)[],
  legalities JSONB,      -- {"commander": "legal", "modern": "legal"}
  prices JSONB           -- {"eur": "1.85", "usd": "1.99"}
);

CREATE TABLE decks (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  name VARCHAR(120) NOT NULL,
  format VARCHAR(32) NOT NULL -- 'commander' | 'modern' | 'standard'
);

CREATE TABLE deck_cards (
  deck_id UUID REFERENCES decks(id) ON DELETE CASCADE,
  card_id UUID REFERENCES cards(scryfall_id),
  zone VARCHAR(24) NOT NULL,  -- 'commander' | 'mainboard' | 'sideboard'
  quantity INT NOT NULL DEFAULT 1,
  PRIMARY KEY (deck_id, card_id, zone)
);`}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}