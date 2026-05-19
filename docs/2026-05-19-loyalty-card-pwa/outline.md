# Feature: Loyalty Card PWA

## Description

A static-hosted, offline-first Progressive Web App for managing loyalty cards. The app is a **single HTML page** (assembled from template partials at build time) with hash-based routing, built with **Alpine.js** for reactive UI, **esbuild** for bundling and HTML assembly, and styled on top of **marx-css** (a classless CSS reset). No backend, no database — all data persists in `localStorage`. Barcodes are rendered client-side with **bwip-js** and scanned from camera captures via **@zxing/library**.

After the initial page load, the app works 100% offline. A network-first service worker with cache fallback enables seamless updates on refresh while ensuring offline availability.

## User Stories

1. **Add a card** — User enters a name and picks a color. They either type a barcode code manually (auto-detected type with a manual override dropdown) or scan a barcode using a camera capture (`<input type="file" capture="environment">`). The app renders the barcode via bwip-js and caches the dataURL.
2. **Browse cards** — Full-width rows showing each card's color as background and name. Empty state shows a placeholder message and an "Add" button. A settings/backup link is available.
6. **Backup & restore** — User opens settings, copies the raw JSON as a backup. Can paste it back to restore all cards.
3. **View a card** — Full-page view with the barcode rendered large (fit-to-viewport-width with padding) and the code value displayed as text below it. Edit and Delete buttons are always accessible.
4. **Edit a card** — Same form as "Add" (name, color, code/type input or scan). Barcode is re-rendered on save only (no live preview). Returns to card view after saving.
5. **Delete a card** — Removes the card from localStorage and returns to the list.
6. **Persistence** — Every add/edit/delete is immediately persisted to localStorage. No manual save button beyond the form submission.

## Requirements

### Functional

- **FR1: Card CRUD** — Create, read, update, and delete loyalty cards stored in localStorage under key `"loyalty-cards"` as `{ cards: [...] }`.
- **FR2: Hash routing** — Five routes: `#list` (default), `#add`, `#view/<id>`, `#edit/<id>`, `#settings`. Back/forward navigation works. Deep-linking to a specific card works.
- **FR3: Barcode rendering** — Render barcode to a detached `<canvas>` via `bwipjs.toCanvas()`, extract dataURL via `canvas.toDataURL('image/png')`, cache on the card object. Display in card view as an `<img>` element sized to fit viewport width with padding.
- **FR4: Barcode scanning** — Use `BrowserMultiFormatReader.decodeFromImageUrl()` to decode a barcode from the file selected by `<input type="file" capture="environment">`. Create a blob URL with `URL.createObjectURL(file)`, pass to `decodeFromImageUrl()`, then call `URL.revokeObjectURL(url)` in a `finally` block to prevent memory leaks. Extract `result.getText()` and `result.getBarcodeFormat()`. Map ZXing BarcodeFormat enum to bwip-js bcid:
  - `BarcodeFormat.EAN_13` → `ean13`
  - `BarcodeFormat.EAN_8` → `ean8`
  - `BarcodeFormat.UPC_A` → `ean13` (bwip-js renders UPC-A as EAN-13 with leading zero)
  - `BarcodeFormat.CODE_39` → `code39`
  - `BarcodeFormat.CODE_128` → `code128`
  - `BarcodeFormat.ITF` → `interleaved2of5`
  - `BarcodeFormat.QR_CODE` → `qrcode`
  - All other formats (CODABAR, CODE_93, DATA_MATRIX, PDF_417, AZTEC, etc.) → toast "Unsupported barcode type detected."
- **FR5: Barcode auto-detection (manual entry)** — When a user types a code, auto-detect the barcode type by pattern (checked in priority order):
  - 12–13 digit numeric-only → `EAN_13` (pad to 13 if 12)
  - 7–8 digit numeric-only → `EAN_8` (pad to 8 if 7)
  - Alphanumeric (uppercase A-Z, 0-9, space, `-`, `.`, `$`, `/`, `+`, `%`) → `CODE_39`
  - Even-length numeric-only (≥8 digits) → `ITF` (`interleaved2of5`; shorter even numerics are too ambiguous and fall through)
  - Contains only printable ASCII (codes 32–127) → `CODE_128`
  - Everything else → `QR_CODE` (fallback)
  - Selection is overridable via dropdown.
- **FR6: Validation** — On save, attempt to render the barcode with bwip-js. If it throws, prevent save and show a toast error including the barcode type name (e.g., "Invalid code for CODE_39 — must be uppercase A-Z, 0-9, and -. $/+%"). Auto-uppercase input when barcode type is CODE_39.
- **FR7: Card colors** — `input[type="color"]` picker, defaults to `#ffffff`. Compute foreground text color (black or white) from relative luminance: `luminance = (0.299*R + 0.587*G + 0.114*B) / 255`. If luminance < 0.5 → white text, else black. Cache as `textColor` on card object.
- **FR8: Scan error handling** — If no barcode is found: toast "No barcode detected in image." If multiple: use first result. If unsupported type (not in the FR4 mapping): toast "Unsupported barcode type detected."
- **FR9: Duplicate cards** — Allowed. No duplicate detection.
- **FR10: Scan name autofill** — Scanning only populates code + type. Name field is never autofilled.
- **FR11: Toast notifications** — Positioned top-right, auto-dismiss after 5 seconds, neutral styling. Used for success confirmations and error messages.
- **FR12: PWA installability** — manifest.json with `standalone` display mode, moss-green theme color, placeholder SVG icon. Service worker registered at root scope.
- **FR13: Service worker** — Network-first with cache fallback and 3-second timeout: `Promise.race([fetch(request), timeout(3000)])`. If network responds within 3s, use response and update cache. Otherwise, serve from cache immediately. Caches all static assets (HTML, JS, CSS, SW itself). Includes a `VERSION` constant at the top of `sw.js`; on `install`, compare against previous version in cache and call `skipWaiting()` on mismatch to force immediate activation.
- **FR14: Edit rerender timing** — Barcode dataURL is regenerated only when the card edit form is saved, not on every keystroke. No barcode preview on the edit page.
- **FR15: Post-edit navigation** — Return to card view after saving edits.
- **FR16: Post-delete navigation** — Return to card list after deleting. Deletion requires confirmation via native `confirm("Delete this card?")` before proceeding.
- **FR17: localStorage error handling** — Wrap all localStorage reads/writes in try/catch. On read failure: initialize with empty `{ cards: [] }` and toast "Could not load saved cards — starting fresh." On write failure: toast "Could not save changes — storage may be full or unavailable" but keep in-memory state intact (no data loss). On JSON parsing failure: same recovery path as read failure.
- **FR18: Settings screen** — An additional route `#settings` accessible from the card list. Contains a `<textarea>` displaying the raw `localStorage['loyalty-cards']` JSON string (read-only) for copy-paste backup. Also a "Restore" button that parses user-pasted JSON, validates it against the `{ cards: [...] }` schema, and replaces current data (with confirmation).

### Non-functional

- **NFR1: Offline-first** — After initial load, the app must function fully without network connectivity.
- **NFR2: Static hosting** — `dist/` directory contains all necessary files. No server-side processing required.
- **NFR3: Performance** — Card list renders in a single pass. Barcode rendering happens once per code change (on save). localStorage reads on init only.
- **NFR4: Bundle size** — No heavy frameworks. Alpine.js (~15KB gzipped) + bwip-js (~100KB gzipped) + @zxing/library (~80KB gzipped) as the main payload. esbuild bundles and tree-shakes where possible.
- **NFR5: Accessibility** — Semantic HTML elements from marx-css base. Form labels, button roles, reasonable color contrast on card list items.

## Motivation & Tradeoffs

### Why Alpine.js over Stimulus or vanilla JS
- Alpine.js provides declarative reactivity (`x-data`, `x-for`, `x-show`, `x-model`) that eliminates manual DOM manipulation for CRUD operations on a card list.
- Stimulus would require imperative DOM updates for list rendering, view switching, and form binding — effectively the same code as vanilla JS organized into classes.
- Alpine.js is ~15KB gzipped; the JS code not written due to its reactivity nets a smaller total bundle.

### Why `Date.now().toString(36)` for IDs
- Simpler than `crypto.randomUUID()`. At personal-use scale, collision risk is negligible.
- Produces short, readable IDs like `"lm8k2a"`.

### Why network-first service worker
- Enables instant updates on refresh (no clearing cache manually).
- Cache fallback guarantees offline functionality after first load.
- Better fit for a "rarely updated but should update easily" statically-hosted app vs. cache-first.

### Why hash-based routing
- Simple to implement with Alpine.js (watch `location.hash`, derive `currentPage` state).
- Back button and deep-linking work naturally.
- No server configuration needed (unlike HTML5 History API routing).

### Why separate CSS file
- Simpler service worker caching strategy (cache by file extension).
- Clear separation: `marx.css` provides base, `styles.css` adds component classes.

## Dependencies & Constraints

### Runtime dependencies
| Package | Version | Role |
|---|---|---|
| `alpinejs` | 3.15.12 | Reactive UI framework |
| `bwip-js` | 4.10.1 | Barcode rendering (to canvas) |
| `@zxing/library` | 0.23.0 | Barcode scanning from images |
| `marx-css` | vendor | Classless CSS reset / base styles |

### Build dependencies
| Package | Version | Role |
|---|---|---|
| `esbuild` | 0.28.0 | JS and CSS bundling |

### Constraints
- **localStorage 5MB limit** — Not a concern. Typical barcode PNG dataURL is ~2–5KB. Even 1000 cards would be ~3–5MB.
- **No server** — The app is fully client-side. No API calls. No SSR.
- **Single HTML page** — Everything lives in `src/index.html`. esbuild bundles JS and CSS into `dist/`.
- **marx-css is classless** — It auto-styles raw elements. We add component classes sparingly. Its `<main>` is the natural container (max-width: 768px, auto-centers).
- **bwip-js browser API** — `toCanvas(canvas, options)` renders synchronously. Uses `bcid` string to specify barcode type. Throws on invalid input.
- **@zxing/library browser API** — `BrowserMultiFormatReader.decodeFromImageUrl()` returns a `Promise<Result>`. Result exposes `getText()` and `getBarcodeFormat()` (enum). Scanning from `<input type="file">` requires creating an object URL from the `File` blob.

## Research Findings

### marx-css structure
- **Source**: `vendor/marx-css/marx.css` (782 lines). Version 4.1.1.
- Classless: styles `<main>`, `<header>`, `<footer>`, `<section>`, `<nav>`, buttons, inputs, forms, tables, typography out of the box.
- `<main>` is the primary container: `max-width: 768px`, `margin: 0 auto`, `padding: 0 16px 16px`.
- Buttons styled with blue background (`--primary: #3b82f6`), white text, border-radius 4px.
- Form inputs styled with border, border-radius 4px, padding 8px 16px, width 100%.
- CSS custom properties exposed: `--primary`, `--accent`, `--red`, `--yellow`, `--text`, `--secondary`, `--br`, `--md-pad`, `--lg-breakpoint`, etc.
- No grid or flexbox utility classes — raw element styling only. We must add our own component classes for the card list rows.

### bwip-js Browser API (v4.10.1)
- `import bwipjs from 'bwip-js'` (ESM)
- `bwipjs.toCanvas(canvas, { bcid, text, scale, height, includetext, textxalign })` — renders to a canvas element, returns the canvas.
- Canonical `bcid` values for our four types: `ean13`, `code39`, `interleaved2of5`, `qrcode`.
- Options: `scale` (pixel scaling, default 2), `height` (bar height in mm), `includetext` (show human-readable text below bars), `textxalign: 'center'`.
- Throws on encoding failure (invalid code for barcode type).
- Extract dataURL: `canvas.toDataURL('image/png')`.

### @zxing/library Browser API (v0.23.0)
- `BrowserMultiFormatReader` extends `BrowserCodeReader`.
- `decodeFromImageUrl(url: string): Promise<Result>` — loads image from URL, decodes barcode.
- `decodeFromImageElement(source: string | HTMLImageElement): Promise<Result>` — decodes from an `<img>` element.
- `Result.getText(): string` — raw decoded text.
- `Result.getBarcodeFormat(): BarcodeFormat` — enum value.
- `BarcodeFormat` enum: `EAN_13 = 7`, `CODE_39 = 2`, `ITF = 8`, `QR_CODE = 11`.
- For `<input type="file">` integration: read the `File` as a data/blob URL with `URL.createObjectURL(file)`, then pass to `decodeFromImageUrl()`.
- Limitation: On iOS < 14.3, camera access only works in native Safari (not relevant since we use `<input type="file">` capture, not WebRTC).

### ZXing-to-bwip-js mapping

| ZXing BarcodeFormat | bwip-js `bcid` | Note |
|---|---|---|
| `BarcodeFormat.EAN_13` (7) | `ean13` | |
| `BarcodeFormat.EAN_8` (6) | `ean8` | |
| `BarcodeFormat.UPC_A` (14) | `ean13` | Rendered as EAN-13 with leading zero |
| `BarcodeFormat.CODE_39` (2) | `code39` | |
| `BarcodeFormat.CODE_128` (4) | `code128` | |
| `BarcodeFormat.ITF` (8) | `interleaved2of5` | |
| `BarcodeFormat.QR_CODE` (11) | `qrcode` | |

## Affected Areas

This is a greenfield project. All files are new.

### Source files to create
- **`src/index.html`** — Shell HTML page. Contains `<link>` to `styles.css`, `<script>` to `app.js`, `<link rel="manifest">` to `manifest.json`, inline SW registration, the `x-data` Alpine.js root element, and `<!-- INCLUDE -->` directives for template partials.
- **`src/templates/list.html`** — Card list view. Empty state placeholder, card rows (`x-for`), add button, settings link.
- **`src/templates/view.html`** — Single card view. Barcode image, code text, edit/delete buttons.
- **`src/templates/form.html`** — Add/edit form (shared template). Name, color picker, code input, type dropdown, camera capture input, save button. Toggled via a `mode` prop (`'add'` or `'edit'`).
- **`src/templates/settings.html`** — Settings view. Raw JSON textarea (read-only) + copy button, restore textarea + restore button with confirmation.
- **`src/templates/toast.html`** — Toast container (top-right fixed, x-for over toasts array).
- **`src/app.js`** — Application logic. Alpine.js `x-data` store with reactive state: `cards` array, `currentPage`, `currentCardId`, `toasts`, form state. Functions: `loadCards()`, `saveCards()`, `addCard()`, `updateCard()`, `deleteCard()`, `renderBarcode()`, `autoDetectType()`, `scanBarcode()`, `computeTextColor()`, `showToast()`, `exportJSON()`, `restoreFromJSON()`. Hash routing: `window.addEventListener('hashchange', ...)`. Imports from `bwip-js` and `@zxing/library`.
- **`src/styles.css`** — Component classes and overrides. Imports `../vendor/marx-css/marx.css` via esbuild. Classes for: `.card-row` (full-width, colored background), `.barcode-container` (centered, max-width), toast positioning, view transitions. Utility for card list empty state.
- **`src/sw.js`** — Service worker. Network-first caching strategy. `install` event: pre-cache shell. `fetch` event: try network, fall back to cache, update cache on success.

### Build output files (in `dist/`)
- **`dist/index.html`** — Assembled single-page HTML with all template partials inlined. Contains `<link>` to `styles.css`, `<script>` to `app.js`, `<link rel="manifest">` to `manifest.json`, inline SW registration.
- **`dist/app.js`** — esbuild bundle of `src/app.js`. External dependencies (alpinejs, bwip-js, @zxing/library) bundled inline.
- **`dist/styles.css`** — esbuild bundle of `src/styles.css` importing `vendor/marx-css/marx.css`.
- **`dist/sw.js`** — Copied from `src/sw.js` (no bundling needed for SW).
- **`dist/manifest.json`** — PWA manifest. `name`, `short_name`, `start_url`, `display: standalone`, `theme_color` (moss green), `icons` (placeholder SVG).
- **`dist/icon.svg`** — Placeholder app icon (simple card/ticket shape).

### Build configuration
- **`package.json`** — Update `scripts.build` to run esbuild for JS and CSS, then a Node helper script that reads `src/index.html`, resolves `<!-- INCLUDE -->` directives from `src/templates/`, and writes the assembled `dist/index.html`. Copy `manifest.json`, `icon.svg`, and `sw.js` to `dist/`.

### Files NOT affected
- `vendor/marx-css/` — Read-only dependency, consumed by esbuild CSS import.
- `node_modules/` — External dependencies.
- `pnpm-lock.yaml` — No new dependencies needed (all already installed).

## Risks & Unknowns

### Risks
- **bwip-js Code 39 rendering**: Code 39 in bwip-js expects uppercase and a specific character set. ZXing might return mixed-case or extended chars that bwip-js rejects. Mitigation: validate and normalize before rendering, catch errors gracefully.
- **ITF barcode naming**: bwip-js uses `interleaved2of5` as the bcid. ITF is technically Interleaved Two of Five. Confirming this is the correct bcid for generic ITF (not ITF-14). Mitigation: test with known ITF codes during implementation.
- **@zxing/library maintenance mode**: The library is in maintenance mode ("DIY"). No known issues for our use case (static image decode), but future browser compatibility is uncertain.
- **iOS Safari file capture**: `<input type="file" capture="environment">` behavior varies across mobile browsers. On iOS, `capture` attribute is not always respected — it may show the file picker instead of launching the camera directly. Mitigation: this is acceptable; the user can still select a photo.
- **Service worker cache invalidation**: Network-first means updates appear on refresh. But if the user is offline during an update, the old cached version persists until the next online refresh. Acceptable for a personal tool.

### Unknowns
- **Marx CSS future compatibility**: Using a vendored copy pins us to v4.1.1. This is intentional and safe for a static build.
- **localStorage in privacy-hardened browsers**: Some browsers (Firefox with `privacy.resistFingerprinting`, old Android WebViews) block/break localStorage entirely. FR17 handles the failure gracefully, but the app would lose persistence across sessions. The backup/restore screen (FR18) provides a manual workaround.
- **EAN-13/UPC-A auto-detection edge case**: 12-digit numeric codes are auto-detected as EAN_13 (padded to 13 with leading zero). bwip-js renders UPC-A identically to EAN-13 (same symbology), so no practical difference. Acceptable.

### Assumptions
- The user's browser supports service workers and `localStorage`. All modern browsers do.
- The user's device has a camera for barcode scanning. Fallback to manual entry is always available.
- `URL.createObjectURL()` works for creating blob URLs from file inputs. Supported in all modern browsers.
