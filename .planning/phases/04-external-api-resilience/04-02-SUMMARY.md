---
phase: 04-external-api-resilience
plan: 02
subsystem: frontend/carteira
tags: [resilience, ux, error-propagation, quotes]
dependency_graph:
  requires: [04-01]
  provides: [edge-fn-error-toast, nd-price-display]
  affects: [js/carteira.js]
tech_stack:
  added: []
  patterns: [error-propagation, null-display-guard]
key_files:
  modified: [js/carteira.js]
decisions:
  - "Use fmtCotacao() helper at display layer only; keep (preco||0) in all calculation paths"
  - "CSS injected once via style tag to avoid stylesheet dependency"
metrics:
  duration: "~10 min"
  completed_date: "2026-04-06"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 1
---

# Phase 04 Plan 02: Edge Function Error Propagation + N/D Price Display Summary

Front-end `carteiraBuscarCotacao()` now reads `data.error` from non-ok Edge Function responses (422/429/500) and surfaces the exact reason in the toast; assets with `preco=null` render "N/D" in the portfolio table instead of R$0.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Propagar motivo de falha da Edge Function no toast | 3980230 | js/carteira.js |
| 2 | Exibir "N/D" para ativos sem cotacao em vez de R$0 | 7bb2b30 | js/carteira.js |

## What Was Built

### Task 1: Edge Function error propagation

- Added `let edgeFnErrorMotivo = null` before the Edge Function fetch
- When `!res.ok`: reads `errData.error` from response JSON; falls back to `HTTP {status}` if parse fails
- When network throws: captures `Erro de rede: {e.message}`
- BRAPI no-token path: `showToast("Cotacoes indisponiveis (${motivo}). Configure...")`
- BRAPI exhausted-all path: `showToast("Cotacoes indisponiveis (Edge Function: ${motivo}). BRAPI tambem falhou.")`
- Removed silent `return Object.keys(map).length ? map : null` — replaced with descriptive toast

### Task 2: N/D price display

- Added `fmtCotacao(preco)` helper: returns `<span class="cotacao-indisponivel">N/D</span>` for null/undefined, `fmt(preco)` otherwise
- `carteiraRenderList` injects `.cotacao-indisponivel { color: #94a3b8; font-style: italic; }` via style tag once
- Unit price column now uses `fmtCotacao(a.preco)` 
- Total value column: `a.preco != null ? fmt(a.preco * a.qtd) : '<span class="cotacao-indisponivel">N/D</span>'`
- `carteiraUpdatePatrimonio` unchanged — still uses `(a.preco||0)` for sums

## Verification

```
grep -c "edgeFnErrorMotivo|fmtCotacao|cotacao-indisponivel" js/carteira.js
# → 11 (required >= 3)

grep "preco||0" js/carteira.js | grep -c "carteiraUpdatePatrimonio\|b3\|total"
# → carteiraUpdatePatrimonio line 418 unchanged

grep "Cotacoes indisponiveis" js/carteira.js
# → shows interpolation with ${detail}
```

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Self-Check

- [x] js/carteira.js modified and committed (3980230, 7bb2b30)
- [x] `edgeFnErrorMotivo` present (line 335)
- [x] `fmtCotacao` function present (line 456)
- [x] `cotacao-indisponivel` CSS class present (lines 457, 467, 605)
- [x] `carteiraUpdatePatrimonio` unchanged (still uses `preco||0`)
- [x] Old `return Object.keys(map).length ? map : null` removed
