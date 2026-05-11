# Student Stage Workbench Design

## Goal

Improve `/student/profile/stage/1`, `/student/profile/stage/2`, and `/student/profile/stage/3` so the three stages feel like one desktop-first profile editing workflow while preserving the existing backend contract that each stage saves only its own fields.

## Design

Use the existing student workspace shell instead of a standalone form card. The left rail continues to show the student identity/navigation. The main column becomes a profile-editing workbench with a compact header, a three-stage switcher, and grouped form sections. The optional desktop aside shows current stage progress, all three stage shortcuts, and a save action.

The three stages are visually colocated through the switcher and progress panel, but the route still edits one stage at a time. This avoids a giant form with mixed validation and protects the current optimistic-lock/dataVersion flow.

## Components

- `StudentStageFormPage` keeps the current query, form hydration, and `onSave` API behavior.
- A local stage navigator renders links for stages 1, 2, and 3 with percent/completion from `profile.progress.stageProgress`.
- Stage field functions are reorganized into titled sections with responsive grids, using existing Ant Design controls and the site color tokens.
- New lightweight helper functions compute stage percent, current stage metadata, and stage links.

## Data Flow

`studentApi.getMyProfile()` still hydrates the form. Saving validates only the active stage. Stage 1 keeps the existing 9-subject UI translation to the backend slot fields. Stages 2 and 3 submit the current form values as before.

## Testing

Add a focused component/page test that verifies the stage page renders the three-stage workbench navigation and keeps the current stage content active. Run the focused Jest test, the existing workspace tests, `pnpm --filter web build`, and browser checks for desktop/mobile stage URLs.
