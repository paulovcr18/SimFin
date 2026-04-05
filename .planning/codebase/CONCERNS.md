---
focus: concerns
generated: 2026-04-05
---

# Codebase Concerns

**Analysis Date:** 2026-04-05

## Security Considerations

**Hardcoded Supabase credentials in client-side JavaScript:**
- Risk: The Supabase project URL and anon key are committed in plain text as constants
- Files: `js/auth.js` (lines 4–5), `js/carteira.js` (line 11)
- Current mitigation: The key is Supabase's public anon key, which is designed to be client-visible and relies on Row Level Security (RLS) for data isolation — RLS is enabled in `schema.sql`. However, the project URL and key are version-controlled and visible to anyone who clones the repo, which allows crafting direct Supabase API calls if RLS policies have any gaps.
- Recommendations: Move to a build-time env-var injection approach (e.g., a thin build step that replaces placeholders). Add explicit RLS gap tests. Rotate key if ever leaked.

**SUPABASE_ANON key exposed in `js/carteira.js`:**
- Risk: The Edge Function endpoint URL and the anon key are both defined as module-level constants in `js/carteira.js` (COTACOES_FN, line 11) and sent as a plain `apikey` header in fetch calls (line 317). The CORS policy on the Edge Function uses `'Access-Control-Allow-Origin': '*'` (`supabase/functions/cotacoes/index.ts` line 17), which means any origin can call it.
- Files: `js/carteira.js`, `supabase/functions/cotacoes/index.ts`
- Current mitigation: Edge Function only proxies public data (Yahoo Finance / Tesouro Nacional), so abuse risk is limited to rate-limit burning.
- Recommendations: Add rate-limiting inside the Edge Function; restrict allowed origins.

**No CSRF protection on Streamlit forms:**
- Risk: The Streamlit app uses Supabase email/password auth with bare `st.text_input` + `st.button` with no CSRF token or honeypot. Session stored only in `st.session_state` (ephemeral).
- Files: `streamlit-app/core/auth.py`
- Current mitigation: Streamlit's own session isolation provides some protection. The app is not production-exposed.
- Recommendations: Acceptable for an internal tool; document clearly if ever exposed publicly.

---

## Tech Debt

**Duplicate `js/db.js` entry in Service Worker asset list:**
- Issue: `sw.js` lists `'./js/db.js'` twice in `LOCAL_ASSETS` (lines 31 and 34). This causes a redundant fetch/cache write on every service worker install.
- Files: `sw.js` (lines 31, 34)
- Impact: Minor — adds one extra network request during SW install. No functional breakage.
- Fix approach: Remove the duplicate entry at line 34.

**Sync conflict resolution uses "larger array wins" heuristic:**
- Issue: In `js/db.js`, `_dbPullCarteira()` (lines 120–137) resolves conflicts between local and remote data using `posicoes.length > localCart.length` — whichever array is longer wins. Same logic for `negociacoes` and `movimentacoes`. This is not a safe last-write-wins strategy.
- Files: `js/db.js` (lines 118–138)
- Impact: If a user deletes items locally (reducing array length), the next login will restore the deleted items from Supabase. Conversely, if remote has fewer items, local may silently win and never propagate deletions.
- Fix approach: Use `atualizado_em` timestamps for conflict resolution, or implement per-record versioning.

**Silent swallowing of all init errors in `authOnLogin`:**
- Issue: All app initialization calls in `js/auth.js` (lines 222–228) are wrapped in bare `try {} catch(e) {}` with no error logging. Any failure in `calc()`, `renderCarteira()`, `renderGoals()`, etc. is completely invisible.
- Files: `js/auth.js` (lines 222–228)
- Impact: If a rendering function throws, the relevant app section silently stays blank. Debugging is difficult.
- Fix approach: At minimum, log the error: `catch(e) { console.error('[init]', e); }`.

**`js/carteira.js` is a 1,600-line monolith:**
- Issue: The file mixes portfolio state management, quote fetching, CSV/XLSX parsing, B3 import logic, Tesouro Direto computations, and UI rendering.
- Files: `js/carteira.js`
- Impact: High cognitive load. Any change risks breaking unrelated behaviour. Hard to test in isolation.
- Fix approach: Split into `carteira-state.js` (CRUD), `carteira-import.js` (file parsing), `carteira-quotes.js` (API calls), and `carteira-ui.js` (rendering).

**`meta_insert` uses `int(time.time() * 1000)` as primary key:**
- Issue: `streamlit-app/core/db.py` line 40 generates integer IDs from the current epoch millisecond. On the JS side, the same pattern is used in `goals.js`. This can produce collisions if two records are inserted within the same millisecond, and it exposes internal timing information.
- Files: `streamlit-app/core/db.py` (line 40)
- Impact: Low probability collision in practice, but not safe under concurrent inserts. The `metas` table uses `bigint PRIMARY KEY` so UUID can't simply replace it without a migration.
- Fix approach: Generate a UUID on the server side via `gen_random_uuid()` and use `uuid` as the primary key in a future schema migration, or add a sequence.

**XLSX library loaded dynamically at runtime:**
- Issue: SheetJS (`xlsx@0.18.5`) is injected into the DOM by `carteiraParseXLSX()` at import time (`js/carteira.js` lines 1141–1148). This defers a ~1 MB download to the moment the user picks a file and introduces a potential race condition if two XLSX imports happen simultaneously.
- Files: `js/carteira.js` (lines 1139–1160)
- Impact: Poor UX (spinner delay), and `window.XLSX` check is not concurrent-safe.
- Fix approach: Preload SheetJS at page load or include it in the service worker `LOCAL_ASSETS`.

**Duplicate price-fetching logic in `tracker/` vs `streamlit-app/`:**
- Issue: Both `tracker/portfolio_tracker.py` and `streamlit-app/core/prices.py` implement identical yfinance caching logic (same `CACHE_DIR`, same 4-hour TTL, same parquet strategy). The tracker was the original standalone script; the streamlit-app is the rewrite. Both coexist.
- Files: `tracker/portfolio_tracker.py`, `streamlit-app/core/prices.py`
- Impact: Bug fixes or yfinance API changes must be applied to two places. Maintenance burden.
- Fix approach: The `tracker/` directory appears to be a legacy artifact. Either delete it or explicitly mark it as deprecated.

**`sys.path.insert(0, ".")` in Streamlit page files:**
- Issue: Every Streamlit page (`pages/1_Simulador.py`, `pages/2_Carteira.py`, `pages/3_Acompanhamento.py`) opens with `import sys; sys.path.insert(0, ".")`. This is a path hack that only works when Streamlit is launched from `streamlit-app/`.
- Files: `streamlit-app/pages/1_Simulador.py` (line 4), `streamlit-app/pages/2_Carteira.py` (line 4), `streamlit-app/pages/3_Acompanhamento.py` (line 4)
- Impact: Running from a different working directory breaks all page imports silently.
- Fix approach: Install the `core` package in editable mode (`pip install -e .`) with a proper `pyproject.toml` or use Streamlit's `PYTHONPATH` in `.streamlit/config.toml`.

---

## Known Issues / Fragile Areas

**Yahoo Finance API instability (Edge Function):**
- Issue: The Edge Function in `supabase/functions/cotacoes/index.ts` calls `query1.finance.yahoo.com/v7/finance/spark` — an unofficial, undocumented Yahoo Finance endpoint. Yahoo periodically changes response formats or blocks automated access.
- Files: `supabase/functions/cotacoes/index.ts` (lines 141–148)
- Impact: If Yahoo changes the response shape, all B3 stock quotes in the main app will silently return empty results. The fallback to BRAPI requires a user-supplied token.
- Fix approach: Add response shape validation with a descriptive error; monitor the endpoint; consider a more stable paid API for production.

**Tesouro Direto CKAN column detection is purely heuristic:**
- Issue: Both `supabase/functions/cotacoes/index.ts` and `.github/scripts/update_tesouro.py` detect CKAN datastore column names using string matching heuristics (e.g., find column whose name contains both "taxa" and "compra"). If Tesouro Nacional renames columns, detection will silently fail and return null values for all prices.
- Files: `supabase/functions/cotacoes/index.ts` (lines 27–34, 77–82), `.github/scripts/update_tesouro.py` (lines 52–59)
- Impact: Tesouro Direto positions would show R$ 0 or "indisponível" with no visible error to the user.
- Fix approach: Add a validation step that asserts required columns were found and throw an explicit error if not; alert via GH Action failure.

**Data/price stale check uses file modification time instead of cache timestamp:**
- Issue: `streamlit-app/core/prices.py` `_fresh()` checks the parquet file's OS modification time (line 29). If the file is touched by backup tools, deployment scripts, or filesystem operations, the 4-hour TTL resets artificially.
- Files: `streamlit-app/core/prices.py` (lines 28–29)
- Impact: Could cause excessive yfinance requests or never-refresh if mtime is manipulated.
- Fix approach: Store `fetched_at` inside the parquet metadata or a sidecar `.json` file.

**`_dbPullCarteira` uses `maybeSingle()` on `carteira_historico` but the table has `user_id` as primary key:**
- Issue: `js/db.js` line 105 calls `.maybeSingle()` correctly for a one-row-per-user table, but then checks `histRes.value.data` without handling the case where `maybeSingle()` returns an error (e.g., connection failure). Only `status === 'fulfilled'` is checked; Supabase errors inside a fulfilled `Promise.allSettled` are not caught.
- Files: `js/db.js` (lines 103–138)
- Impact: A Supabase error response silently skips portfolio data restore.
- Fix approach: Check `!histRes.value.error` in addition to `histRes.value.data`.

**Service Worker caches all GET requests including dynamic API calls:**
- Issue: The `sw.js` fetch handler (lines 79–109) caches every successful GET response, including requests to `brapi.dev` and `query1.finance.yahoo.com`. A stale cached stock price could be served for an extended period after cache fill, especially in the "Cache First" path (line 87).
- Files: `sw.js` (lines 79–109)
- Impact: Users can see outdated stock prices without any indication.
- Fix approach: Exclude API quote endpoints from caching in the fetch handler, or add a max-age check on cached responses.

---

## Performance Bottlenecks

**Portfolio evolution computed day-by-day in Python for every page load:**
- Issue: `streamlit-app/core/portfolio.py` `build_evolution()` iterates over every calendar day from the first transaction to today to build a daily P&L series. For a portfolio started years ago, this is O(days × tickers) with per-day `price_on()` lookups into per-ticker DataFrames.
- Files: `streamlit-app/core/portfolio.py` (lines 44–100), `streamlit-app/pages/2_Carteira.py` (line 91)
- Impact: With a 5-year-old portfolio of 20 tickers, this iterates ~1,825 days × 20 assets = ~36,500 operations per page load. The `@st.cache_data` on `load_hist` caches DB reads but NOT `build_evolution()`.
- Fix approach: Wrap `build_evolution()` in `@st.cache_data(ttl=3600)` keyed on the transaction list hash, or vectorize using pandas merge/reindex.

**Supabase sync on every login blocks UI for multiple network round-trips:**
- Issue: `js/auth.js` `authOnLogin()` runs `dbMigrateIfNeeded()` and `dbPullAll()` sequentially (lines 216–217), blocking the loading screen. `dbPullAll()` itself fires 5 parallel Supabase queries (via `Promise.allSettled`) but waits for all of them before hiding the overlay.
- Files: `js/auth.js` (lines 215–218)
- Impact: On a slow connection, the app is blocked for the sum of the slowest Supabase response.
- Fix approach: Show the app immediately after `dbPullAll()` resolves and re-render incrementally; consider a stale-while-revalidate pattern.

---

## Test Coverage Gaps

**No automated tests for any JavaScript modules:**
- What's not tested: All of `js/payroll.js`, `js/projection.js`, `js/carteira.js`, `js/db.js`, `js/auth.js`, `js/tesouro-api.js` — the entire financial calculation and sync layer.
- Files: All files under `js/`
- Risk: Tax bracket changes, INSS/IRRF table updates, or CSV parsing bugs would go undetected.
- Priority: High — financial calculations are the core product value.

**No automated tests for Streamlit/Python modules:**
- What's not tested: `streamlit-app/core/calc.py` (INSS/IRRF computation), `streamlit-app/core/portfolio.py` (P&L calculation), `streamlit-app/core/prices.py` (cache logic).
- Files: `streamlit-app/core/`
- Risk: The Python port of the payroll calculator (`core/calc.py`) is independent from the JS original — a divergence would produce silent discrepancies between the two UIs.
- Priority: High — `calc.py` has no test-harness and no parity verification against `js/payroll.js`.

**No integration test for B3 CSV/XLSX import pipeline:**
- What's not tested: `carteiraImportarArquivo()` in `js/carteira.js`, covering the three detected B3 file formats (Posição, Negociação, Movimentação).
- Files: `js/carteira.js` (lines 820–1118)
- Risk: B3 changes column names or CSV encoding regularly; the parser would break silently.
- Priority: High — import is a primary user flow.

---

## Missing Critical Features

**No session refresh for Streamlit app:**
- Problem: `streamlit-app/core/auth.py` stores the Supabase session in `st.session_state` which is ephemeral (lost on page refresh or server restart). There is no token refresh logic; the `session` object expires after 1 hour. After expiry, Supabase DB calls will fail with 401 errors that propagate as unhandled exceptions.
- Files: `streamlit-app/core/auth.py`, `streamlit-app/core/db.py`
- Blocks: Sustained use of the Streamlit app beyond one session.

**No "forgot password" flow in Streamlit app:**
- Problem: The Streamlit auth UI (`streamlit-app/core/auth.py`) only offers login and signup. The main JS app has a full password-reset flow via email link; the Streamlit version has none.
- Files: `streamlit-app/core/auth.py`

**Scenario versioning is stored but never surfaced in the UI:**
- Problem: The `simulacoes` Supabase table has a `versoes jsonb` column, and the data model includes a `versions` array. The JS save/load code preserves this field, but there is no UI to view, restore, or compare versions.
- Files: `js/storage.js`, `js/db.js`, `schema.sql` (line 13)
- Blocks: The "version history" feature is effectively a stub.

**`user_config.scenario` is only metadata (name + timestamps), not actual inputs:**
- Problem: `scenarioSave()` in `js/storage.js` saves only `{ name, createdAt, updatedAt }` — not the simulation inputs themselves. The inputs are auto-saved separately under `INPUTS_AUTOSAVE_KEY`. There is therefore only one "current state" per user, not multiple named scenarios. The name/timestamp metadata creates an illusion of scenario management.
- Files: `js/storage.js` (lines 64–79), `js/db.js` (lines 296–303)
- Blocks: Multi-scenario comparison, which is advertised in the UI.

---

## Dependencies at Risk

**`xlsx@0.18.5` loaded from CDN without integrity hash:**
- Risk: SheetJS is fetched dynamically from `cdn.jsdelivr.net` with no `integrity` attribute. A CDN compromise or version swap could inject arbitrary code into the app.
- Files: `js/carteira.js` (line 1144)
- Impact: Arbitrary code execution in the context of a logged-in user.
- Migration plan: Add `integrity` hash via SRI, or vendor the file into `js/`.

**yfinance is an unofficial reverse-engineered library:**
- Risk: `yfinance` (`streamlit-app/requirements.txt`, `tracker/requirements.txt`) is not an official Yahoo Finance client. Yahoo has changed internal API structures multiple times and may break yfinance without notice.
- Files: `streamlit-app/requirements.txt`, `tracker/requirements.txt`
- Impact: Portfolio quotes and historical data would become unavailable.
- Migration plan: Consider Alpha Vantage (free tier), Brapi.dev (already used in the JS app), or a paid provider as a fallback.

**No `requirements.txt` version pins for critical packages:**
- Risk: `streamlit-app/requirements.txt` — pinning should be verified. If packages are unpinned or loosely pinned, a breaking release of `streamlit`, `plotly`, or `supabase-py` could break the app silently on next install.
- Files: `streamlit-app/requirements.txt`, `tracker/requirements.txt`
- Impact: Non-reproducible installs; CI/CD failure or silent regressions.
- Migration plan: Pin all direct dependencies to exact versions and generate a lockfile (`pip-compile` or `uv`).

---

*Concerns audit: 2026-04-05*
