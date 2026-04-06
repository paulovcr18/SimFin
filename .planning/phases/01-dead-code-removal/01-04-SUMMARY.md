---
plan: 01-04
phase: 01-dead-code-removal
status: complete
completed: 2026-04-05
---

# Plan 01-04 Summary: Remove Scenario UI + Fix Silent Catch Blocks

## Objective
Remove the broken scenario management UI from the PWA topbar (saves only name/timestamp, not inputs) and fix the silent `catch(e) {}` blocks in `authOnLogin` that swallowed initialization errors invisibly.

## Tasks Completed

| # | Task | Status | Commit |
|---|------|--------|--------|
| 1 | Remove scenario management UI from index.html topbar | ✅ | 4e16d64 |
| 2 | Fix silent catch blocks in js/auth.js authOnLogin | ✅ | 353a733 |

## What Was Done

### Task 1: Remove Scenario UI
- Removed `#scenarioWrap` div and all child elements (scenario dropdown, save/load buttons, export buttons) from `index.html` topbar
- `grep 'scenarioWrap' index.html` → 0 matches (removed)
- No schema changes — `simulacoes.versoes jsonb` left intact per CONTEXT.md decision

### Task 2: Fix Silent Catch Blocks
- Changed all `catch(e) {}` blocks in `authOnLogin` to `catch(e) { console.error('[init]', e); }`
- Removed `scenarioAutoTouch()` call (scenario feature removed)
- 7 catch blocks now log errors to console
- `grep -c 'console.error' js/auth.js` → 7

## Key Files Modified
- `index.html` — scenario UI block removed from topbar
- `js/auth.js` — authOnLogin catch blocks now log errors, scenarioAutoTouch() removed

## Deviations
- Agent hit usage limit before creating SUMMARY.md and metadata commits; SUMMARY created manually by orchestrator
- Merge conflict on js/auth.js resolved using worktree version (correct target state)
