# Implementation Plan: Loyalty Card PWA
Based on: `docs/2026-05-19-loyalty-card-pwa/outline.md`

## Overview

Build a static-hosted, offline-first PWA for managing loyalty cards: Alpine.js for UI, bwip-js for barcode rendering, @zxing/library for scanning, esbuild for bundling, localStorage for persistence. Five hash-routed views assembled from HTML template partials at build time.

## Steps

### Step 1: Build Infrastructure
**Goal**: Working `pnpm run build` that bundles JS, bundles CSS, and assembles the HTML from template partials. Output lands in `dist/`.
**Acceptance Criteria**:
- [ ] `pnpm run build` completes without errors
- [ ] `dist/app.js` exists (esbuild bundle of `src/app.js`, all Alpine.js/bwip-js/ZXing deps bundled)
- [ ] `dist/styles.css` exists (esbuild bundle of `src/styles.css` importing `vendor/marx-css/marx.css`)
- [ ] `dist/index.html` exists (assembled from `src/index.html` + `src/templates/*.html`)
- [ ] `dist/sw.js`, `dist/manifest.json`, `dist/icon.svg` are copied from `src/`

**Files**:
- `package.json` — MODIFIED. Update `scripts.build` to run esbuild JS, esbuild CSS, then a small Node build helper.
- `scripts/build.mjs` — NEW. Node script that: (1) bundles `src/app.js` → `dist/app.js` with esbuild, (2) bundles `src/styles.css` → `dist/styles.css` with esbuild, (3) reads `src/index.html`, resolves `<!-- INCLUDE: templates/foo.html -->` directives, writes assembled HTML to `dist/index.html`, (4) copies `src/sw.js`, `src/manifest.json`, `src/icon.svg` to `dist/` via `fs.cpSync`.

**Key Implementation Details**:
- esbuild JS config: `entryPoints: ['src/app.js']`, `bundle: true`, `outfile: 'dist/app.js'`, `format: 'esm'`. Use `keepNames: true` for Alpine.js compatibility.
- esbuild CSS config: `entryPoints: ['src/styles.css']`, `bundle: true`, `outfile: 'dist/styles.css'`.
- HTML assembly: regex `<!--\s*INCLUDE:\s*templates/([^>]+?)\s*-->` — read `src/templates/$1`, inject content. Simple `String.replace()` loop.

### Step 2: HTML Shell & Template Partials
**Goal**: Complete `src/index.html` shell and all template partials. Alpine.js root `x-data` element wired up, but JS logic stubbed.
**Acceptance Criteria**:
- [ ] `src/index.html` contains `<link>` to `styles.css`, `<script type="module">` loading `app.js`, manifest link, SW registration inline `<script>`, and `<div x-data="loyaltyApp">` root with `<!-- INCLUDE -->` directives for each view
- [ ] `src/templates/list.html` — card rows with `x-for`, empty state, Add button, Settings link
- [ ] `src/templates/view.html` — barcode `<img>`, code text, Edit/Delete buttons
- [ ] `src/templates/form.html` — shared add/edit form: name input, color picker, code input, type dropdown, camera capture `<input type="file">`
- [ ] `src/templates/settings.html` — JSON textarea (read-only), copy button, restore textarea + button
- [ ] `src/templates/toast.html` — fixed top-right toast container with `x-for` over `toasts` array
- [ ] Build assembles all partials into `dist/index.html` successfully

**Key Implementation Details**:
- Hash routing: `window.addEventListener('hashchange', ...)` in `app.js`. Alpine.js computes `currentPage` and `currentCardId` from `location.hash`.
- View visibility: each view wrapped in `<template x-if="currentPage === 'list'">` etc.
- Marx-css `<main>` is the top-level container. Marx already styles inputs and buttons.
- SW registration: inline `<script>` with feature detection (`'serviceWorker' in navigator`), register `sw.js` at root scope, `.catch()` log.

### Step 3: CSS — Base Styles & Component Classes
**Goal**: `src/styles.css` imports marx-css and adds component classes for the card list, barcode view, toasts, and layout.
**Acceptance Criteria**:
- [ ] Card list rows render full-width with card color background and computed text color
- [ ] Barcode image is centered and constrained to viewport width with padding
- [ ] Toast messages appear fixed top-right, auto-dismiss after 5s
- [ ] Empty state message is centered with a muted style
- [ ] Settings textarea is full-width with reasonable height

**Files**:
- `src/styles.css` — NEW. Imports `../vendor/marx-css/marx.css` as first line. Adds component classes.

**Key Implementation Details**:
- Marx-css import: `@import '../vendor/marx-css/marx.css';` at top. esbuild will inline it.
- `.card-row` — `display: block; width: 100%; padding: 16px; margin-bottom: 4px; border-radius: 4px; cursor: pointer; font-size: 1.1rem; text-decoration: none;`. Background and text color set inline via Alpine `:style`.
- `.barcode-img` — `display: block; max-width: calc(100vw - 32px); margin: 0 auto;`.
- `.barcode-code` — `text-align: center; font-family: monospace; margin-top: 8px;`.
- `.toast-container` — `position: fixed; top: 16px; right: 16px; z-index: 1000; display: flex; flex-direction: column; gap: 8px; max-width: 320px;`.
- `.toast` — `background: var(--text); color: var(--white); padding: 12px 16px; border-radius: var(--br); font-size: 14px; animation: toast-in 0.3s ease;`.
- `.empty-state` — centered text with `var(--secondary)` color, `p` with padding.
- Forms: marx-css already styles inputs/buttons/selects well. No extra form classes needed except maybe spacing.

### Step 4: Core Application Shell — Alpine.js State, Routing, Toasts
**Goal**: Working `app.js` with Alpine.js `x-data` store, hash routing, localStorage persistence layer, and toast system. Card list and empty state render correctly. Add/edit/view/settings pages stub out with route navigation working.
**Acceptance Criteria**:
- [ ] `#list` shows empty state when no cards exist, with working Add button nav
- [ ] `#add` navigates to form view
- [ ] `#view/<id>` navigates to card view (shows card name from localStorage)
- [ ] `#edit/<id>` navigates to edit form
- [ ] `#settings` navigates to settings view
- [ ] Back/forward browser buttons work correctly
- [ ] Adding a card persists to localStorage and appears in list
- [ ] Toasts appear top-right, auto-dismiss after 5s
- [ ] localStorage errors handled gracefully (FR17)

**Files**:
- `src/app.js` — NEW. Full Alpine.js application logic.

**Key Implementation Details**:

```js
// Routing: derive page + cardId from hash
function parseHash() {
    const hash = location.hash.slice(1) || 'list';
    const match = hash.match(/^(view|edit)\/(.+)$/);
    if (match) return { page: match[1], cardId: match[2] };
    return { page: ['list','add','settings'].includes(hash) ? hash : 'list', cardId: null };
}

// localStorage wrapper
const STORAGE_KEY = 'loyalty-cards';
function loadCards() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { cards: [] };
        const data = JSON.parse(raw);
        return (data && Array.isArray(data.cards)) ? data : { cards: [] };
    } catch (e) {
        showToast('Could not load saved cards — starting fresh.');
        return { cards: [] };
    }
}
function saveCards(data) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        showToast('Could not save changes — storage may be full or unavailable.');
    }
}
```

- Alpine.js store structure:
```js
document.addEventListener('alpine:init', () => {
    Alpine.data('loyaltyApp', () => ({
        cards: [],
        toasts: [],
        form: { name: '', color: '#ffffff', code: '', barcodeType: 'EAN_13' },
        editingId: null,
        
        // reactive getters
        get currentPage() { ... parseHash() ... },
        get currentCard() { ... this.cards.find(...) ... },
        
        // methods: navigateTo(), addCard(), updateCard(), deleteCard(), 
        //           showToast(), removeToast(), autoDetectType(), etc.
    }));
});
```

- ID generation (in `app.js`):
```js
function generateId() {
    return Date.now().toString(36);
}
```

- Color luminance (for text contrast):
```js
function computeTextColor(hex) {
    const r = parseInt(hex.slice(1,3), 16);
    const g = parseInt(hex.slice(3,5), 16);
    const b = parseInt(hex.slice(5,7), 16);
    return (0.299*r + 0.587*g + 0.114*b) / 255 < 0.5 ? '#ffffff' : '#000000';
}
```

### Step 5: Barcode Rendering with bwip-js
**Goal**: Cards rendered via bwip-js produce valid barcode images. The dataURL is extracted from a canvas and stored on the card object. The barcode displays correctly in the card view.
**Acceptance Criteria**:
- [ ] `renderBarcode(type, code)` returns a `data:image/png;base64,...` string or throws
- [ ] On save (add or edit), the card's `barcodeDataURL` is populated
- [ ] Card view displays the barcode image centered and sized to viewport
- [ ] Code text appears below the barcode in monospace font
- [ ] Invalid codes show toast with type name (FR6)

**Files**:
- `src/app.js` — MODIFIED. Add `renderBarcode()` function.

**Key Implementation Details**:
```js
import bwipjs from 'bwip-js';

function renderBarcode(bcid, code) {
    const canvas = document.createElement('canvas');
    bwipjs.toCanvas(canvas, {
        bcid,
        text: code,
        scale: 3,
        height: 10,
        includetext: false,     // we show code as text below, not in the barcode
    });
    return canvas.toDataURL('image/png');
}
```
- Wrapped in try/catch. On failure, re-throws for caller to handle (FR6 toast).
- In `addCard()` / `updateCard()`: call `renderBarcode()`, store result in `card.barcodeDataURL`.

### Step 6: Barcode Scanning with @zxing/library
**Goal**: User can capture a barcode photo and have type + code auto-populated in the form. Unsupported types are rejected with a toast. Blob URLs are cleaned up.
**Acceptance Criteria**:
- [ ] Selecting a file from `<input type="file" capture="environment">` triggers scan
- [ ] Supported barcode formats populate code + type fields
- [ ] Unsupported format shows toast and leaves fields unchanged
- [ ] No barcode found shows toast
- [ ] Multiple barcodes: first result used
- [ ] Blob URL is revoked after scan completes
- [ ] Scan never autofills the name field

**Files**:
- `src/app.js` — MODIFIED. Add `scanBarcode()` function.

**Key Implementation Details**:
```js
import { BrowserMultiFormatReader } from '@zxing/library';

const ZXING_MAP = {
    [BarcodeFormat.EAN_13]: 'ean13',
    [BarcodeFormat.EAN_8]: 'ean8',
    [BarcodeFormat.UPC_A]: 'ean13',
    [BarcodeFormat.CODE_39]: 'code39',
    [BarcodeFormat.CODE_128]: 'code128',
    [BarcodeFormat.ITF]: 'interleaved2of5',
    [BarcodeFormat.QR_CODE]: 'qrcode',
};

async function scanBarcode(file) {
    const url = URL.createObjectURL(file);
    try {
        const reader = new BrowserMultiFormatReader();
        const result = await reader.decodeFromImageUrl(url);
        const format = result.getBarcodeFormat();
        const bcid = ZXING_MAP[format];
        if (!bcid) {
            showToast('Unsupported barcode type detected.');
            return null;
        }
        return { code: result.getText(), barcodeType: bcid };
    } catch (e) {
        showToast('No barcode detected in image.');
        return null;
    } finally {
        URL.revokeObjectURL(url);
    }
}
```
- Need to import `BarcodeFormat` enum: `import { BrowserMultiFormatReader, BarcodeFormat } from '@zxing/library';`

### Step 7: Barcode Auto-Detection
**Goal**: When user types a code manually, the barcode type dropdown auto-selects based on pattern matching. User can override manually.
**Acceptance Criteria**:
- [ ] 12–13 digit numeric → `EAN_13`
- [ ] 7–8 digit numeric → `EAN_8`
- [ ] Uppercase alphanumeric + special chars (`-. $/+%`) → `CODE_39`
- [ ] Even-length numeric ≥8 digits → `ITF`
- [ ] Printable ASCII → `CODE_128`
- [ ] Everything else → `QR_CODE`
- [ ] Changing the dropdown manually overrides auto-detection and disables further auto-detection for that form session
- [ ] CODE_39 auto-uppercases typed input

**Files**:
- `src/app.js` — MODIFIED. Add `autoDetectType()` function, wire to `@input` on code field.

**Key Implementation Details**:
```js
function autoDetectType(code) {
    if (/^\d{12,13}$/.test(code)) return 'EAN_13';
    if (/^\d{7,8}$/.test(code)) return 'EAN_8';
    if (/^[A-Z0-9\-.\s$/+%]+$/.test(code) && /[A-Z]/.test(code)) return 'CODE_39';
    if (/^\d+$/.test(code) && code.length % 2 === 0 && code.length >= 8) return 'ITF';
    if (/^[\x20-\x7E]+$/.test(code)) return 'CODE_128';
    return 'QR_CODE';
}
```
- Auto-detection only runs when `form.manualTypeOverride` is false.
- Changing the type dropdown sets `form.manualTypeOverride = true`.
- EAN_13 padding: if 12 digits, prepend `'0'`.
- EAN_8 padding: if 7 digits, prepend `'0'`.

### Step 8: Card Add/Edit/View/Delete Flows
**Goal**: Complete CRUD workflows with proper navigation, validation, and persistence.
**Acceptance Criteria**:
- [ ] Add form saves card, renders barcode, navigates to `#list`
- [ ] Edit form pre-fills existing values, saves updates (including re-rendered barcode), navigates to `#view/<id>`
- [ ] Card view shows barcode image + code text + Edit/Delete buttons
- [ ] Delete button shows `confirm()` dialog, removes card, navigates to `#list`
- [ ] Invalid barcode code prevents save
- [ ] Name + code fields are required (prevent save if empty)

**Files**:
- `src/app.js` — MODIFIED. Complete `addCard()`, `updateCard()`, `deleteCard()` logic.
- `src/templates/form.html` — MODIFIED. Wire form submission and edit mode.

**Key Implementation Details**:
- `addCard()`: validate name + code non-empty, detect type (if auto), render barcode, compute textColor, generate id, push to cards, save, navigate to `#list`, toast "Card added."
- `updateCard()`: same validation + render pipeline, find card by `editingId`, update in place, save, navigate to `#view/<id>`, toast "Card updated."
- `deleteCard()`: `if (!confirm('Delete this card?')) return;`, remove from array, save, navigate to `#list`, toast "Card deleted."
- Edit form: `editingId` set on navigation to `#edit/<id>`, form fields pre-filled from `currentCard`.
- `editingId = null` clears edit mode (used when navigating to `#add`).
- Required field validation: check `name.trim()` and `code.trim()` before attempting render.

### Step 9: Settings — Backup & Restore
**Goal**: Settings view shows raw localStorage JSON for copy-paste backup, and restore button to import from pasted JSON.
**Acceptance Criteria**:
- [ ] Settings textarea shows `JSON.stringify({ cards }, null, 2)` from current localStorage
- [ ] "Copy" button copies textarea content to clipboard, shows toast "Copied."
- [ ] Restore textarea accepts user-pasted JSON
- [ ] "Restore" button validates JSON schema (`{ cards: [...] }`), shows `confirm()` asking to replace, replaces data, navigates to `#list`
- [ ] Invalid JSON shows toast "Invalid JSON format."

**Files**:
- `src/app.js` — MODIFIED. Add `exportJSON()`, `restoreFromJSON()`.
- `src/templates/settings.html` — NEW. Settings UI.

**Key Implementation Details**:
```js
function exportJSON() {
    return JSON.stringify(loadCards(), null, 2);
}

function restoreFromJSON(jsonStr) {
    try {
        const data = JSON.parse(jsonStr);
        if (!data || !Array.isArray(data.cards)) throw new Error('Invalid schema');
        if (!confirm('Replace all cards with imported data?')) return;
        saveCards(data);
        this.loadCards(); // refresh Alpine state
        showToast('Cards restored.');
        navigateTo('list');
    } catch (e) {
        showToast('Invalid JSON format.');
    }
}
```
- Clipboard API: `navigator.clipboard.writeText(text)`. Fallback: if unavailable, select textarea content so user can manually copy.

### Step 10: Service Worker
**Goal**: Service worker with network-first + 3s timeout strategy, caching all static assets. Version-based activation for updates.
**Acceptance Criteria**:
- [ ] SW registers successfully on page load
- [ ] On first visit (online), assets are cached
- [ ] On subsequent visits (online), network is tried first, cache updated on success
- [ ] On subsequent visits (offline), assets served from cache
- [ ] Network requests timeout at 3s, falling back to cache
- [ ] Changing `VERSION` constant in `sw.js` forces immediate activation on next page load

**Files**:
- `src/sw.js` — NEW. Full service worker implementation.
- `src/index.html` — MODIFIED. Inline SW registration script (already stubbed).

**Key Implementation Details**:
```js
const VERSION = '1';
const CACHE_NAME = `loyalty-pwa-v${VERSION}`;
const ASSETS = ['/', '/index.html', '/app.js', '/styles.css', '/manifest.json', '/icon.svg'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
    // Force activation — take over immediately on version change
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        )
    );
});

self.addEventListener('fetch', (event) => {
    // Only handle GET requests for our origin
    if (event.request.method !== 'GET') return;
    
    event.respondWith(
        Promise.race([
            fetch(event.request),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
        ]).then((response) => {
            // Update cache with fresh response
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            return response;
        }).catch(() => {
            // Network failed or timed out — serve from cache
            return caches.match(event.request);
        })
    );
});
```
- Cache namespacing: `loyalty-pwa-v<VERSION>`. On version bump, old caches cleaned in `activate`.

### Step 11: PWA Manifest & Icons
**Goal**: Installable PWA with manifest.json and placeholder icon. Standalone display mode, moss-green theme.
**Acceptance Criteria**:
- [ ] `manifest.json` has `name`, `short_name`, `start_url: "."`, `display: "standalone"`, `theme_color`, `background_color`, `icons` array
- [ ] `icon.svg` is a simple placeholder (card/ticket shape)
- [ ] Manifest linked from `index.html`
- [ ] "Add to Home Screen" prompt triggers in browser (when criteria met)

**Files**:
- `src/manifest.json` — NEW.
- `src/icon.svg` — NEW.
- `src/index.html` — MODIFIED. Manifest `<link>` already in shell.

**Key Implementation Details**:
```json
{
    "name": "Loyalty Cards",
    "short_name": "Loyalty",
    "start_url": ".",
    "display": "standalone",
    "theme_color": "#5a7d4a",
    "background_color": "#ffffff",
    "icons": [
        {
            "src": "/icon.svg",
            "sizes": "any",
            "type": "image/svg+xml",
            "purpose": "any maskable"
        }
    ]
}
```
- Icon: simple SVG — rounded rectangle (card shape) with a barcode-like pattern of vertical lines. White background, moss-green lines. Minimum 192x192 viewBox for maskable icon safety zone.
- `theme_color`: `#5a7d4a` (moss green).

### Step 12: Polish & Edge Cases
**Goal**: Handle all remaining edge cases and quality-of-life improvements.
**Acceptance Criteria**:
- [ ] Empty code field prevents save with toast "Name and code are required."
- [ ] Form resets when navigating from add to add again (or another view)
- [ ] Toast messages don't pile up beyond 3 visible at once (oldest removed)
- [ ] Card `createdAt` is set on creation and preserved on edit
- [ ] Code value in card view is selectable (text, not an image)
- [ ] `x-cloak` on root Alpine element prevents FOUC

**Files**:
- `src/app.js` — MODIFIED. Edge case handling.
- `src/styles.css` — MODIFIED. Add `[x-cloak] { display: none !important; }`.
- `src/index.html` — MODIFIED. Add `x-cloak` attribute to root element.

**Key Implementation Details**:
- FOUC prevention: `<div x-data="loyaltyApp" x-cloak>`
- Toast cap: `if (this.toasts.length >= 3) this.toasts.shift();` before pushing new toast.
- Form reset: watch `currentPage` — when switching to `'add'`, reset `form` and `editingId`.
- `createdAt`: set once in `addCard()`, preserved untouched in `updateCard()`.
