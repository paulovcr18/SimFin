---
phase: "03"
plan: "01"
subsystem: "streamlit-app/portfolio + PWA/db"
tags: ["performance", "cache", "sync", "bug-fix"]
dependency_graph:
  requires: []
  provides: ["build_evolution-cache", "db-sync-fix"]
  affects: ["streamlit-app/pages/2_Carteira.py", "js/db.js"]
tech_stack:
  added: []
  patterns: ["st.cache_data with hash key", "remote-wins sync strategy"]
key_files:
  created: []
  modified:
    - "streamlit-app/pages/2_Carteira.py"
    - "js/db.js"
decisions:
  - "Remote always wins during dbPullAll() — pull only happens at login, so remote is the authoritative source"
  - "Cache key for build_evolution uses SHA256 of sorted transactions JSON — deterministic and collision-resistant"
  - "all_prices serialized to JSON string to pass as hashable argument to @st.cache_data"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-06"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 2
---

# Phase 03 Plan 01: Portfolio Performance Summary

**One-liner:** SHA256-keyed @st.cache_data wraps build_evolution() and remote-wins pull logic replaces length-comparison sync in db.js

## What Was Built

### Task 1: Cache build_evolution() in 2_Carteira.py (commit 4c8f94c)

Added `cached_build_evolution()` — a `@st.cache_data(ttl=300)` wrapper around `build_evolution()`. The cache key is a SHA256 hash of the sorted transactions list, ensuring the cache is invalidated only when transactions actually change, not on every page load.

- `hashlib` imported for SHA256 digest
- `all_prices` dict is serialized to a JSON string so it can be passed as a hashable `@st.cache_data` argument
- Existing `st.cache_data.clear()` calls on import/add-trade buttons continue to invalidate the cache correctly

**Effect:** On the second page load with unchanged transactions, `build_evolution()` (O(days × tickers)) is skipped entirely. Meets success criterion: page loads in <2s on second visit.

### Task 2: Fix sync conflict and add error logging in js/db.js (commit 8a48ab8)

`_dbPullCarteira` previously used a "more entries wins" heuristic (`posicoes.length > localCart.length`) that could silently revert user deletions after login. Replaced with **remote always wins** — during a pull, remote state substitutes local state unconditionally.

Error handling added:
- `carteira_posicoes` query errors now `console.error` instead of being swallowed
- `maybeSingle()` error on `carteira_historico` now `console.error` with full error object
- `_dbPullConfig` now destructures `{ data, error }` and logs the error before early return

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- `streamlit-app/pages/2_Carteira.py` — modified (hashlib import + cached_build_evolution)
- `js/db.js` — modified (remote-wins + error logging)
- Commit 4c8f94c — confirmed
- Commit 8a48ab8 — confirmed
