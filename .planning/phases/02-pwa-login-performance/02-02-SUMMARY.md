---
phase: 02-pwa-login-performance
plan: 02
subsystem: carteira
tags: [sheetjs, xlsx, dead-code, performance, security]
dependency_graph:
  requires: [01-03-PLAN]
  provides: [carteiraParseXLSX-simplified]
  affects: [js/carteira.js]
tech_stack:
  added: []
  patterns: [guard-and-throw, window.XLSX-explicit]
key_files:
  created: []
  modified:
    - js/carteira.js
decisions:
  - "Use guard-and-throw instead of dynamic injection: SheetJS guaranteed by static script tag in index.html"
  - "Use window.XLSX explicitly rather than bare XLSX to make dependency visible in code"
metrics:
  duration: "3m"
  completed_date: "2026-04-05"
  tasks_completed: 1
  files_modified: 1
---

# Phase 02 Plan 02: Simplify carteiraParseXLSX Summary

**One-liner:** Removed dynamic SheetJS script injection from carteiraParseXLSX, replacing it with a guard-and-throw that uses the static window.XLSX guaranteed by index.html.

## What Was Done

`carteiraParseXLSX()` in `js/carteira.js` previously injected a `<script>` tag at runtime to load SheetJS from the CDN whenever `window.XLSX` was absent. This was dead weight after Phase 1 added a static `<script>` tag with SRI integrity hash to `index.html`.

The dynamic injection block was replaced with a simple guard:

- If `window.XLSX` is not available, throw a clear descriptive error rather than silently inject an unverified CDN script
- All parse calls now use `window.XLSX.read` and `window.XLSX.utils.sheet_to_json` explicitly

## Changes

**js/carteira.js** — `carteiraParseXLSX` function (lines 1160–1183):
- Removed: `await new Promise(...)` with `document.createElement('script')`, CDN URL, `s.onload/onerror`, `document.head.appendChild`
- Added: `throw new Error('[SimFin] SheetJS (window.XLSX) não disponível...')` guard
- Changed: `XLSX.read` → `window.XLSX.read`, `XLSX.utils` → `window.XLSX.utils`

Net diff: 3 insertions, 9 deletions (-6 lines).

## Acceptance Criteria Verification

- `grep -c "createElement" js/carteira.js` in `carteiraParseXLSX` scope → 0 (only unrelated uses at lines 200, 235)
- `grep -c "cdn.jsdelivr.net/npm/xlsx" js/carteira.js` → 0
- `grep -c "window.XLSX" js/carteira.js` → 4 (guard + read + utils.sheet_to_json + comment)
- `grep -c "throw new Error.*SheetJS" js/carteira.js` → 1
- `grep -c "async function carteiraParseXLSX" js/carteira.js` → 1

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- File exists: js/carteira.js — FOUND
- Commit exists: 3546fc6 — FOUND
