---
focus: arch
generated: 2026-04-05
---

# Architecture

**Analysis Date:** 2026-04-05

## Pattern Overview

**Overall:** Dual-application monorepo — two independent front-ends sharing a single Supabase backend.

**Key Characteristics:**
- A **PWA (Progressive Web App)** built as a single `index.html` with vanilla JS modules handles the primary user-facing features offline-capable.
- A **Streamlit multi-page app** (`streamlit-app/`) is a Python rewrite of the same product, requiring authentication and targeting a cloud-deployed environment.
- Both applications share the same Supabase project (PostgreSQL + Auth + Edge Functions + Row Level Security).
- A standalone **CLI/Streamlit tracker script** (`tracker/portfolio_tracker.py`) exists as an offline-first portfolio analytics tool that reads a local JSON file rather than Supabase.

---

## Applications

### 1. Web PWA (`index.html` + `js/` + `styles.css`)

**Pattern:** Single-page application with module-per-feature vanilla JS.

**Layers:**

**Auth / Session:**
- Purpose: Supabase email/password auth with session persistence via `localStorage` and `onAuthStateChange`.
- Location: `js/auth.js`
- Depends on: Supabase JS SDK (loaded via CDN)
- Used by: All other JS modules through the global `currentUser` variable and `sb` client.

**Data / Sync Layer:**
- Purpose: Write-through cache — all writes go to `localStorage` immediately and are flushed to Supabase in the background with debounce. On login, `dbPullAll()` hydrates `localStorage` from Supabase.
- Location: `js/db.js`
- Depends on: `js/auth.js` (`currentUser`, `sb`)
- Used by: Feature modules (`carteira.js`, `track.js`, `goals.js`, etc.)

**Feature Modules:**
| File | Responsibility |
|------|---------------|
| `js/app.js` | Main calc orchestrator — reads DOM inputs, calls `calcFolha()`, triggers renders |
| `js/payroll.js` | INSS/IRRF/FGTS fiscal calculations (CLT and PJ, 2026 tables) |
| `js/projection.js` | Wealth projection snapshots and budget visualization |
| `js/carteira.js` | B3 portfolio positions, P&L, trade history, BRAPI/Edge Function price fetching |
| `js/track.js` | Monthly net worth tracking against projected curve |
| `js/goals.js` | Financial goal CRUD, progress tracking |
| `js/gastos.js` | Budget categories display |
| `js/extrato.js` | Transaction statement view |
| `js/categorias.js` | Category management |
| `js/saude-financeira.js` | Financial health score |
| `js/tesouro-api.js` | Tesouro Direto bond data fetching (Edge Function + static JSON fallback) |
| `js/reminders.js` | Local notification reminders |
| `js/modals.js` | Shared modal/dialog helpers |
| `js/storage.js` | `localStorage` keys, input serialization (`getInputs`/`applyInputs`), toast UI |
| `js/utils.js` | Small formatting helpers |

**State Management (PWA):**
- Primary state lives in `localStorage` (keyed with `simfin_*` prefixes).
- Runtime state is DOM-coupled: input values are read directly from elements by `getInputs()` in `js/storage.js`.
- `currentUser` in `js/auth.js` is the single global auth state.
- Supabase is a secondary store synced via debounced background pushes (`dbDebounce` in `js/db.js`).

---

### 2. Streamlit App (`streamlit-app/`)

**Pattern:** Layered MVC-style multi-page Streamlit app.

**Layers:**

**Presentation (Pages):**
- Purpose: Render UI, collect user inputs, display computed results and charts.
- Location: `streamlit-app/pages/`
- Each page calls `require_auth()` at startup; stops rendering if unauthenticated.

**Core Services (`streamlit-app/core/`):**

| Module | Responsibility |
|--------|---------------|
| `core/auth.py` | Supabase client singleton (`@st.cache_resource`), login/signup/logout UI, session state via `st.session_state["user"]` |
| `core/db.py` | All CRUD operations against Supabase tables; takes `user_id` as first arg, RLS enforced server-side |
| `core/calc.py` | Pure financial calculations — INSS/IRRF 2026, CLT/PJ payroll (`FolhaCLT`, `FolhaPJ` dataclasses), wealth projection (`build_snaps`) |
| `core/portfolio.py` | Portfolio position computation from transaction history (`current_positions`), daily P&L evolution (`build_evolution`) |
| `core/prices.py` | yfinance price fetching with 4-hour Parquet cache at `~/simfin_data/`; B3 ticker normalization (appends `.SA`) |

**Entry Point:**
- `streamlit-app/app.py` — home dashboard, validates auth, shows quick-access cards and latest metrics.

**State Management (Streamlit):**
- Auth session: `st.session_state["user"]` and `st.session_state["session"]`.
- Data fetching: `@st.cache_data(ttl=N)` decorators on per-page load functions; cleared on mutation via `st.cache_data.clear()`.
- No persistent in-memory state beyond Streamlit's cache — all canonical data is in Supabase.

---

### 3. Standalone Portfolio Tracker (`tracker/`)

**Pattern:** Self-contained script; no Supabase dependency.

- `tracker/portfolio_tracker.py` — reads `tracker/portfolio_transactions.json`, fetches prices via yfinance (same 4-hour cache pattern as `streamlit-app/core/prices.py`), renders a single-page Streamlit dashboard.
- Input data: `tracker/portfolio_transactions.json` — a flat array of trade objects (`ticker`, `date`, `operation`, `quantity`, `unit_price`).
- Configuration: `tracker/.env.example` documents optional env vars.

---

### 4. Supabase Backend

**Database:** PostgreSQL with 6 tables (see `schema.sql`):

| Table | Purpose |
|-------|---------|
| `simulacoes` | Saved simulation inputs (JSONB), owned per user |
| `metas` | Financial goals with target amount, date, achieved flag |
| `acompanhamento` | Monthly net-worth snapshots (1 row per `user_id + mes`) |
| `carteira_posicoes` | Consolidated portfolio positions (1 row per `user_id + ticker`) |
| `carteira_historico` | Bulk trade/movement history as JSONB arrays (1 row per user) |
| `user_config` | Per-user config: autosave inputs, BRAPI token, reminders |

**Security:** Row Level Security enabled on all tables; policy `"own"` restricts every row to `auth.uid() = user_id`.

**Edge Function:** `supabase/functions/cotacoes/index.ts` — Deno-based proxy that resolves browser CORS for:
- Yahoo Finance (`?tickers=WEGE3,KNRI11`)
- Tesouro Transparente CKAN API (`?tesouro_ckan=1`)
- Tesouro Nacional legacy JSON (`?tesouro=1`)

**Auth:** Supabase Auth (email/password), used by both PWA and Streamlit app.

---

## Data Flow

### PWA — User Login and Data Sync

1. Browser loads `index.html`; Supabase JS SDK fires `INITIAL_SESSION` via `onAuthStateChange` (`js/auth.js`).
2. If session exists: `authOnLogin()` → `dbPullAll()` hydrates all `localStorage` keys from Supabase.
3. User interacts with UI → feature module reads DOM → writes to `localStorage` immediately (UI stays responsive).
4. Same write triggers `dbDebounce()` → async Supabase push after 1.5 s idle.

### PWA — Calculation Flow

1. Any input change fires `calc()` in `js/app.js`.
2. `calcFolha()` in `js/payroll.js` runs INSS/IRRF brackets → returns `folha` object.
3. `calc()` calls `renderFolha()`, `renderBudget()`, and inline projection loop → updates DOM directly.

### Streamlit — Page Load Flow

1. Every page calls `require_auth()` (`core/auth.py`); redirects to login form if `st.session_state["user"]` is absent.
2. Page calls a `@st.cache_data`-wrapped loader that invokes `core/db.py` CRUD functions → fetches from Supabase.
3. Computed values flow through `core/calc.py` or `core/portfolio.py` → results rendered with Plotly charts.
4. On form submit: `core/db.py` upsert/insert → `st.cache_data.clear()` → `st.rerun()`.

### Price Fetching (Streamlit / Tracker)

1. `core/prices.fetch(ticker, start)` checks Parquet cache at `~/simfin_data/{ticker}_yf.parquet`.
2. If cache is stale (> 4 h) or missing today's data: calls `yf.download()`.
3. Returns `DataFrame` with string date index and `Close` column.
4. `price_on(df, target_date)` forward-fills to cover weekends/holidays.

---

## Error Handling

**Streamlit app:** Per-operation `try/except` blocks in page files; errors surfaced with `st.error()`. The home dashboard silently swallows metric-loading errors (`except Exception: pass`).

**PWA:** JS modules use `try/catch` around Supabase calls; failures are surfaced as toast messages via `showToast()` in `js/storage.js`.

**Edge Function:** Returns CORS headers on all responses including errors; exceptions caught and returned as JSON `{ error: "..." }` with HTTP 500.

---

## Cross-Cutting Concerns

**Authentication:** Both apps delegate entirely to Supabase Auth. No custom token logic.

**Offline Support (PWA only):** Service worker `sw.js` caches all static assets on first load; all calculations run client-side. Supabase sync fails gracefully when offline.

**Price Cache:** Both `streamlit-app/core/prices.py` and `tracker/portfolio_tracker.py` use the identical `~/simfin_data/{ticker}_yf.parquet` cache directory and 4-hour TTL strategy.

**Fiscal Tables:** Brazilian INSS and IRRF tables for 2026 are duplicated in `js/payroll.js` (JS) and `streamlit-app/core/calc.py` (Python). They must be kept in sync manually when tax law changes.

---

*Architecture analysis: 2026-04-05*
