---
phase: 03-portfolio-performance
plan: "02"
subsystem: database
tags: [supabase, localstorage, sync, carteira, portfolio]

# Dependency graph
requires: []
provides:
  - "_dbPullCarteira com heurística de merge por timestamp (cotadoEm) em vez de length"
  - "Erros de maybySingle em carteira_historico logados via console.error"
  - "Deleções locais de posições não são mais revertidas no login"
affects:
  - 03-portfolio-performance

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Timestamp-based merge: remote só vence local se remoteTs > localTs (cotadoEm)"
    - "Append-only data: negociacoes/movimentacoes remote só vence se local vazio"

key-files:
  created: []
  modified:
    - js/db.js

key-decisions:
  - "Usar cotadoEm (timestamp de cotação) como proxy de 'mais recente' para posições"
  - "Para dados append-only (negociacoes/movimentacoes) remote só vence se local está vazio"
  - "Logar erros de maybySingle com console.error em vez de silenciar"

patterns-established:
  - "Merge de dados remotos: timestamp > contagem de itens como critério de versão mais recente"

requirements-completed: []

# Metrics
duration: 2min
completed: "2026-04-06"
---

# Phase 03 Plan 02: Portfolio Sync Merge Fix Summary

**Corrigidas heurísticas 'length wins' em `_dbPullCarteira` substituindo por comparação de timestamp `cotadoEm`, e erros de `maybySingle` agora logados via `console.error`**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-06T13:55:34Z
- **Completed:** 2026-04-06T13:57:26Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Removida heurística `posicoes.length > localCart.length` que revertia deleções locais ao fazer login offline
- Implementada comparação por timestamp `remoteTs > localTs` (usando `cotadoEm`) para posições
- Removidas heurísticas length-wins de `negociacoes` e `movimentacoes` (remote só vence se local vazio)
- Adicionado `console.error` para capturar e logar erros de `maybySingle` em `carteira_historico`

## Task Commits

Each task was committed atomically:

1. **Task 1: Corrigir heurística de merge em _dbPullCarteira e logar erro maybySingle** - `a44482c` (fix)

## Files Created/Modified
- `js/db.js` - Função `_dbPullCarteira` corrigida com 3 fixes: timestamp merge para posições, remoção de length-wins para histórico, logging de erros maybySingle

## Decisions Made
- Usado `cotadoEm` como proxy de timestamp "mais recente" para posições — é o campo atualizado quando preços são cotados, portanto reflete a versão mais atual dos dados
- Negociações e movimentações tratadas como append-only: se local não está vazio, já é a fonte correta (dbPushHistorico já sincronizou antes do pull)
- Erros de maybySingle logados com prefixo `[db]` para facilitar filtragem no console

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Sync de carteira agora correto: deleções locais são preservadas após login
- Erros de Supabase em carteira_historico são visíveis no console do browser
- Pronto para demais planos da fase 03-portfolio-performance

---
*Phase: 03-portfolio-performance*
*Completed: 2026-04-06*
