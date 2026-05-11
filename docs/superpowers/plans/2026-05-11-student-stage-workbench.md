# Student Stage Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a desktop-aligned three-stage profile editing workbench for the student stage pages.

**Architecture:** Reuse the existing `StudentWorkspace` and `StudentSummaryRail` layout. Keep each `/student/profile/stage/[stage]` route responsible for a single active stage, and add shared navigation/progress context around it.

**Tech Stack:** Next.js 14, React 18, TypeScript, Ant Design 5, Tailwind CSS, Jest, Testing Library.

---

### Task 1: Stage Page Test Coverage

**Files:**
- Create: `apps/web/src/app/(student)/student/profile/stage/[stage]/__tests__/StudentStageFormPage.test.tsx`

- [ ] Write a jsdom test that mocks `next/navigation`, `@tanstack/react-query`, and `studentApi.getMyProfile`.
- [ ] Assert that stage 2 renders a workbench title, three stage navigation links, the active stage title, and a save button.
- [ ] Run `pnpm --filter web test apps/web/src/app/(student)/student/profile/stage/[stage]/__tests__/StudentStageFormPage.test.tsx` and confirm the test fails before implementation because the workbench navigation does not exist.

### Task 2: Workbench Layout

**Files:**
- Modify: `apps/web/src/app/(student)/student/profile/stage/[stage]/page.tsx`

- [ ] Import `Link`, `usePathname`, `StudentWorkspace`, `StudentWorkspacePanel`, and `StudentSummaryRail`.
- [ ] Add helpers for `stagePercent`, `stageHref`, `stageMeta`, and `renderStageSwitcher`.
- [ ] Replace the standalone `Card` with `StudentWorkspace`, a header band, a three-stage switcher, a `Form` in a workspace panel, and an aside with progress/save actions.
- [ ] Preserve the invalid-stage, loading, form hydration, and `onSave` logic.

### Task 3: Form Section Polish

**Files:**
- Modify: `apps/web/src/app/(student)/student/profile/stage/[stage]/page.tsx`

- [ ] Split each stage field function into visual sections using a local `FormSection` helper.
- [ ] Change fixed grids such as `grid-cols-4` to responsive grids such as `grid-cols-1 sm:grid-cols-2 xl:grid-cols-4`.
- [ ] Group checkboxes/radio-heavy areas so desktop pages scan in rows and mobile remains single-column.

### Task 4: Verification

**Files:**
- Verify only; no production edits expected.

- [ ] Run the focused stage page test.
- [ ] Run the existing student workspace tests.
- [ ] Run `pnpm --filter web build`.
- [ ] Use Playwright/browser checks on `/student/profile/stage/1`, `/student/profile/stage/2`, and `/student/profile/stage/3` at desktop and mobile widths, checking for nonblank content and no horizontal overflow.
