---
phase: 01-dead-code-removal
plan: "02"
subsystem: infra
tags: [service-worker, pwa, caching, offline, sheetjs, brapi, supabase]

# Dependency graph
requires: []
provides:
  - Service Worker with network-only bypass for live API domains (brapi.dev, Yahoo Finance, Supabase Edge Functions)
  - Deduped LOCAL_ASSETS array (./js/db.js appears exactly once)
  - SheetJS CDN preloaded on SW install to eliminate runtime download delay
affects:
  - 01-03
  - 01-04
  - Any phase touching sw.js or fetch caching behavior

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Network-only bypass: check url.hostname/url.href before event.respondWith to skip caching for live data APIs"
    - "NETWORK_ONLY_HOSTS for exact-hostname matching, NETWORK_ONLY_PATHS for path-substring matching"

key-files:
  created: []
  modified:
    - sw.js

key-decisions:
  - "Use url.hostname exact match (not contains) for domain-level API bypass to avoid false positives"
  - "Use url.href.includes() for Supabase Edge Function path check since the path is the discriminator, not the hostname"
  - "Add SheetJS to LOCAL_ASSETS rather than CDN_ASSETS so it is eagerly cached on install, not lazily on first use"

patterns-established:
  - "Pattern: API bypass goes BEFORE event.respondWith — returning early lets the browser fall through to its default network fetch"

requirements-completed: []

# Metrics
duration: 5min
completed: 2026-04-05
---

# Phase 01 Plan 02: Service Worker API Bypass and Asset Deduplication Summary

**Service Worker fixed with network-only bypass for brapi.dev/Yahoo Finance/Supabase Edge Functions, duplicate db.js removed, and SheetJS CDN preloaded on install**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-05T20:00:00Z
- **Completed:** 2026-04-05T20:05:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Removed duplicate `./js/db.js` entry from LOCAL_ASSETS (was causing a redundant network request on every SW install)
- Added `xlsx@0.18.5` CDN URL to LOCAL_ASSETS so SheetJS is preloaded at install time, eliminating ~1 MB runtime download delay when user first imports an XLSX file
- Added network-only bypass in the fetch handler that prevents brapi.dev, query1.finance.yahoo.com, and Supabase Edge Function responses from ever being cached — fixes the stale stock price UX bug

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove duplicate db.js and add SheetJS to LOCAL_ASSETS** - `0b80aed` (fix)
2. **Task 2: Add network-only bypass for API domains in fetch handler** - `c8c81cb` (feat)

## Files Created/Modified

- `sw.js` - Fixed LOCAL_ASSETS (deduped db.js, added SheetJS CDN), added network-only bypass block in fetch handler

## Decisions Made

- Used `url.hostname === h || url.hostname.endsWith('.' + h)` pattern for domain matching to also cover subdomains (e.g., api.brapi.dev) without false positives
- Used `url.href.includes(p)` for Supabase path check since Supabase Edge Functions share the base supabase.co hostname with other services we do want to cache
- SheetJS placed in LOCAL_ASSETS (cache.addAll) rather than CDN_ASSETS (fetch + cache.put) so it is guaranteed cached synchronously on install

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- sw.js is clean: no duplicate assets, no stale API caching, SheetJS preloaded
- Ready for Phase 01 Plans 03 and 04 (other dead-code removal tasks)

---
*Phase: 01-dead-code-removal*
*Completed: 2026-04-05*
