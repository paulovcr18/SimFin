---
focus: quality
generated: 2026-04-05
---

# Testing Patterns

**Analysis Date:** 2026-04-05

## Test Framework

**Runner:** None detected

No test runner configuration files are present in the repository:
- No `pytest.ini`, `setup.cfg`, `pyproject.toml`, or `conftest.py`
- No `jest.config.*`, `vitest.config.*`, or `*.test.*` / `*.spec.*` files
- No `test_*.py` or `*_test.py` files anywhere in the codebase

**Run Commands:**
```bash
# No test commands defined — none exist
```

## Test File Organization

**Location:** Not applicable — no test files exist

**Naming:** No established pattern

## Test Types Present

**Unit Tests:** None

**Integration Tests:** None

**E2E Tests:** None

## Coverage

**Requirements:** None enforced

**Measured coverage:** 0% — no tests of any kind exist

## What Is Tested

Nothing is explicitly tested. The entire codebase — including all business logic, data access, and UI — runs only through manual use of the running Streamlit application.

## Critical Untested Code

The following modules contain pure business logic that is highly testable but has no coverage at all:

**`streamlit-app/core/calc.py` (241 lines):**
- `calc_inss(bruto)` — progressive INSS bracket calculation
- `calc_irrf(bruto, inss)` — IRRF with 2026 exemption reducer
- `calc_irrf_13(bruto, inss)` — 13th salary tax (no reducer)
- `calc_folha_clt(bruto, vr, plr)` — full CLT payroll breakdown
- `calc_folha_pj(fat, retirada, prolabore, regime_pj, reserva_pct)` — PJ payroll breakdown
- `build_snaps(anos, taxa_aa, aporte_inicial, reajuste_aa, pat_inicial)` — compound growth projection
- `pat_no_mes(snaps, meses)` — interpolation between annual snapshots

**`streamlit-app/core/portfolio.py` (100 lines):**
- `current_positions(transactions)` — position aggregation from trade history (BUY/SELL accounting)
- `build_evolution(transactions, all_prices)` — day-by-day portfolio value reconstruction

**`streamlit-app/core/prices.py` (74 lines):**
- `_b3(ticker)` — B3 vs US market detection
- `price_on(df, target)` — forward-fill price lookup
- `fetch(ticker, start)` — yfinance download with local parquet cache

**`tracker/portfolio_tracker.py` (379 lines):**
- `is_b3(ticker)`, `yf_ticker(ticker)` — market detection (duplicated from `core/prices.py`)
- `current_positions(txns)` — position calculation (duplicated logic from `core/portfolio.py`)
- `build_daily_evolution(txns, all_prices)` — duplicated evolution logic

**`js/payroll.js`:**
- `calcINSS(b)` — JavaScript port of the same INSS calculation
- `calcIRRF(bruto, inss)` — JavaScript port of IRRF with reducer

## Testing Gaps (Prioritized)

**High Priority — Pure functions with complex fiscal rules:**
- `calc_inss` / `calcINSS`: bracket arithmetic is easy to get wrong; edge cases at bracket boundaries
- `calc_irrf` / `calcIRRF`: the 2026 exemption reducer has three distinct ranges with a formula; regression risk if tax tables are updated
- `current_positions`: BUY/SELL accounting with average cost basis — arithmetic errors are silent and financially impactful
- `build_evolution`: date iteration with forward-fill; correctness depends on sorting and pointer logic

**Medium Priority — Integration-adjacent logic:**
- `build_snaps`: compound growth with monthly compounding; pessimistic/optimistic scenario splits
- `fetch` / `fetch_prices_yf`: cache freshness logic, MultiIndex flattening, parquet round-trip
- `load_transactions` in `tracker/portfolio_tracker.py`: JSON normalization, type coercion

**Low Priority — Streamlit UI pages:**
- Pages are tightly coupled to `st.*` calls and `st.session_state`; testing requires mocking the entire Streamlit runtime, which is impractical without a dedicated integration harness

## How to Add Tests (Recommended Setup)

Since the project has no test infrastructure, the minimal setup to start testing the pure-Python core would be:

1. Add `pytest` to `streamlit-app/requirements.txt`:
   ```
   pytest>=8.0
   ```

2. Create a `streamlit-app/tests/` directory with an `__init__.py`

3. Write unit tests against `core/calc.py` first — these have zero dependencies on Streamlit or Supabase and are pure functions:
   ```python
   # streamlit-app/tests/test_calc.py
   from core.calc import calc_inss, calc_irrf, calc_folha_clt

   def test_calc_inss_below_first_bracket():
       assert calc_inss(1000.0) == pytest.approx(1000.0 * 0.075)

   def test_calc_inss_teto():
       assert calc_inss(8475.55) == pytest.approx(...)
   ```

4. Run with:
   ```bash
   cd streamlit-app
   python -m pytest tests/
   ```

## Notes on Duplication

`tracker/portfolio_tracker.py` duplicates portfolio calculation logic that exists in `streamlit-app/core/portfolio.py` and `streamlit-app/core/prices.py`. Any tests written for the core modules will not cover the tracker's copies. If tests are added, consider testing both implementations or refactoring the tracker to import from the core package.

---

*Testing analysis: 2026-04-05*
