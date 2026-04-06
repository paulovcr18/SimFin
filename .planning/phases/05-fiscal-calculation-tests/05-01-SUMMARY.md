---
phase: "05"
plan: "01"
subsystem: streamlit-app/tests
tags: [pytest, fiscal, inss, irrf, clt, pj, regression]
dependency_graph:
  requires: [streamlit-app/core/calc.py]
  provides: [streamlit-app/tests/test_calc.py, streamlit-app/requirements-test.txt]
  affects: []
tech_stack:
  added: [pytest>=8.0.0]
  patterns: [golden-value regression tests, progressive bracket verification]
key_files:
  created:
    - streamlit-app/requirements-test.txt
    - streamlit-app/tests/__init__.py
    - streamlit-app/tests/test_calc.py
  modified: []
decisions:
  - "31 tests written (vs ≥14 required) to fully cover all 7 public functions"
  - "Tolerance set to 1 cent (abs=0.01) for all monetary assertions"
  - "Tests parameterized across multiple salary values where applicable to avoid false-green"
metrics:
  duration: "3 minutes"
  completed_date: "2026-04-06"
  tasks_completed: 3
  files_created: 3
---

# Phase 05 Plan 01: Pytest Suite for calc.py Summary

**One-liner:** 31 golden-value pytest tests covering all 7 fiscal functions in calc.py — INSS brackets, IRRF redutor contract, CLT/PJ folhas, and patrimônio projection.

## What Was Built

A complete regression test suite for `streamlit-app/core/calc.py` that acts as a
contractual specification of the 2026 fiscal tables. Any update to the INSS/IRRF
tables for future years will break at least one test, making silent regressions
impossible.

### Files Created

- `streamlit-app/requirements-test.txt` — pytest>=8.0.0 (isolated from production deps)
- `streamlit-app/tests/__init__.py` — empty package init
- `streamlit-app/tests/test_calc.py` — 31 test functions across 7 categories

### Test Coverage

| Category | Tests | What is verified |
|---|---|---|
| INSS | 7 | Bracket boundaries, cap at R$8 475.55, golden values |
| IRRF (regular) | 4 | Redutor de isenção, alíquota máxima, never-negative |
| IRRF 13° | 2 | No-redutor contract, high-salary equivalence |
| Folha CLT | 5 | Golden R$5k/R$10k, VR+PLR, liq formula, FGTS 8% |
| Folha PJ | 3 | Simples/Lucro Presumido golden values, pró-labore cap |
| build_snaps | 6 | Length, initial pat, growth monotonicity, golden, pessimist/optimist |
| pat_no_mes | 4 | Empty guard, year-boundary, midpoint interpolation, zero |

## Commits

| Task | Commit | Description |
|---|---|---|
| Task 1 | 16905db | chore(05-01): add requirements-test.txt with pytest>=8.0.0 |
| Task 2 | 0a9f025 | chore(05-01): create streamlit-app/tests/__init__.py scaffold |
| Task 3 | 4147698 | test(05-01): add golden-value pytest suite for core/calc.py (31 tests) |

## Verification

```
cd streamlit-app && python3 -m pytest tests/ -v
# 31 passed in 0.10s
```

## Deviations from Plan

None — plan executed exactly as written. 31 tests written vs the ≥14 minimum to
provide full function-level coverage.

## Known Stubs

None.

## Self-Check: PASSED

- streamlit-app/requirements-test.txt: FOUND
- streamlit-app/tests/__init__.py: FOUND
- streamlit-app/tests/test_calc.py: FOUND
- Commit 16905db: FOUND
- Commit 0a9f025: FOUND
- Commit 4147698: FOUND
- pytest: 31 passed, 0 failed
