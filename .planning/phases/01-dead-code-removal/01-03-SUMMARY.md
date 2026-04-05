---
phase: 01-dead-code-removal
plan: "03"
subsystem: security
tags: [sri, cdn, sheetjs, security, index.html]
dependency_graph:
  requires: []
  provides: [sheetjs-sri-hash]
  affects: [index.html]
tech_stack:
  added: []
  patterns: [SRI integrity hash, crossorigin anonymous]
key_files:
  created: []
  modified:
    - index.html
decisions:
  - "Used CASE B path: no static SheetJS script tag existed; added new one in head after CDN tags"
  - "SRI hash used exactly as specified in plan: sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw"
  - "Placed tag after supabase-js CDN script and before local js/ scripts"
metrics:
  duration: "3m"
  completed_date: "2026-04-05"
  tasks_completed: 1
  files_changed: 1
---

# Phase 01 Plan 03: Add SRI Integrity Hash to SheetJS Script Tag Summary

## One-Liner

Added static SheetJS CDN script tag with sha384 SRI integrity hash and crossorigin attribute to index.html head section.

## What Was Done

SheetJS was previously only loaded dynamically at runtime inside `js/carteira.js` with no integrity verification. A CDN compromise or unintended version swap could have injected arbitrary code. This plan added a static `<script>` tag with a full SRI integrity attribute so browsers will refuse execution if content does not match the expected hash.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add SRI integrity hash to SheetJS script tag in index.html | de8eb48 | index.html |

## Changes Made

**index.html** — Added the following script tag after the Supabase CDN script, before local `js/` scripts:

```html
<script
  src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"
  integrity="sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw"
  crossorigin="anonymous"
></script>
```

This also makes `window.XLSX` available at page load, so the `if (!window.XLSX)` guard in `js/carteira.js` line 1141 will short-circuit and the dynamic injection will never execute.

## Verification

```
grep -n 'xlsx@0.18.5' index.html
# 22:  src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"

grep -n 'sha384-' index.html
# 23:  integrity="sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw"

grep -n 'crossorigin="anonymous"' index.html
# 24:  crossorigin="anonymous"
```

## Deviations from Plan

None - plan executed exactly as written. CASE B applied (no pre-existing static SheetJS script tag in index.html).

## Known Stubs

None.

## Self-Check: PASSED

- index.html modified: FOUND
- Commit de8eb48: FOUND
- xlsx@0.18.5 tag present: FOUND
- sha384 integrity hash present: FOUND
- crossorigin="anonymous" present: FOUND
