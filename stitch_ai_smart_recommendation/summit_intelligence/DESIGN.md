# Design System Specification: The Academic Intelligence Framework

## 1. Overview & Creative North Star
**Creative North Star: The Informed Architect**
This design system moves away from the "playful" nature of traditional EdTech. Instead, it adopts the persona of a high-end consulting firm—think McKinsey or Goldman Sachs—reimagined for the high-stakes world of university admissions. We are not just building a tool; we are building a "Digital War Room" for students.

**Editorial Direction:**
To break the "template" feel, this system utilizes **Intentional Asymmetry**. We pair expansive white space with dense, high-precision data clusters. By using overlapping layers and a massive typographic scale contrast, we create a sense of "Authority through Precision." The layout should feel like a premium printed intelligence report: clean, structured, yet technologically advanced.

---

## 2. Color & Tonal Architecture
The palette is rooted in deep institutional trust, augmented by "Intelligence Cyans" that signal AI-driven insights.

### Core Palette
- **Primary (`#003fb1` / `primary`):** The foundation of authority. Use for high-level branding and primary navigation.
- **Secondary (`#006973` / `secondary`):** Represents the "AI Engine." Use for data visualizations, insights, and technological highlights.
- **Tertiary/Accent (`#723b00` / `tertiary`):** The "Elite" status indicator. Reserved for top-tier university recommendations and "Gold" status.
- **Error/Risk (`#ba1a1a` / `error`):** Used strictly for high-risk admission "Reach" levels.

### The "No-Line" Rule
**Prohibition of 1px Borders:** To maintain a premium, editorial feel, 1px solid borders for sectioning are strictly forbidden. 
- **The Solution:** Define boundaries through background shifts. A `surface-container-low` (`#f3f3fe`) section should sit directly against a `surface` (`#faf8ff`) background to create a "Block" of content.

### Signature Textures & Glassmorphism
- **The Deep Gradient:** Primary CTAs should use a linear gradient from `primary` (`#003fb1`) to `primary_container` (`#1a56db`) at a 135-degree angle. This adds "soul" to the professional blue.
- **The Intelligence Overlay:** Floating sidebars or data-info panels should use Glassmorphism: `surface_container_lowest` at 80% opacity with a `24px` backdrop-blur. This makes the data feel like it’s floating over a sophisticated engine.

---

## 3. Typography: The Editorial Scale
We use two typefaces to balance humanistic intelligence with technical precision.

*   **Display & Headlines (Manrope):** A modern, geometric sans-serif. Used for high-impact numbers and section headers to convey modernity and confidence.
*   **Body & Labels (Inter):** A workhorse for readability. Used for all data-dense tables, descriptions, and UI controls.

### The Scale
- **Display-LG (3.5rem / Manrope):** For hero statistics (e.g., your percentile).
- **Headline-SM (1.5rem / Manrope):** For major module titles.
- **Title-SM (1rem / Inter / Bold):** For card headers.
- **Body-MD (0.875rem / Inter):** The standard for all explanatory text.
- **Label-SM (0.6875rem / Inter / Uppercase / Tracking 0.05em):** For meta-data like "Admission Probability."

---

## 4. Elevation & Depth: Tonal Layering
Traditional shadows are too "web-standard." We use **Tonal Layering** to create a 3D environment.

- **The Layering Principle:** 
    - Level 0: `surface` (`#faf8ff`) - The main canvas.
    - Level 1: `surface-container-low` (`#f3f3fe`) - Content grouping areas.
    - Level 2: `surface-container-lowest` (`#ffffff`) - Individual interactive cards.
- **Ambient Shadows:** When a card requires a "lift" on hover, use an extra-diffused shadow: `0 20px 40px rgba(25, 27, 35, 0.06)`. The tint is derived from `on-surface`, not pure black, ensuring it looks like natural light hitting fine paper.
- **The Ghost Border:** For accessibility in forms, use `outline_variant` (`#c3c5d7`) at **20% opacity**. It provides a "hint" of a boundary without breaking the soft, premium aesthetic.

---

## 5. Components: The Intelligence Suite

### Cards & Data Modules
- **Rule:** Absolute prohibition of divider lines.
- **Spacing:** Use `spacing-6` (1.5rem) or `spacing-8` (2rem) to separate internal content.
- **Visual Distinction:** Use a `2px` left-accent bar in `primary` or `secondary` to denote "Active" or "Recommended" status instead of a full border.

### Primary Buttons
- **Style:** `rounded-md` (0.75rem / 12px).
- **Fill:** Linear gradient (Primary to Primary-Container).
- **Text:** `label-md` (Inter / Semibold / White).
- **Interaction:** On hover, the button should "glow" slightly using a primary-colored ambient shadow, rather than changing color.

### Data Chips (The Status Indicators)
- **Elite Status:** `tertiary_fixed` background with `on_tertiary_fixed` text.
- **AI Recommendation:** `secondary_fixed` background with `on_secondary_fixed_variant` text.
- **Style:** Pill-shaped (`rounded-full`), no border, subtle padding (`0.5rem` x `1rem`).

### Form Inputs
- **Background:** `surface_container_highest` (`#e2e1ed`) with a bottom-only focus bar in `primary`.
- **Labeling:** Floating labels using `label-sm` to maximize vertical space for data entry.

---

## 6. Do's and Don'ts

### Do
- **Do use "Breathable Data":** Give large tables horizontal breathing room. The whitespace *is* the luxury.
- **Do use Asymmetric Hero Layouts:** Place your most important CTA off-center to create a dynamic, editorial feel.
- **Do use Tinted Grays:** Always use the `surface_variant` tokens which contain a hint of blue/purple. Never use "Dead Gray" (`#888888`).

### Don't
- **Don't use 1px Dividers:** Use background color steps (`surface` to `surface-container`) to separate sections.
- **Don't use Standard Drop Shadows:** Avoid the "fuzzy black" look. If it’s not ambient and tinted, don’t use it.
- **Don't Crowd the Content:** In a university entrance context, anxiety is high. Use the `spacing-12` and `spacing-16` tokens to create "calm zones" between data clusters.
- **Don't use Bright Red for Everything:** Use `error` (`#ba1a1a`) only for genuine risks (e.g., <10% admission chance). Use `tertiary` (Golden) for everything aspirational.