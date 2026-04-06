---
phase: 04-external-api-resilience
verified: 2026-04-06T00:00:00Z
status: passed
score: 4/4 must-haves verified
---

# Phase 4: External API Resilience Verification Report

**Phase Goal:** Tornar o app resiliente a mudanças de formato das APIs externas não-oficiais (Yahoo Finance, CKAN Tesouro) e dar feedback claro ao usuário quando dados não estão disponíveis.
**Verified:** 2026-04-06T00:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | Se Yahoo Finance mudar o formato, app exibe mensagem de erro clara ao invés de R$0 | VERIFIED | `validateYahooShape()` in `supabase/functions/cotacoes/index.ts` (lines 60–73) returns `{ valid: false, reason: string }`; caller at lines 197–202 returns HTTP 422 with `{ error: validated.reason }`; `js/carteira.js` reads `errData.error` into `edgeFnErrorMotivo` (lines 352–355) and interpolates it into the `showToast` call (lines 366–367) |
| 2  | Se CKAN mudar colunas, a GitHub Action falha com erro legível | VERIFIED | `assert_output()` in `.github/scripts/update_tesouro.py` (lines 28–40) raises `RuntimeError` with explicit count/key listing; `processar_csv()` raises `RuntimeError` with real headers on missing columns (lines 128–136); workflow step `fetch_ckan` (id set at line 17) triggers diagnostic step on failure (lines 20–27) that prints actionable message and exits 1 |
| 3  | Edge Function retorna HTTP 429 quando chamada excessivamente | VERIFIED | `rateLimiter` Map (line 25) and `checkRateLimit()` (lines 27–37) in `supabase/functions/cotacoes/index.ts`; caller at lines 85–90 returns HTTP 429 with `{ error: 'Rate limit excedido. Tente novamente em 1 minuto.' }` and `Retry-After: 60` header |
| 4  | Usuário vê "Cotações indisponíveis" com motivo quando API falha | VERIFIED | `showToast` at line 367 interpolates `edgeFnErrorMotivo` as `Cotações indisponíveis (${edgeFnErrorMotivo})...`; second toast at line 392 appends `Edge Function: ${edgeFnErrorMotivo}`; `fmtCotacao()` (lines 456–458) returns `<span class="cotacao-indisponivel">N/D</span>` for null/undefined prices; `fmtCotacao` is called in the render table at line 598 |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/functions/cotacoes/index.ts` | Rate limiting + Yahoo shape validation returning 422 | VERIFIED | `validateYahooShape()` defined lines 60–73; HTTP 422 returned at line 199; `checkRateLimit()` defined lines 27–37; HTTP 429 returned at lines 85–90 |
| `js/carteira.js` | `edgeFnErrorMotivo` propagated to `showToast`; `fmtCotacao()` renders N/D | VERIFIED | `edgeFnErrorMotivo` declared line 335, populated lines 354–359, used in `showToast` lines 366–367 and 391–392; `fmtCotacao()` defined lines 456–458, used line 598 |
| `.github/scripts/update_tesouro.py` | `assert_output()` validates structure and fails with clear message | VERIFIED | `assert_output()` defined lines 28–40; called in `main()` at line 205 before file write; column validation with real header dump at lines 128–136 |
| `.github/workflows/tesouro-cache.yml` | Step with `id: fetch_ckan` + diagnostic step on failure | VERIFIED | Step `id: fetch_ckan` at line 17; diagnostic step `if: failure() && steps.fetch_ckan.outcome == 'failure'` at lines 20–27 with `exit 1` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `validateYahooShape()` | HTTP 422 response | `if (!validated.valid)` branch (line 197) | WIRED | Returns `{ error: validated.reason }` with status 422 |
| `checkRateLimit()` | HTTP 429 response | `if (!checkRateLimit(ip))` branch (line 85) | WIRED | Returns `{ error: ... }` with status 429 and Retry-After header |
| Edge Function 422/429/500 error | `edgeFnErrorMotivo` in frontend | `res.status` check + `errData.error` parse in `carteiraBuscarCotacao` (lines 349–355) | WIRED | All non-2xx statuses captured; error string stored in `edgeFnErrorMotivo` |
| `edgeFnErrorMotivo` | `showToast` user message | Template literal interpolation at lines 366–367 and 391–392 | WIRED | Both no-token and BRAPI-also-failed paths show motivo |
| `fmtCotacao(null)` | `N/D` span rendered | Called with `a.preco` in render loop line 598 | WIRED | Returns `<span class="cotacao-indisponivel">N/D</span>` |
| `assert_output()` | GitHub Action failure | Called at line 205, raises `RuntimeError` caught by `sys.exit(1)` at line 196 | WIRED | Script exits 1, step `fetch_ckan` fails, diagnostic step triggers |
| `fetch_ckan` step failure | Diagnostic step | `if: failure() && steps.fetch_ckan.outcome == 'failure'` in workflow | WIRED | Diagnostic step prints headers guidance and exits 1 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `js/carteira.js` `showToast` toast message | `edgeFnErrorMotivo` | HTTP response body `errData.error` from Edge Function | Yes — populated from actual API error string returned by Edge Function | FLOWING |
| `js/carteira.js` `fmtCotacao()` | `a.preco` | Price object from Yahoo Finance fetch result | Yes — null when API returns no price, real number when present | FLOWING |
| `supabase/functions/cotacoes/index.ts` `validateYahooShape` | `data` | `await yahooRes.json()` (line 195) from live Yahoo Finance HTTP call | Yes — validates real upstream response shape | FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED — Edge Function requires Deno/Supabase runtime; frontend JS requires browser. No local runnable entry points for these artifacts.

### Requirements Coverage

No explicit `requirements:` frontmatter in PLAN files maps to REQUIREMENTS.md IDs. Phase 4 requirements are expressed entirely as ROADMAP.md Success Criteria, all of which are covered by the four verified truths above.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `supabase/functions/cotacoes/index.ts` | 346 | `// results vazio mas sem erro — fallthrough silencioso` with only `console.warn` | Info | Partial: when Yahoo returns an empty `results` object without an error field, execution falls through to BRAPI silently. This is documented behavior (silent fallthrough to fallback), not a stub — the BRAPI path handles it. No user-visible R$0 results since `fmtCotacao` covers null prices. |

No blockers or warnings found. The single info-level item is intentional fallthrough design.

### Human Verification Required

1. **Yahoo Finance 422 toast in browser**
   **Test:** Temporarily break the Yahoo Finance URL in the Edge Function, trigger "Atualizar cotações", and observe the toast.
   **Expected:** Toast reads "Cotações indisponíveis (Yahoo Finance: campo "spark" ausente — formato pode ter mudado)..." or similar motivo string.
   **Why human:** Requires live Supabase Edge Function deployment and browser interaction.

2. **N/D rendering for un-priced assets**
   **Test:** Add an asset without triggering a cotacao update; observe the price column in the portfolio table.
   **Expected:** Price cell shows italicized grey "N/D" text; total cell also shows "N/D".
   **Why human:** Requires browser DOM inspection.

3. **Rate-limit 429 triggers toast**
   **Test:** Call the Edge Function 11 times in under 60 seconds from the same IP.
   **Expected:** 11th call returns 429 and toast shows the rate-limit motivo.
   **Why human:** Requires live deployed Edge Function and controlled HTTP tooling.

### Gaps Summary

No gaps. All four success criteria are fully implemented and wired:

- `validateYahooShape()` exists, returns structured error, and the caller converts it to a 422 response with `{ error: string }`.
- `edgeFnErrorMotivo` is declared, populated from the error body for all non-2xx statuses, and interpolated into both `showToast` call sites.
- `fmtCotacao()` is defined and called in the render path for every portfolio row price cell.
- `assert_output()` validates title count and `_generatedAt` presence, raises `RuntimeError` on failure, and is called unconditionally before file write.
- The workflow `fetch_ckan` step has the correct `id`, and the diagnostic step fires on failure with a clear message and non-zero exit code.

---

_Verified: 2026-04-06T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
