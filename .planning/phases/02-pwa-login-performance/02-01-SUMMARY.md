---
phase: 02-pwa-login-performance
plan: "01"
subsystem: auth
tags: [performance, stale-while-revalidate, auth, login, localStorage]
dependency_graph:
  requires: []
  provides: [stale-while-revalidate-boot, bg-sync-rerender]
  affects: [js/auth.js]
tech_stack:
  added: []
  patterns: [stale-while-revalidate, fire-and-forget async, background rerender]
key_files:
  created: []
  modified:
    - js/auth.js
decisions:
  - "Cache detection uses simfin_last_inputs key (INPUTS_AUTOSAVE_KEY from app.js) — single key check is sufficient"
  - "Background re-render includes renderCarteira, renderGoals, renderTrack, calc — NOT autoRestoreInputs (avoids clobbering in-progress user input)"
  - "reminderUpdateUI/reminderCheckDue only called in initial render, not after background sync"
  - "scenarioAutoTouch() call removed as part of this plan (scenario UI no longer exists)"
  - "Bare catch(e){} blocks replaced with console.error('[init]', e) in all init try/catch"
metrics:
  duration: "5m"
  completed_date: "2026-04-05"
  tasks_completed: 1
  files_changed: 1
---

# Phase 02 Plan 01: Stale-While-Revalidate Boot Sequencing Summary

## One-Liner

Refactored authOnLogin to render immediately from localStorage cache while syncing Supabase in the background, eliminating the blocking load screen for returning users.

## What Was Done

The app previously blocked all UI rendering behind a full Supabase sync on every login. This caused a perceptible loading delay even for returning users who already had data in localStorage. The refactor adds a cache detection step: if `simfin_last_inputs` exists in localStorage, the overlay is hidden immediately and all render functions are called synchronously, then `dbPullAll()` is fired as a background task. When the background sync resolves, only the data-dependent modules (renderCarteira, renderGoals, renderTrack, calc) re-render silently. First-time users (no localStorage cache) retain the original blocking behavior — the loading overlay stays until sync completes.

Additionally, the bare `catch(e) {}` blocks in the init sequence were replaced with `console.error('[init]', e)` to surface previously-swallowed errors, and the orphaned `scenarioAutoTouch()` call was removed.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Implement stale-while-revalidate authOnLogin | 3ea7f05 | js/auth.js |

## Changes Made

**js/auth.js** — `authOnLogin` function replaced with two-path implementation:

- **Cache path** (returning user): `authHideOverlay()` called immediately after migration; all render functions called; `dbPullAll()` fired without await; `.then()` re-renders data modules; `.catch()` logs `[bg-sync]` errors.
- **No-cache path** (first login): `authShowSyncLoading(true)` shown; `await dbPullAll()` blocks; overlay hidden; render functions called — identical to previous behavior.

## Verification

```
grep -c "simfin_last_inputs" js/auth.js   # 1
grep -c "await dbPullAll" js/auth.js       # 1
grep -c "\[bg-sync\]" js/auth.js           # 5
grep -c "authShowSyncLoading" js/auth.js   # 3 (definition + show + hide)
grep -c "catch(e) {}" js/auth.js           # 0
grep -c "scenarioAutoTouch" js/auth.js     # 0
node --check js/auth.js                    # PASS
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed bare catch blocks and removed scenarioAutoTouch call**
- **Found during:** Task 1 (reading current auth.js state)
- **Issue:** Current auth.js still had `catch(e) {}` bare blocks and `scenarioAutoTouch()` call — plan 01-04 had not been applied to this worktree
- **Fix:** Applied both fixes as part of implementing the new authOnLogin (the new function body in the plan already included the corrected catch blocks and excluded scenarioAutoTouch)
- **Files modified:** js/auth.js
- **Commit:** 3ea7f05

## Known Stubs

None.

## Self-Check: PASSED

- js/auth.js modified: FOUND
- Commit 3ea7f05: FOUND
- simfin_last_inputs cache check: FOUND (1 occurrence)
- await dbPullAll only in no-cache path: FOUND (1 occurrence)
- [bg-sync] error logging: FOUND (5 occurrences)
- No bare catch blocks: CONFIRMED (0 occurrences)
- scenarioAutoTouch removed: CONFIRMED (0 occurrences)
- Syntax check passed: CONFIRMED
