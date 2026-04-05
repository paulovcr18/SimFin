---
focus: arch
generated: 2026-04-05
---

# Codebase Structure

**Analysis Date:** 2026-04-05

## Directory Layout

```
SimFin/                              # Repo root
├── index.html                       # PWA entry point — entire web app in one file
├── styles.css                       # All CSS for the PWA (dark theme)
├── manifest.json                    # PWA manifest (name, icons, theme)
├── sw.js                            # Service Worker — offline asset cache
├── icon-192.png / icon-192.svg      # App icons (home screen)
├── icon-512.png / icon-512.svg      # App icons (splash screen)
├── schema.sql                       # Supabase PostgreSQL schema (run once in SQL Editor)
├── LEIA-ME.md                       # PWA deployment guide (PT-BR)
├── README.md                        # Short English readme
│
├── js/                              # PWA JavaScript modules (loaded by index.html)
│   ├── auth.js                      # Supabase auth, session management
│   ├── db.js                        # Write-through cache layer (localStorage ↔ Supabase)
│   ├── app.js                       # Main calculation orchestrator
│   ├── payroll.js                   # INSS/IRRF/FGTS fiscal calculations
│   ├── projection.js                # Wealth projection + budget visualization
│   ├── carteira.js                  # B3 portfolio: positions, P&L, price fetch
│   ├── track.js                     # Monthly tracking vs projected curve
│   ├── goals.js                     # Financial goals CRUD
│   ├── gastos.js                    # Budget category display
│   ├── extrato.js                   # Transaction statement
│   ├── categorias.js                # Category management
│   ├── saude-financeira.js          # Financial health score
│   ├── tesouro-api.js               # Tesouro Direto bond data
│   ├── reminders.js                 # Local notification reminders
│   ├── modals.js                    # Shared modal helpers
│   ├── storage.js                   # localStorage keys, input serialization, toast
│   └── utils.js                     # Small formatting utilities
│
├── streamlit-app/                   # Python/Streamlit multi-page application
│   ├── app.py                       # Entry point: home dashboard
│   ├── requirements.txt             # Python dependencies
│   ├── .streamlit/
│   │   ├── config.toml              # Theme, server, browser settings
│   │   └── secrets.toml.example    # Template for SUPABASE_URL / SUPABASE_KEY
│   ├── core/                        # Shared service modules
│   │   ├── __init__.py
│   │   ├── auth.py                  # Supabase client, login/logout, session state
│   │   ├── db.py                    # CRUD operations (acompanhamento, metas, carteira, config)
│   │   ├── calc.py                  # Fiscal calculations + wealth projection (pure Python)
│   │   ├── portfolio.py             # Position calculation and daily P&L evolution
│   │   └── prices.py               # yfinance fetch + 4h Parquet cache
│   └── pages/                       # Streamlit pages (rendered in sidebar navigation)
│       ├── 1_Simulador.py           # CLT vs PJ comparison + projection charts
│       ├── 2_Carteira.py            # B3 portfolio positions, P&L, trade management
│       └── 3_Acompanhamento.py     # Monthly tracking + financial goals
│
├── tracker/                         # Standalone offline portfolio tracker
│   ├── portfolio_tracker.py         # Self-contained Streamlit app (no Supabase)
│   ├── portfolio_transactions.json  # Input: flat array of trade records
│   ├── requirements.txt             # Python dependencies (includes python-dotenv)
│   └── .env.example                 # Optional env var documentation
│
├── supabase/                        # Supabase backend artifacts
│   └── functions/
│       └── cotacoes/
│           └── index.ts             # Deno Edge Function: CORS proxy for Yahoo Finance + Tesouro
│
├── data/                            # Static data committed to the repo
│   └── tesouro-latest.json          # Tesouro Direto rates (auto-updated by CI)
│
├── docs/                            # Documentation assets (empty at time of analysis)
│
├── .github/
│   ├── workflows/
│   │   └── tesouro-cache.yml        # Scheduled workflow: updates data/tesouro-latest.json weekdays 11h BRT
│   └── scripts/
│       └── update_tesouro.py        # Script called by the workflow to fetch Tesouro CSV
│
└── .devcontainer/
    └── devcontainer.json            # VS Code Dev Container configuration
```

---

## Directory Purposes

**`js/`:**
- Purpose: All client-side JavaScript for the PWA. Each file is a feature module or shared utility.
- Key constraint: No build step — files are loaded directly by `index.html` via `<script>` tags in dependency order (auth first, db second, features last).
- Adding new features: create `js/{feature}.js` and add a `<script src="js/{feature}.js">` tag to `index.html`.

**`streamlit-app/core/`:**
- Purpose: Shared services imported by all Streamlit pages. No UI code here — pure logic and data access.
- `auth.py` and `db.py` always come first in page imports; `calc.py`, `portfolio.py`, `prices.py` are imported as needed.

**`streamlit-app/pages/`:**
- Purpose: Streamlit page files. Filename prefix number controls sidebar order (`1_`, `2_`, `3_`).
- Every page must start with `st.set_page_config(...)` and `if not require_auth(): st.stop()`.

**`tracker/`:**
- Purpose: Isolated tool for offline portfolio analysis. Does not import from `streamlit-app/`.
- Input is always `tracker/portfolio_transactions.json` — a JSON array of trade dicts.

**`supabase/functions/cotacoes/`:**
- Purpose: Deno Edge Function deployed to Supabase. Proxies external price APIs to bypass browser CORS.
- Deployed separately via Supabase CLI; not part of any Python or Node build.

**`data/`:**
- Purpose: Static data files committed to the repo and served alongside the PWA.
- `data/tesouro-latest.json` is regenerated automatically by the GitHub Actions workflow every weekday.

---

## Key File Locations

**Entry Points:**
- `index.html` — PWA; loads all `js/` modules and renders the full UI.
- `streamlit-app/app.py` — Streamlit app home; run with `streamlit run streamlit-app/app.py`.
- `tracker/portfolio_tracker.py` — Standalone tracker; run with `streamlit run tracker/portfolio_tracker.py`.

**Database Schema:**
- `schema.sql` — Create-table DDL and RLS policies for Supabase. Run once in the Supabase SQL Editor.

**Configuration:**
- `streamlit-app/.streamlit/config.toml` — Theme and server settings.
- `streamlit-app/.streamlit/secrets.toml.example` — Template; copy to `secrets.toml` and fill in `SUPABASE_URL` and `SUPABASE_KEY`.
- `tracker/.env.example` — Optional env var template for the tracker.

**CI:**
- `.github/workflows/tesouro-cache.yml` — Scheduled job; calls `.github/scripts/update_tesouro.py` and commits `data/tesouro-latest.json`.

**Core Logic:**
- `streamlit-app/core/calc.py` — All Brazilian fiscal math (INSS, IRRF, wealth projection). Equivalent logic lives in `js/payroll.js` and `js/projection.js`.
- `streamlit-app/core/db.py` — Single source of truth for all Supabase table interactions in the Python app.

---

## Naming Conventions

**Files:**
- Python modules: `snake_case.py`
- Streamlit pages: `{N}_{PascalCase}.py` (number prefix for ordering, e.g., `1_Simulador.py`)
- JavaScript modules: `{feature}.js` in lowercase, feature-named (e.g., `carteira.js`, `payroll.js`)

**Directories:**
- Lowercase with hyphens for top-level dirs (`streamlit-app`, `supabase`)
- Lowercase for sub-dirs (`core`, `pages`, `functions`)

**Python identifiers:**
- Functions: `snake_case`
- Dataclasses: `PascalCase` (e.g., `FolhaCLT`, `FolhaPJ`, `Position`, `Snap`)

**JavaScript identifiers:**
- Functions: `camelCase` (e.g., `calcFolha`, `dbPullAll`, `carteiraSave`)
- `localStorage` keys: `simfin_*` prefix (e.g., `simfin_carteira`, `simfin_saves`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `CART_KEY`, `BRAPI_BASE`, `COTACOES_FN`)

---

## Where to Add New Code

**New PWA feature tab:**
- Implement: create `js/{feature}.js`
- Register: add `<script src="js/{feature}.js"></script>` in `index.html` after `js/db.js`
- Persist data: add a pull function in `js/db.js` (`_dbPull{Feature}`) and a push function (`dbPush{Feature}`), called from `dbPullAll()`

**New Streamlit page:**
- Implement: create `streamlit-app/pages/{N}_{Name}.py`
- Must start with `require_auth()` guard
- Read data: use functions from `streamlit-app/core/db.py`
- Calculations: add pure functions to `streamlit-app/core/calc.py` if reusable

**New Supabase table:**
- Add DDL + RLS policy to `schema.sql`
- Add CRUD functions to `streamlit-app/core/db.py` (Python) and to `js/db.js` (PWA)

**New fiscal calculation:**
- Python: `streamlit-app/core/calc.py`
- JavaScript equivalent: `js/payroll.js` or `js/projection.js`
- Both must be updated together when tax law changes

**Shared utilities:**
- Python: `streamlit-app/core/` (new module if large, or append to `calc.py`)
- JavaScript: `js/utils.js` for small helpers; new `js/{name}.js` for larger features

---

## Special Directories

**`~/simfin_data/`** (runtime, not in repo):
- Purpose: Local Parquet price cache written by `streamlit-app/core/prices.py` and `tracker/portfolio_tracker.py`.
- Generated: Yes (at runtime by yfinance fetch)
- Committed: No

**`.planning/codebase/`:**
- Purpose: GSD codebase analysis documents for AI-assisted planning and execution.
- Generated: Yes (by `/gsd:map-codebase`)
- Committed: Yes

**`data/`:**
- Purpose: Static data served by the PWA; updated by CI.
- Generated: Partially (CI rewrites `tesouro-latest.json`)
- Committed: Yes

---

*Structure analysis: 2026-04-05*
