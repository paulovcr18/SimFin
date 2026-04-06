---
phase: 04-external-api-resilience
plan: "01"
subsystem: edge-function
tags: [resilience, rate-limiting, yahoo-finance, error-handling, typescript]
dependency_graph:
  requires: []
  provides: [cotacoes-rate-limiting, yahoo-shape-validation, catch-all-500]
  affects: [supabase/functions/cotacoes/index.ts]
tech_stack:
  added: []
  patterns: [in-memory-rate-limiter, discriminated-union-validation, catch-all-error-handler]
key_files:
  created: []
  modified:
    - supabase/functions/cotacoes/index.ts
decisions:
  - "Used discriminated union return type for validateYahooShape() for type-safe callers"
  - "Rate limiter uses Map in module scope — best-effort per isolate, sufficient to catch accidental loops"
  - "Empty results (rawList populated but no prices extracted) returns 422 instead of silent empty object"
metrics:
  duration: "~10min"
  completed: "2026-04-06"
  tasks_completed: 2
  files_changed: 1
---

# Phase 04 Plan 01: External API Resilience — Rate Limiting + Yahoo Shape Validation Summary

**One-liner:** In-memory rate limiting (429) + Yahoo Finance shape validation (422) + improved catch-all 500 handler in cotacoes Edge Function.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add in-memory rate limiting | 73118e1 | supabase/functions/cotacoes/index.ts |
| 2 | Yahoo shape validation, 422 errors, catch-all 500 | a9c2277 | supabase/functions/cotacoes/index.ts |

## What Was Built

### Task 1: Rate Limiting

Added `rateLimiter` Map in module scope (before `Deno.serve`) tracking requests per IP in 60-second windows:

- `RATE_LIMIT = 10` requests per window
- `RATE_WINDOW = 60_000ms`
- `checkRateLimit(ip)` increments counter and returns `false` when `count > RATE_LIMIT`
- Returns HTTP 429 with `Retry-After: 60` header and `{ error: "Rate limit excedido..." }` body
- IP extracted from `x-forwarded-for` or `x-real-ip` headers, falls back to `'unknown'`

### Task 2: Yahoo Shape Validation + Catch-all 500

Added `validateYahooShape(data)` function with discriminated union return type:
- Returns `{ valid: false, reason: string }` if `data` is not an object, lacks `spark` field, or `spark.result` is not an array
- Returns `{ valid: true, list: Record<string, unknown>[] }` on valid shape

Updated Yahoo Finance route to:
1. Call `validateYahooShape(data)` — returns HTTP 422 with readable reason if invalid
2. Assign `rawList` from `validated.list` (not `data?.spark?.result`)
3. Check `!Object.keys(results).length && tickers.length > 0` — returns HTTP 422 if no prices extracted
4. Updated catch-all to use `e instanceof Error ? e.message : String(e)`, log to console, return HTTP 500 without stack traces

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all changes are functional error-handling paths, no stubs or placeholders.

## Self-Check: PASSED

- [x] `supabase/functions/cotacoes/index.ts` exists and contains all required patterns
- [x] Commit 73118e1 exists (Task 1: rate limiting)
- [x] Commit a9c2277 exists (Task 2: shape validation + 500)
- [x] `grep -c "429\|422\|500\|rateLimiter\|validateYahooShape"` returns 11 (>= 5 required)
- [x] `rawList` assigned from `validated.list`, not `data?.spark?.result`
- [x] catch-all covers all routing logic (OPTIONS block outside try/catch is preflight only)
