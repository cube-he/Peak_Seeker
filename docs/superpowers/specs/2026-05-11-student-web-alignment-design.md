# Student Web Alignment Design

Date: 2026-05-11
Project: VolunteerHelper / WillNest student web app

## Context

The Claude design kit contains several student pages in a 520px mobile-shell layout. The live WillNest visual language has already moved toward a desktop web style on the auth and profile surfaces: deep navy, warm cream, antique gold accents, serif display numbers, quiet card shadows, and restrained Ant Design controls.

This design aligns the student core pages with that web style while preserving the mobile experience.

## Approved Scope

Update the student core pages:

- `/student/dashboard`
- `/student/profile`
- `/student/plans`
- `/student/recommend`

Out of scope for this pass:

- Backend API changes
- Prisma schema or migration changes
- OCR service changes
- Stage form redesign for `/student/profile/stage/[stage]`
- A new visual system or UI library

The stage form pages must remain reachable from the profile page, but their form layout is not part of this desktop redesign.

## Selected Approach

Use a shared three-column student workspace on desktop:

- Left rail: student identity, core score/rank context, and student navigation.
- Main content: the page's primary task and detailed content.
- Right rail: progress, submit actions, reminders, next steps, and contextual help.

Responsive behavior:

- Desktop: 1200px workspace with three columns.
- Tablet: collapse to a main-first layout with reduced side content.
- Mobile: preserve the current single-column flow and bottom navigation.

This approach was selected over a simple wide content layout or tabbed dashboard because it gives the four pages a consistent desktop information architecture while reusing the existing mobile card content and WillNest design vocabulary.

## Shared Shell

The student layout should provide the common frame:

- Sticky frosted cream top bar with `BrandLogo`, notifications, and user menu.
- Desktop student rail hidden on mobile.
- Existing bottom navigation visible on mobile and tablet breakpoints where appropriate.
- Main container expanded from the current narrow mobile-first constraint to a desktop workspace.
- Shared active-route logic for dashboard, plans, recommend, universities, and profile.

The shell should not force every page into identical content. It should expose reusable layout primitives so each page can compose its own main and right rail content.

## Reusable UI Pieces

Create or refactor only where reuse is immediate:

- Student workspace container.
- Student summary rail.
- Desktop section/card wrappers.
- Right rail card/action wrappers.
- Compact stat strips.

Reuse existing components where possible:

- `BrandLogo`
- `CompactProgress`
- `SaveStatusBar`
- `PlanStatusBadge`
- Existing Ant Design icons and controls
- Existing card, chip, and progress color tokens from Tailwind and `globals.css`

Avoid introducing new colors, large decorative gradients, or unrelated component abstractions.

## Page Designs

### `/student/profile`

Role: the visual and structural baseline for the student desktop workspace.

Main content:

- Navy profile hero with avatar, name, school, exam context, and edit action.
- Four-stat strip for score, rank, completeness, and filled fields.
- Profile sections in a two-column desktop grid:
  - Basic information
  - Subject selection
  - Score structure
  - Preferences

Right rail:

- Save status.
- Recommendation data completeness via `CompactProgress`.
- Intake confirmation status and submit action.
- Three stage-entry cards.
- Account and settings shortcuts.

Mobile:

- Keep the existing single-column order and bottom navigation.

### `/student/dashboard`

Role: student overview and next-action page.

Main content:

- Welcome hero with date, score/rank, plans, and countdown.
- Decision progress strip.
- Quick actions.
- Current plan summary.

Right rail:

- Message reminders.
- Timeline or countdown context.
- Profile completion prompt and plan generation readiness.

Mobile:

- Keep the existing card stack, but align spacing and headings with profile where needed.

### `/student/plans`

Role: scan and open teacher-generated plans.

Main content:

- Page header and plan counts.
- Segmented filter controls.
- Plan cards widened for desktop so status, batch, version, counts, update time, and action are visible without cramped wrapping.

Right rail:

- Plan status explanation.
- Current plan summary.
- Informational card for export/new-plan capability where backend support is not available yet.

Mobile:

- Keep current stacked plan cards and floating action behavior if still useful.

### `/student/recommend`

Role: recommendation entry and quick recommendation results.

Main content:

- Current score input/recap.
- Primary recommendation CTA.
- Recommendation path cards.
- Rush/stable/safe result groups.

Right rail:

- Recommendation readiness checklist.
- Missing profile fields if available.
- Teacher contact or "view universities" next actions.

Mobile:

- Keep current single-column recommendation flow.

## Visual Rules

Use the existing WillNest system:

- Background: warm cream.
- Cards: `surface`, radius 10-12px, featherweight shadow.
- Primary: deep navy.
- Accent: antique gold used sparingly for important numbers, eyebrows, and calls to action.
- Status: rush red, stable/primary navy or gold as already used locally, safe green.
- Typography: serif for display headings and numbers, sans for body and controls.
- Icons: Ant Design Outlined icons only.

Do not add:

- Purple gradients.
- Decorative orbs or unrelated bokeh.
- Nested cards inside cards.
- Marketing-style hero sections on task pages.
- New UI libraries.

## Data And Error Handling

The redesign should preserve existing data fetching and mutation behavior:

- Existing React Query keys and services remain unchanged unless a local rename is required for clarity.
- Existing loading and error states remain visible.
- Empty states stay explicit and useful.
- Intake submit behavior and disabled logic remain unchanged.
- Quick recommendation behavior remains unchanged.

If a page lacks data for a desktop rail item, show a restrained empty state or omit that item rather than inventing fake data.

## Testing And Verification

Implementation should include verification proportional to the change:

- Run existing relevant component tests after refactors.
- Add focused tests if new helper components contain route logic, formatting logic, or conditional rendering that is easy to regress.
- Run `pnpm --filter web test` if feasible.
- Run `pnpm --filter web lint`.
- Run `pnpm --filter web build`.
- Browser-check desktop and mobile widths:
  - 1440px
  - 1200px
  - 768px
  - 390px

Acceptance criteria:

- The four approved student pages no longer appear as a 520px mobile shell on desktop.
- Desktop pages share the same student workspace rhythm.
- Mobile pages remain usable and do not gain horizontal scroll.
- No incoherent text overlap, button overflow, or card nesting.
- Existing student workflows remain reachable: profile stages, plans, recommendations, universities, and logout.

## Risks

- The current source contains mojibake text in several files. The implementation should avoid broad copy rewrites unless needed for touched UI text.
- Some plan and recommendation data is incomplete or backend-limited. Desktop design should expose those limitations honestly.
- Changing the layout shell affects multiple student pages. Keep the shell change small and verify all student routes after the refactor.
