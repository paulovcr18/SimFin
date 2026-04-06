# Phase 2: PWA Login Performance - Context

**Gathered:** 2026-04-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the PWA login and initial load perceptibly faster by implementing stale-while-revalidate: render immediately from localStorage cache, sync Supabase in the background. Also simplify the SheetJS injection guard now that a static script tag exists in index.html (added in Phase 1).

This phase does NOT change the sync logic itself — only the sequencing of when the UI becomes visible vs. when sync completes.

</domain>

<decisions>
## Implementation Decisions

### Stale-While-Revalidate Strategy
- Render the app immediately after `INITIAL_SESSION` is confirmed using localStorage cache — do NOT wait for `dbPullAll()` to complete
- After `dbPullAll()` completes in background, re-render only affected modules silently (no toast, no flicker)
- First-login exception: if localStorage is empty (no cached data), show the loading overlay until `dbPullAll()` completes — current behavior preserved for first-time users

### Loading Overlay
- Overlay disappears as soon as localStorage data is available (not waiting for Supabase)
- On first login (no cache), overlay stays until `dbPullAll()` completes — acceptable since there's nothing to show yet
- Do NOT replace overlay with per-module skeletons (out of scope)

### SheetJS Injection Guard
- Simplify `carteiraParseXLSX()` in `js/carteira.js`: check `if (window.XLSX)` and use directly — the static `<script>` tag in `index.html` (Phase 1) guarantees availability
- Remove the dynamic `document.createElement('script')` injection logic (no longer needed)
- Keep the `if (!window.XLSX)` check as a guard but instead of injecting, just throw a clear error

### Initialization Sequence (new authOnLogin flow)
1. `dbMigrateIfNeeded()` — synchronous, must complete before any render (schema safety)
2. Detect if localStorage has cached data → if yes, render immediately and hide overlay
3. Fire `dbPullAll()` as background async task (not awaited)
4. When `dbPullAll()` resolves: re-render only `renderCarteira()`, `renderGoals()`, `renderTrack()`, `calc()` — NOT input fields (avoid resetting user's in-progress inputs)
5. If no localStorage cache (first login): await `dbPullAll()` before first render (current behavior)

### Claude's Discretion
- How to detect "localStorage has data" — check for existence of the primary simfin_* keys
- How to handle `dbPullAll()` errors in background mode — log to console, do not surface as blocking error to user

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `js/auth.js` `authOnLogin()` — the function to refactor (lines 215–230)
- `js/auth.js` `authShowOverlay()` / `authHideOverlay()` — overlay control functions
- `js/db.js` `dbPullAll()` — returns a Promise; currently awaited; can be fire-and-forget
- `js/db.js` `dbMigrateIfNeeded()` — must stay synchronous/awaited
- `js/storage.js` `getInputs()` / `applyInputs()` — localStorage key management; check these keys to detect cached data
- `js/carteira.js` `carteiraParseXLSX()` lines 1141–1148 — SheetJS injection code to simplify

### Established Patterns
- `authOnLogin` already has try/catch per module (fixed in Phase 1 — now logs errors)
- `dbPullAll()` uses `Promise.allSettled` internally — safe to not await
- All render functions (`renderCarteira`, `renderGoals`, `renderTrack`, `calc`) are idempotent — safe to call twice

### Integration Points
- `js/auth.js` `onAuthStateChange` handler — calls `authOnLogin(user)` on SIGNED_IN
- `authHideOverlay()` — call earlier (after cache check, not after Supabase sync)
- `js/carteira.js` lines 1141–1148 — SheetJS dynamic injection to simplify

</code_context>

<specifics>
## Specific Ideas

- The primary localStorage key to check for cached data is `simfin_inputs` (set by `applyInputs`) or `simfin_user_config` — if either exists, the user has prior session data
- `dbPullAll()` in background: wrap in `.catch(e => console.error('[bg-sync]', e))` to prevent unhandled rejections

</specifics>

<deferred>
## Deferred Ideas

- Per-module loading skeletons — own phase if ever needed
- Migrating from localStorage to IndexedDB — backlog (999.1)
- Parallel migration + pull — user rejected (too risky)

</deferred>
