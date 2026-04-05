---
focus: tech
generated: 2026-04-05
---

# External Integrations

**Analysis Date:** 2026-04-05

## APIs & External Services

**Authentication & Database (Supabase):**
- Supabase — hosted PostgreSQL with Row Level Security, Auth, and Edge Functions
  - Project URL: `https://qaopienbsmssjosttucn.supabase.co` (hardcoded in `js/auth.js`)
  - SDK (PWA): `@supabase/supabase-js@2` via CDN
  - SDK (Streamlit): `supabase>=2.4.0` via `streamlit-app/requirements.txt`
  - Auth: anon public key used client-side; service role key never referenced in code
  - Auth method: email + password via `sb.auth.signInWithPassword` / `sb.auth.signUp`

**Stock Price Data (B3 / Yahoo Finance):**
- BRAPI (`https://brapi.dev/api/quote/`) — primary B3 ticker quotes in the PWA
  - Used in: `js/carteira.js` (constant `BRAPI_BASE`) and `js/app.js`
  - Auth: optional personal token stored per-user in `user_config.brapi_token` (Supabase) and `localStorage`
  - Fallback: if BRAPI fails or returns 401, the PWA falls back to the Supabase Edge Function proxy
- Yahoo Finance (`query1.finance.yahoo.com/v7/finance/spark`) — B3 ticker quotes via Edge Function proxy
  - Used in: `supabase/functions/cotacoes/index.ts` (server-side, resolves CORS)
  - Auth: none (public API, User-Agent header spoofed to `Mozilla/5.0 (SimFin/1.0)`)
  - Endpoint accessed by PWA via: `GET /functions/v1/cotacoes?tickers=WEGE3,KNRI11`
- yfinance Python library — historical price fetching in Streamlit app (`streamlit-app/core/prices.py`) and standalone tracker (`tracker/portfolio_tracker.py`)
  - B3 tickers auto-suffixed with `.SA` (e.g., `PETR4` → `PETR4.SA`)
  - Auth: none required for B3; `SIMFIN_API_KEY` env var exists in tracker but is not used by yfinance
  - Cache: Parquet files at `~/simfin_data/{ticker}_yf.parquet`, 4-hour TTL

**Tesouro Direto (Brazilian Government Bonds):**
- CKAN Tesouro Transparente — primary data source for Tesouro Direto prices
  - Package endpoint: `https://www.tesourotransparente.gov.br/ckan/api/3/action/package_show?id=taxas-dos-titulos-ofertados-pelo-tesouro-direto`
  - Datastore endpoint: `https://www.tesourotransparente.gov.br/ckan/api/3/action/datastore_search`
  - Used in: `supabase/functions/cotacoes/index.ts` (`?tesouro_ckan=1`) and `.github/scripts/update_tesouro.py`
  - Auth: none (public API)
- B3 JSON legacy (`https://www.tesourodireto.com.br/json/br/com/b3/tesouro/tesouro-direto/2/prices-and-rates.json`) — fallback source
  - Used in: `supabase/functions/cotacoes/index.ts` (`?tesouro=1`)
  - Auth: none
- GitHub Pages static cache (`./data/tesouro-latest.json`) — primary source for PWA, highest priority
  - Updated daily by GitHub Actions workflow; consumed by `js/tesouro-api.js`

**Google Fonts:**
- Google Fonts CDN — font loading in PWA (`index.html`, `<link rel="preconnect" href="https://fonts.googleapis.com">`)
  - Font family: Sora (referenced in inline CSS within `js/auth.js`)
  - Auth: none

## Data Storage

**Databases:**
- Supabase (PostgreSQL) — cloud database, all user data
  - Connection: `SUPABASE_URL` + `SUPABASE_KEY` (secrets); anon key used client-side
  - Client (Python): `supabase-py` via `core/auth.py` → `get_client()`
  - Client (JS): `window.supabase.createClient()` in `js/auth.js`
  - Tables (defined in `schema.sql`):
    - `simulacoes` — saved CLT×PJ simulation snapshots (JSONB inputs + summary)
    - `metas` — financial goals per user
    - `acompanhamento` — monthly net worth tracking entries
    - `carteira_posicoes` — consolidated portfolio positions per ticker
    - `carteira_historico` — bulk trade history (JSONB per user)
    - `user_config` — per-user settings (autosave, BRAPI token, reminders)
  - Row Level Security: enabled on all tables; policy `auth.uid() = user_id` enforced at DB level

**Local Storage (PWA browser):**
- `localStorage` — write-through cache; reads are always local (zero latency)
- Sync pattern: write to `localStorage` immediately → push to Supabase in background (debounced 1.5s)
- Keys managed in `js/db.js`: `STORAGE_KEY`, `GOALS_KEY`, `TRACK_KEY`, `CART_KEY`, `NEGOC_KEY`, `MOVIM_KEY`
- On login: `dbMigrateIfNeeded()` (first time) then `dbPullAll()` to hydrate from Supabase

**File Storage:**
- Local filesystem — yfinance Parquet cache at `~/simfin_data/` (Streamlit app and tracker only)
- `data/tesouro-latest.json` — committed to repo, updated by CI, served via GitHub Pages

**Caching:**
- Browser `localStorage` — Tesouro Direto price index, 30-minute TTL (`js/tesouro-api.js`, key `simfin_tesouro_cache_v2`)
- Local Parquet files — yfinance price history, 4-hour TTL (`streamlit-app/core/prices.py`)

## Authentication & Identity

**Auth Provider:**
- Supabase Auth — email/password authentication for both PWA and Streamlit app
  - PWA implementation: `js/auth.js` — uses `onAuthStateChange` as single source of truth; handles `INITIAL_SESSION`, `SIGNED_IN`, `SIGNED_OUT`, `PASSWORD_RECOVERY` events
  - Streamlit implementation: `streamlit-app/core/auth.py` — session stored in `st.session_state["user"]`; `@st.cache_resource` for client singleton
  - Features: email confirmation, password reset via email link, session persistence (`persistSession: true`), auto token refresh

## Monitoring & Observability

**Error Tracking:**
- None detected

**Logs:**
- PWA: `console.warn` / `console.info` / `console.error` for Supabase sync and API errors
- Streamlit: `st.warning()` for yfinance errors (`streamlit-app/core/prices.py`)

## CI/CD & Deployment

**Hosting:**
- PWA: GitHub Pages (static files from repo root; `data/tesouro-latest.json` served at `./data/`)
- Streamlit app: Streamlit Community Cloud (inferred from secrets pattern)
- Edge Function: Supabase hosted Deno runtime

**CI Pipeline:**
- GitHub Actions — `.github/workflows/tesouro-cache.yml`
  - Trigger: schedule `0 14 * * 1-5` (11:00 BRT, weekdays) + `workflow_dispatch`
  - Job: runs `.github/scripts/update_tesouro.py`, commits updated `data/tesouro-latest.json` back to repo
  - Permissions: `contents: write` (auto-push via `github-actions[bot]`)

## Environment Configuration

**Required env vars / secrets:**

| Context | Key | Purpose |
|---------|-----|---------|
| Streamlit app | `SUPABASE_URL` | Supabase project URL |
| Streamlit app | `SUPABASE_KEY` | Supabase anon key |
| Tracker (optional) | `SIMFIN_API_KEY` | SimFin.com API key (international stocks only) |

- Streamlit secrets: `streamlit-app/.streamlit/secrets.toml` (local) or Streamlit Cloud Secrets UI
- Tracker env: `tracker/.env` (copy from `tracker/.env.example`)
- PWA: no secrets; Supabase URL and anon key hardcoded in `js/auth.js` (anon key is public by design)

**Secrets location:**
- `.streamlit/secrets.toml` — not committed (gitignored); example at `streamlit-app/.streamlit/secrets.toml.example`
- `.env` — not committed; example at `tracker/.env.example`

## Webhooks & Callbacks

**Incoming:**
- None detected (no webhook endpoints)

**Outgoing:**
- Supabase Edge Function (`/functions/v1/cotacoes`) proxies outbound requests to:
  - Yahoo Finance API (`query1.finance.yahoo.com`)
  - CKAN Tesouro Transparente (`tesourotransparente.gov.br`)
  - B3 Tesouro Direto legacy endpoint (`tesourodireto.com.br`)

---

*Integration audit: 2026-04-05*
