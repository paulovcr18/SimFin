# Phase 1: Dead Code Removal - Context

**Gathered:** 2026-04-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Remove all unused code, fix features that exist in the UI but don't work, and reduce security/maintenance risk surface. The primary product is the PWA — Streamlit is secondary. This phase does NOT add new features; it only removes/fixes existing broken state.

</domain>

<decisions>
## Implementation Decisions

### Scenario Feature (UI de Cenários)
- Remove the "Salvar Cenário" button and all scenario management UI from the PWA — it promises a feature that doesn't exist (save only stores name+timestamp, not inputs)
- Do NOT touch the Supabase schema — `simulacoes.versoes jsonb` stays untouched (schema migration is unnecessary risk)
- No attempt to implement scenarios properly in this phase

### Parallel Apps (Streamlit + tracker)
- Delete `tracker/` directory completely — 100% redundant with streamlit-app, no other users
- Keep `streamlit-app/` in the repo but add a deprecation notice to the README — product-level decision, deletion is irreversible
- The deprecation notice should make clear that the PWA (`index.html`) is the main product

### SheetJS Security + Preload
- Add SRI integrity hash to the SheetJS CDN `<script>` tag in `index.html`
- Also add SheetJS to the Service Worker `LOCAL_ASSETS` list — resolves both security and download delay in one step
- No build step change required — SRI hash is a static attribute

### Service Worker Cache
- Add network-only bypass for API domains: `brapi.dev`, `query1.finance.yahoo.com`, and `supabase.co/functions` — these should never be cached (stale stock prices are a UX problem)
- Remove the duplicate `./js/db.js` entry from `LOCAL_ASSETS` in `sw.js` (line 34)
- Strategy: check request URL in the fetch handler before deciding to cache

### Claude's Discretion
- How exactly to structure the SW domain exclusion (URL startsWith vs hostname check) — Claude decides
- Exact wording of the Streamlit deprecation notice — Claude decides

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `sw.js` — Service Worker with `LOCAL_ASSETS` array and fetch handler; modify in place
- `js/storage.js` — Contains scenario save/load logic (`scenarioSave`, `getInputs`, `applyInputs`) and toast UI
- `js/db.js` — Supabase sync layer; `dbPullAll`, `dbDebounce`; the `simulacoes` table CRUD is here
- `index.html` — Main PWA entry point; SheetJS CDN script tag is here

### Established Patterns
- No build step — all changes are direct file edits to static files
- SheetJS is dynamically injected at runtime in `js/carteira.js` lines 1141–1148 via `document.createElement('script')`
- Service Worker fetch handler at `sw.js` lines 79–109 uses cache-first strategy for all GET requests
- Scenario save in `js/storage.js` lines 64–79: only saves `{ name, createdAt, updatedAt }` to `user_config.scenario`

### Integration Points
- `sw.js` `LOCAL_ASSETS` array: where SheetJS should be added
- `index.html` SheetJS script tag: where SRI hash is added
- `js/storage.js` `scenarioSave` / scenario UI: the functions/elements to remove
- `sw.js` fetch handler: where API domain exclusions are added

</code_context>

<specifics>
## Specific Ideas

- Network-only for the Supabase Edge Function URL (`qaopienbsmssjosttucn.supabase.co/functions`) as well — it returns real-time quotes
- The duplicate `./js/db.js` is on line 34 of `sw.js` specifically

</specifics>

<deferred>
## Deferred Ideas

- Implementing scenario versioning properly (save actual inputs, not just metadata) — own phase
- Deleting `streamlit-app/` entirely — user wants to keep for now
- Cache-with-TTL strategy for SW — user chose network-only (simpler)

</deferred>
