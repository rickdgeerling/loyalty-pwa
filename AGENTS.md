# Loyalty Cards app

An offline-first, static-hosted PWA for managing loyalty cards:

- Alpine.js reactive SPA with hash routing (#list, #add, #view/<id>, #edit/<id>, #settings)
- bwip-js client-side barcode rendering (EAN-13, EAN-8, Code 39, Code 128, ITF, QR Code)
- @zxing/library camera-based barcode scanning with automatic type detection
- localStorage persistence with backup/restore via JSON import/export
- esbuild build pipeline: JS/CSS bundling, HTML template assembly, static asset copying
- Service worker: network-first + 3s timeout, pre-cache, offline fallback
- marx-css classless base with component classes for cards, toasts, layout
