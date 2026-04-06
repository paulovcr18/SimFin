---
phase: 04-external-api-resilience
plan: "03"
subsystem: tesouro-ckan-script
tags: [resilience, validation, github-actions, python]
dependency_graph:
  requires: []
  provides: [assert_output-validation, enriched-error-messages, ckan-failure-diagnostic]
  affects: [.github/scripts/update_tesouro.py, .github/workflows/tesouro-cache.yml]
tech_stack:
  added: []
  patterns: [fail-fast-assertions, enriched-error-context, github-actions-conditional-steps]
key_files:
  created: []
  modified:
    - .github/scripts/update_tesouro.py
    - .github/workflows/tesouro-cache.yml
decisions:
  - assert_output placed after building out dict but before file write so failures don't leave stale JSON
  - MIN_TITULOS=5 chosen as conservative lower bound (Tesouro normally has 8-12 titles)
  - Diagnostic step uses exit 1 to ensure failure propagates clearly in Actions log
metrics:
  duration: ~8 minutes
  completed: "2026-04-06T21:03:40Z"
  tasks_completed: 2
  files_modified: 2
---

# Phase 04 Plan 03: CKAN Output Assertions and Error Enrichment Summary

Post-processing assertions in update_tesouro.py with assert_output() validating title count >= 5 and _generatedAt presence, plus enriched column-detection error messages (headers reais + normalizados) and a conditional GitHub Actions diagnostic step on failure.

## Tasks Completed

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 | Enriquecer mensagem de erro de colunas e adicionar assert_output | 82e3a08 | Done |
| 2 | Verificar e melhorar workflow tesouro-cache.yml | e00beb3 | Done |

## What Was Built

### Task 1: assert_output + enriched error messages (update_tesouro.py)

**Added `assert_output(out)` function:**
- Validates `titulos` is a dict
- Validates `len(titulos) >= MIN_TITULOS` (5) — fails with exact count and list of found titles
- Validates `_generatedAt` is present and non-empty
- Called in `main()` before `with open(out_path, ...)` to prevent saving invalid JSON

**Enriched `processar_csv` error for missing columns:**
- Added `h_norm` (normalized headers) to error message
- Error now shows: colunas não encontradas + headers reais + headers normalizados + heuristic hint

**Early warning in `detectar_colunas`:**
- Added `nao_mapeados` detection — prints AVISO to stderr before the print statement
- Shows headers reais in stderr for early diagnosis before the fatal RuntimeError

### Task 2: Diagnostic step in workflow (tesouro-cache.yml)

- Added `id: fetch_ckan` to the Python script execution step
- Added conditional `Diagnóstico de falha CKAN` step with `if: failure() && steps.fetch_ckan.outcome == 'failure'`
- Diagnostic step echoes context about where to look for the error (headers in log above) and CKAN dataset URL
- `exit 1` ensures failure propagates; commit step is skipped automatically by GitHub Actions

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Self-Check

### Files exist:
- [x] .github/scripts/update_tesouro.py - modified
- [x] .github/workflows/tesouro-cache.yml - modified

### Commits exist:
- [x] 82e3a08 - feat(04-03): add assert_output and enrich CKAN column error messages
- [x] e00beb3 - feat(04-03): add fetch_ckan id and failure diagnostic step to workflow

## Self-Check: PASSED
