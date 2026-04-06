---
phase: 05-fiscal-calculation-tests
verified: 2026-04-06T00:00:00Z
status: passed
score: 4/4 must-haves verified
---

# Phase 05: Fiscal Calculation Tests — Verification Report

**Phase Goal:** Garantir que os cálculos de INSS/IRRF/FGTS não regridem silenciosamente quando as tabelas fiscais são atualizadas, e detectar divergência entre a implementação JS e Python.
**Verified:** 2026-04-06
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth                                                                         | Status     | Evidence                                                                       |
|----|-------------------------------------------------------------------------------|------------|--------------------------------------------------------------------------------|
| 1  | `pytest streamlit-app/tests/` passes with ≥10 test cases covering calc.py    | VERIFIED   | 31 passed in 0.08s (confirmed by live run)                                     |
| 2  | Cases cover INSS band limits, IRRF with/without deductions, CLT vs PJ        | VERIFIED   | 7 INSS tests, 4 IRRF tests, 2 IRRF-13 tests, 5 CLT tests, 3 PJ tests         |
| 3  | "Golden salary" fixture documents expected values as contract                 | VERIFIED   | test_folha_clt_5k, test_folha_clt_10k, test_build_snaps_golden_values use hardcoded expected monetary values |
| 4  | Updating INSS/IRRF tables breaks at least one test                            | VERIFIED   | 50 `pytest.approx` assertions with exact monetary values derived from 2026 band boundaries; changing any rate constant breaks them |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact                                     | Expected                            | Status    | Details                                       |
|----------------------------------------------|-------------------------------------|-----------|-----------------------------------------------|
| `streamlit-app/tests/test_calc.py`           | Golden-value test suite             | VERIFIED  | 287 lines, 31 `def test_` functions           |
| `streamlit-app/requirements-test.txt`        | pytest>=8.0.0 isolated dependency   | VERIFIED  | Single line: `pytest>=8.0.0`                  |
| `streamlit-app/tests/__init__.py`            | Empty package init                  | VERIFIED  | File exists, empty (package scaffold)         |
| `streamlit-app/core/calc.py`                 | Source under test (pre-existing)    | VERIFIED  | File exists, imported successfully by tests   |

### Key Link Verification

| From                     | To                    | Via                         | Status  | Details                                            |
|--------------------------|-----------------------|-----------------------------|---------|----------------------------------------------------|
| `tests/test_calc.py`     | `core/calc.py`        | `sys.path.insert + import`  | WIRED   | Lines 20-30: explicit path insert + 7 named imports |
| `requirements-test.txt`  | `pytest>=8.0.0`       | `pip install -r`            | WIRED   | Confirmed: pytest ran successfully                 |

### Data-Flow Trace (Level 4)

Not applicable — this phase produces test infrastructure, not components rendering dynamic data.

### Behavioral Spot-Checks

| Behavior                          | Command                                               | Result            | Status  |
|-----------------------------------|-------------------------------------------------------|-------------------|---------|
| pytest passes with ≥10 tests      | `python -m pytest tests/ -q --tb=short`               | `31 passed 0.08s` | PASS    |
| test file has ≥10 test functions  | `grep -c "^def test_" tests/test_calc.py`             | `31`              | PASS    |
| All 3 commits exist in git        | `git log --oneline` grep for 16905db/0a9f025/4147698  | All 3 found       | PASS    |

### Requirements Coverage

No requirement IDs were declared in the plan frontmatter (field is empty `[]`). Coverage is assessed against the 4 ROADMAP.md success criteria, all of which are satisfied (see Observable Truths above).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | —    | —       | —        | —      |

No stubs, placeholders, or empty implementations found. All `pytest.approx` assertions use concrete monetary values, not `> 0` guards.

### Human Verification Required

None. All success criteria are fully verifiable programmatically.

## Gaps Summary

No gaps. All 4 success criteria from ROADMAP.md are met:

1. 31 tests pass (≥10 required) — confirmed by live `pytest` run.
2. Coverage spans all required domains: 7 INSS bracket tests (including exact band ceilings R$1 621, R$2 902.84, R$8 475.55), 4 IRRF tests (with/without redutor via Lei 15.270/2025), 5 CLT tests, 3 PJ tests (Simples and Lucro Presumido).
3. Golden contract: `test_folha_clt_5k` and `test_folha_clt_10k` assert exact bruto/inss/irrf/fgts/liq values for R$5 000 and R$10 000 with 1-cent tolerance.
4. Detectability guaranteed: 50 `pytest.approx` calls with hardcoded 2026 values — updating any INSS bracket boundary or rate in `calc.py` will break the tests for that boundary.

---

_Verified: 2026-04-06_
_Verifier: Claude (gsd-verifier)_
