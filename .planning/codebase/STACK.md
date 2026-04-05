---
focus: tech
generated: 2026-04-05
---

# Technology Stack

**Analysis Date:** 2026-04-05

## Languages

**Primary:**
- JavaScript (ES2020+) - Frontend PWA (`index.html`, `js/*.js`)
- Python 3.11 - Streamlit app (`streamlit-app/`) and standalone tracker (`tracker/`)
- TypeScript (Deno runtime) - Supabase Edge Function (`supabase/functions/cotacoes/index.ts`)
- SQL (PostgreSQL) - Database schema (`schema.sql`)

**Secondary:**
- CSS - Styling (`styles.css`, ~68 KB)

## Runtime

**Environment:**
- Browser (PWA) - vanilla JS app, no build step required
- Python 3.11 - pinned via Dev Container image `mcr.microsoft.com/devcontainers/python:1-3.11-bookworm`
- Deno - Supabase Edge Functions runtime for `supabase/functions/cotacoes/index.ts`

**Package Manager:**
- pip (Python) - no lockfile present; `requirements.txt` files use `>=` version constraints
- No Node/npm required for the PWA (CDN-loaded dependencies only)

## Frameworks

**Core (Streamlit app):**
- Streamlit `>=1.35.0` — UI framework, multi-page app with `pages/` directory convention
  - Config: `streamlit-app/.streamlit/config.toml`
  - Secrets: `streamlit-app/.streamlit/secrets.toml` (not committed; see `secrets.toml.example`)

**Core (PWA):**
- No framework — plain HTML/CSS/JS single-page application with manual DOM manipulation
- Service Worker (`sw.js`) — offline support and asset caching

**Data / Visualization:**
- pandas `>=2.1.0` — data manipulation in Streamlit app and tracker
- plotly `>=5.20.0` — interactive charts in both Streamlit app and standalone tracker
- pyarrow `>=14.0.0` — Parquet format used for local price cache (`~/simfin_data/*.parquet`)
- Chart.js `4.4.0` — charts in the PWA (CDN: `cdn.jsdelivr.net/npm/chart.js@4.4.0`)

**External SDKs (runtime):**
- supabase-js `@2` — Supabase JS client in PWA (CDN: `cdn.jsdelivr.net/npm/@supabase/supabase-js@2`)
- supabase-py `>=2.4.0` — Supabase Python client in Streamlit app
- yfinance `>=0.2.40` — Yahoo Finance price data fetching in Streamlit app and tracker

## Key Dependencies

**Critical:**
- `supabase>=2.4.0` (`streamlit-app/requirements.txt`) — all auth and database operations for the Streamlit app
- `@supabase/supabase-js@2` (CDN, `index.html`) — all auth and sync operations for the PWA
- `yfinance>=0.2.40` — stock price fetching for B3 (Brazilian exchange) and US tickers; no API key required
- `streamlit>=1.35.0` — entire Streamlit UI layer

**Infrastructure:**
- `python-dotenv>=1.0` (`tracker/requirements.txt`) — loads `.env` file in the standalone tracker only (not used in Streamlit app, which uses `st.secrets`)
- `pyarrow>=14.0.0` — Parquet-based local cache for yfinance price data; prevents redundant API calls (4h TTL)

## Configuration

**Environment:**
- Streamlit app: `streamlit-app/.streamlit/secrets.toml` (local) or Streamlit Cloud Secrets (production)
  - Required keys: `SUPABASE_URL`, `SUPABASE_KEY`
- Standalone tracker: `tracker/.env` (from `tracker/.env.example`)
  - Optional key: `SIMFIN_API_KEY` (only needed for international stocks; B3 uses yfinance without key)
- PWA: Supabase URL and anon key are hardcoded in `js/auth.js` (public anon key, safe by design)

**Build:**
- No build step for the PWA — served as static files
- Streamlit app: run with `streamlit run streamlit-app/app.py`
- Dev Container auto-runs: `streamlit run streamlit-app/app.py --server.enableCORS false --server.enableXsrfProtection false`
- Port forwarded: `8501`

## Platform Requirements

**Development:**
- Python 3.11
- Dev Container: `mcr.microsoft.com/devcontainers/python:1-3.11-bookworm` (`.devcontainer/devcontainer.json`)
- VS Code extensions: `ms-python.python`, `ms-python.vscode-pylance`

**Production:**
- PWA: any static file host (GitHub Pages used for `data/tesouro-latest.json` cache)
- Streamlit app: Streamlit Community Cloud (inferred from `secrets.toml` pattern and `gatherUsageStats = false`)
- Edge Function: Supabase hosted Deno runtime (`https://qaopienbsmssjosttucn.supabase.co/functions/v1/cotacoes`)

---

*Stack analysis: 2026-04-05*
