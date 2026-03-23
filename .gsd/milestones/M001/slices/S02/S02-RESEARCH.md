# S02 — Research

**Date:** 2026-03-23

## Summary

S02 is targeted research, not deep exploration. The slice is straightforward extension of the S01 pattern: add two DB-backed planning handlers (`gsd_plan_slice`, `gsd_plan_task`), add full DB→markdown renderers for `S##-PLAN.md` and `T##-PLAN.md`, register both tools, and cover the runtime contract that task plan files must still exist on disk. The active requirements this slice directly owns are R003, R004, R008, and R019.

The main constraint is that this is not just “store more planning fields.” The slice plan file and per-task plan files remain part of the runtime. `auto-recovery.ts` explicitly rejects a `plan-slice` artifact when referenced task plan files are missing, `execute-task` prompt flow expects task plans on disk, and `buildSkillActivationBlock()` consumes `skills_used` from task-plan frontmatter. So the implementation must write DB state and also render both artifact layers truthfully from that state.

## Recommendation

Follow the S01 handler pattern exactly: validate flat params → one transaction → render markdown from DB → invalidate both state and parse caches. Reuse the existing `insertSlice`/`upsertSlicePlanning` and `insertTask` primitives in `gsd-db.ts`; do not invent a new storage layer. Add minimal new validation/handler modules and renderer functions rather than refactoring shared infrastructure in this slice.

Treat `S##-PLAN.md` as a slice-level rendered view from `slices` + `tasks` rows, and `T##-PLAN.md` as a task-level rendered view from one `tasks` row plus fixed frontmatter fields. Preserve existing parser/runtime compatibility instead of optimizing schema shape. That lines up with the `create-gsd-extension` skill rule to extend existing GSD extension primitives rather than introducing parallel abstractions, and with the `test` skill rule to match existing test patterns and immediately verify generated behavior under the repo’s real resolver harness.

## Implementation Landscape

### Key Files

- `src/resources/extensions/gsd/tools/plan-milestone.ts` — canonical planning-tool reference. Establishes the exact validation → transaction → render → `invalidateStateCache()` + `clearParseCache()` flow S02 should mirror.
- `src/resources/extensions/gsd/bootstrap/db-tools.ts` — registers `gsd_plan_milestone`. S02 needs parallel registrations for `gsd_plan_slice` and `gsd_plan_task`, with the same execute/error/details shape and canonical-name guidance.
- `src/resources/extensions/gsd/gsd-db.ts` — schema v8 already contains the needed planning columns. `insertSlice`, `upsertSlicePlanning`, `insertTask`, `getSlice`, `getTask`, `getSliceTasks`, and `getMilestoneSlices` already expose most of the storage/query surface S02 needs.
- `src/resources/extensions/gsd/markdown-renderer.ts` — has `renderRoadmapFromDb()` and shared helpers `toArtifactPath()`, `writeAndStore()`, and cache invalidation. Natural place to add `renderPlanFromDb()` and `renderTaskPlanFromDb()`.
- `src/resources/extensions/gsd/templates/plan.md` — authoritative output shape for slice plans. The renderer should emit markdown parse-compatible with this structure, especially the `## Tasks` checkbox lines and `Verify:` field formatting.
- `src/resources/extensions/gsd/templates/task-plan.md` — authoritative task plan structure. Critical fields: frontmatter `estimated_steps`, `estimated_files`, `skills_used`; sections for Description, Steps, Must-Haves, Verification, optional Observability Impact, Inputs, Expected Output.
- `src/resources/extensions/gsd/files.ts` — parser compatibility target. `parsePlan()` still drives transition-window callers, and `parseTaskPlanFile()` only reads task-plan frontmatter today. Rendered files must satisfy these parsers without new parser work in this slice.
- `src/resources/extensions/gsd/auto-recovery.ts` — enforces R019. `verifyExpectedArtifact("plan-slice", ...)` fails when task IDs appear in `S##-PLAN.md` but matching `tasks/T##-PLAN.md` files are missing.
- `src/resources/extensions/gsd/auto-prompts.ts` — `buildSkillActivationBlock()` parses `skills_used` from task-plan frontmatter. If renderer omits or malforms that list, downstream executor prompt routing degrades.
- `src/resources/extensions/gsd/prompts/plan-slice.md` — already updated to say DB-backed tool should own state. S02 likely needs prompt contract tightening once tool names exist, but S01 already removed PLAN-as-source-of-truth framing.
- `src/resources/extensions/gsd/tests/plan-milestone.test.ts` — best reference for handler tests: validation failure, DB write success, render failure behavior, idempotent rerun, observable cache invalidation.
- `src/resources/extensions/gsd/tests/markdown-renderer.test.ts` — existing renderer/stale-repair coverage pattern. Best place for slice/task plan render tests and stale detection if needed.
- `src/resources/extensions/gsd/tests/auto-recovery.test.ts` — already proves missing task plan files break `plan-slice` artifact validity. S02 should add integration-style tests that its renderer satisfies this contract.
- `src/resources/extensions/gsd/tests/migrate-hierarchy.test.ts` — confirms legacy markdown import populates planning columns (`goal`, task status/order, etc.). Useful as parity reference when deciding which DB fields the new renderer must expose.

### Build Order

1. **Renderer shape first** — implement `renderPlanFromDb()` and `renderTaskPlanFromDb()` in `markdown-renderer.ts` before tool handlers. This is the highest-risk compatibility point because transition-window callers still parse markdown and runtime checks still require plan files on disk.
2. **Slice/task handler implementation second** — add `tools/plan-slice.ts` and `tools/plan-task.ts` following the S01 handler pattern, using existing DB primitives and new renderers.
3. **Tool registration third** — wire both handlers into `bootstrap/db-tools.ts` after handler behavior is stable.
4. **Prompt/test contract updates last** — only after tool names and artifact paths are real. Keep prompt work narrow: assert the prompts reference the DB-backed path and not direct artifact writes.

This order isolates the root risk first: if rendering is wrong, handlers and prompts still fail the slice. The `debug-like-expert` skill’s “verify, don’t assume” rule applies here — prove rendered files satisfy parser/runtime contracts before layering more orchestration on top.

### Verification Approach

Run the repo’s resolver-based TypeScript harness, not bare `node --test`.

Primary proof command:

`node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/plan-slice.test.ts src/resources/extensions/gsd/tests/plan-task.test.ts src/resources/extensions/gsd/tests/markdown-renderer.test.ts src/resources/extensions/gsd/tests/auto-recovery.test.ts src/resources/extensions/gsd/tests/prompt-contracts.test.ts`

What to prove:

- `plan-slice` handler validates flat params, rejects missing/invalid fields, verifies the slice exists, writes slice planning/task rows, renders `S##-PLAN.md`, and clears both caches.
- `plan-task` handler validates flat params, verifies parent slice exists, writes task planning fields, renders `tasks/T##-PLAN.md`, and clears both caches.
- `renderPlanFromDb()` emits parse-compatible task checkbox entries and slice sections from DB state.
- `renderTaskPlanFromDb()` writes parse-compatible frontmatter with `estimated_steps`, `estimated_files`, and `skills_used`, plus the required markdown sections.
- A rendered slice plan plus rendered task plans satisfies `verifyExpectedArtifact("plan-slice", ...)`.
- Prompt contracts mention the new DB-backed tool path rather than manual file writes, if prompts are changed.

## Constraints

- Schema work should stay minimal. `gsd-db.ts` already has the v8 columns needed for slice and task planning (`goal`, `success_criteria`, `proof_level`, `integration_closure`, `observability_impact`, plus task `description`, `estimate`, `files`, `verify`, `inputs`, `expected_output`).
- `getSliceTasks()` and `getMilestoneSlices()` still order by `id`, not an explicit sequence column. S02 should not try to solve ordering beyond the current ID-based convention; sequence-aware ordering belongs to S04 per roadmap.
- Task-plan frontmatter is already a runtime input. `parseTaskPlanFile()` normalizes numeric strings and scalar/list `skills_used`, so rendered output should stay conservative and explicit rather than clever.
- Tool registration in this extension uses TypeBox object schemas in `db-tools.ts`; follow the existing project pattern already present for `gsd_plan_milestone`.

## Common Pitfalls

- **Rendering only the slice plan** — R019 will still fail because `auto-recovery.ts` checks that every task listed in `S##-PLAN.md` has a matching `tasks/T##-PLAN.md` file.
- **Forgetting cache invalidation after successful render** — S01 already proved stale parse-visible state is the failure mode; S02 must clear both `invalidateStateCache()` and `clearParseCache()` after DB + render success.
- **Writing task plans without `skills_used` frontmatter** — executor prompt skill activation silently loses task-specific skill routing because `buildSkillActivationBlock()` reads that field.
- **Using a new ad hoc markdown format** — transition-window callers still depend on `parsePlan()` and task-plan conventions. Match existing template/test shapes, don’t redesign the documents.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| GSD extension/tooling | `create-gsd-extension` | installed |
| Test execution / harness discipline | `test` | installed |
| Root-cause-first verification | `debug-like-expert` | installed |
| SQLite / migration-heavy planning storage | `npx skills add martinholovsky/claude-skills-generator@sqlite-database-expert -g` | available |
| TypeBox schema authoring | `npx skills add epicenterhq/epicenter@typebox -g` | available |
