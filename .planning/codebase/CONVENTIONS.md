---
focus: quality
generated: 2026-04-05
---

# Coding Conventions

**Analysis Date:** 2026-04-05

## Naming Patterns

**Python files:**
- `snake_case` for all module names: `auth.py`, `calc.py`, `db.py`, `portfolio.py`, `prices.py`
- Streamlit page files use a numeric prefix + title case with underscore: `1_Simulador.py`, `2_Carteira.py`, `3_Acompanhamento.py`
- Entry point is plain lowercase: `app.py`

**JavaScript files:**
- `camelCase` for all module names: `payroll.js`, `carteira.js`, `storage.js`, `tesouro-api.js`
- Kebab-case is also used: `saude-financeira.js`, `tesouro-api.js`

**Python functions:**
- `snake_case` throughout: `calc_inss`, `calc_irrf`, `build_snaps`, `current_positions`, `fetch_prices_yf`
- Private/internal helpers are prefixed with a single underscore: `_client()`, `_sb()`, `_b3()`, `_yf_sym()`, `_cache()`, `_fresh()`
- CRUD functions in `core/db.py` follow a `<noun>_<verb>` pattern: `acomp_list`, `acomp_upsert`, `acomp_delete`, `meta_insert`, `meta_delete`, `meta_toggle`, `config_get`, `config_upsert`

**Python variables:**
- `snake_case` for regular variables: `pat_ini`, `taxa_aa`, `renda_real`, `all_prices`
- Single-letter or very short names are acceptable for tight loop variables: `t`, `p`, `tk`, `ap`, `d`
- Module-level constants use `ALL_CAPS_SNAKE`: `CACHE_DIR`, `TRACKER_DIR`, `_INSS_FAIXAS`, `_IRRF_FAIXAS`

**Python classes:**
- `PascalCase`: `FolhaCLT`, `FolhaPJ`, `Position`, `Snap`
- All classes in `core/calc.py` and `core/portfolio.py` are `@dataclass`

**JavaScript functions:**
- `camelCase`: `calcINSS`, `calcIRRF`, `fetchPricesYf`, `buildDailyEvolution`, `currentPositions`, `scenarioSave`, `showToast`
- Private/internal helpers prefixed with underscore: `_dbPullSimulacoes`, `_dbPullMetas`, `_dbSyncing`, `_dbTimers`

**JavaScript constants:**
- `UPPER_SNAKE_CASE` for module-level keys: `STORAGE_KEY`, `SCENARIO_KEY`, `REMINDER_KEY`
- `ALL_CAPS` for fiscal tables: `INSS_F`, `IRRF_F`

## Code Style

**Python formatting:**
- No formatter config file present (no `.prettierrc`, `pyproject.toml`, or `setup.cfg` detected)
- 4-space indentation
- Blank lines used to separate logical sections within functions
- Inline comments on table data lines are common (`# teto: R$ 8.475,55`)
- Line length is not enforced — some lines in page files exceed 100 characters

**Python linting:**
- No linting config detected (no `.flake8`, `.pylintrc`, `ruff.toml`)

**JavaScript formatting:**
- No formatter config detected
- Uses single quotes for strings
- Heavy use of concise arrow functions for helpers: `const fmt=v=>...`, `const fmtK=v=>...`
- Intentionally compact/minified style for utility closures in `utils.js`
- More readable multi-line style in `db.js` and `storage.js`

**`from __future__ import annotations`:**
- Used consistently in all Python core modules (`auth.py`, `db.py`, `calc.py`, `portfolio.py`, `prices.py`) but not in page files

## Section Separators

Both Python and JavaScript use a consistent visual separator convention for section breaks.

**Python:**
```python
# ── Section Name ─────────────────────────────────────────────────────
```

**JavaScript:**
```javascript
// ════════════════════════════════════════════════════════════
// SECTION NAME
// ════════════════════════════════════════════════════════════
```
and for subsections:
```javascript
// ── Sub-section ──
```

These separators appear in every file. Follow them when adding new sections.

## Module Docstrings

Every Python module has a top-level docstring explaining the module's purpose. Style is concise, 1–3 lines, written in Portuguese (Brazilian).

```python
"""
Cálculos fiscais brasileiros 2026.
Portado de js/payroll.js e js/projection.js.
"""
```

```python
"""
Operações CRUD no Supabase.
Todas as funções recebem user_id e operam com RLS habilitado.
"""
```

Function docstrings are sparse — only present on non-obvious functions. They describe return type or side-effect, not parameters.

```python
def require_auth() -> bool:
    """
    Renderiza tela de login/cadastro se não autenticado.
    Retorna True se autenticado, False caso contrário.
    """
```

## Import Organization

**Python — order:**
1. `from __future__ import annotations` (first, in core modules)
2. Standard library imports
3. Third-party imports (`streamlit`, `supabase`, `pandas`, `plotly`, `yfinance`)
4. Internal project imports (`from core.auth import ...`)

**Inline imports are used occasionally** when imports are only needed in a specific branch:
```python
# In core/db.py
def meta_insert(user_id: str, meta: dict) -> None:
    import time
    ...

# In app.py
if registros:
    import pandas as pd
    ...

# In pages/1_Simulador.py (bottom of file)
import pandas as pd
st.dataframe(pd.DataFrame(mcs), ...)
```

**sys.path hack in page files** — each page file starts with:
```python
import sys; sys.path.insert(0, ".")
```
This is required because Streamlit page files run from the `pages/` subdirectory.

**JavaScript — pattern:**
- No ES module imports; all JS files are loaded as classic `<script>` tags in `index.html`
- Global functions are defined in each file and shared via the global scope

## Error Handling

**Python — general pattern:**
- `try/except Exception` (broad) is the predominant pattern — used in auth callbacks, page data loading, and price fetching
- Errors are surfaced via `st.error(f"Erro: {e}")` in UI-facing code
- Errors are silently swallowed (bare `except Exception: pass`) in non-critical paths

```python
# UI error — shown to user
try:
    res = sb.auth.sign_in_with_password(...)
    st.session_state["user"] = res.user
    st.rerun()
except Exception as e:
    st.error(f"Erro: {e}")

# Silent swallow — non-critical summary widget
try:
    registros = acomp_list(uid)
    ...
except Exception:
    pass

# Warning on external API failure
except Exception as e:
    st.warning(f"yfinance [{ticker}]: {e}")
    return pd.DataFrame(columns=["Close"])
```

**Guard-and-stop pattern in pages:**
- Pages check `require_auth()` at the top and call `st.stop()` if unauthenticated
- Early returns / `st.stop()` are used to abort page rendering on missing data

```python
if not require_auth():
    st.stop()

if not negocs:
    st.info("Nenhuma transação encontrada.")
    st.stop()
```

**JavaScript — error handling:**
- `try/catch` with `showToast` for user feedback on import/export errors
- Supabase async calls use `.catch(() => {})` to silently ignore non-critical sync failures

## Logging

No structured logging framework is used anywhere. All diagnostic output uses:
- `st.error(...)` — blocking errors
- `st.warning(...)` — recoverable issues (e.g., missing price data)
- `st.info(...)` — informational messages when data is empty
- `st.success(...)` — confirmation after successful write operations

## Type Annotations

**Python — consistent use of type hints** in all core module function signatures:
```python
def acomp_list(user_id: str) -> list[dict]: ...
def fetch(ticker: str, start: str) -> pd.DataFrame: ...
def build_snaps(anos: int, taxa_aa: float, ...) -> list[Snap]: ...
def calc_folha_pj(fat: float, ..., regime_pj: Literal["simples", "lucro_presumido"] = "simples") -> FolhaPJ: ...
```

Page files (UI layer) do not use type hints — only bare variable assignments.

## UI Formatting Helper

A module-level lambda `R` is defined in page files that need currency formatting:
```python
R = lambda v: f"R$ {v:,.2f}"
```
This appears in `pages/1_Simulador.py` and `pages/3_Acompanhamento.py`. Use this pattern in new page code.

## Inline HTML in Streamlit

Complex UI cards and tables are rendered as raw HTML strings using `st.markdown(..., unsafe_allow_html=True)`. This is intentional and used throughout the pages for fine-grained styling that Streamlit's native components don't provide. GitHub-dark theme colors are hardcoded into these HTML strings:
- Background: `#0d1117`, `#161b22`
- Border: `#21262d`, `#30363d`
- Text: `#c9d1d9` (primary), `#8b949e` (muted)
- Accent: `#58a6ff` (blue), `#3fb950` (green), `#f85149` (red)

---

*Convention analysis: 2026-04-05*
