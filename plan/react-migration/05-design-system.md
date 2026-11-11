# Design System: Obsidian & Platinum Atelier

A sleek, ultra-luxury monochrome visual language designed for haute couture, fine timepieces, bespoke automotive, and high-end atelier brands.

---

## 1. Brand Identity & Philosophy

- **Tone & Mood**: Mysterious, authoritative, understated prestige, bespoke craftsmanship, architectural precision.
- **Visual Thesis**: "Deep noir surfaces punctuated by frosted platinum luminescence." Eliminates all saturated chromatic accents in favor of pure, luminous metallic restraint.
- **Aesthetic Pillars**:
  - Generous negative space and intentional asymmetry.
  - Razor-thin 1px metallic borders (`border-white/10` to `border-[#E5E4E2]/25`).
  - Subtle frosted glass and dark obsidian gradient depths.
  - High-fashion editorial typography with dramatic scale contrasts.

---

## 2. Color Palette & Tokens

### Base & Obsidian Surfaces
| Token Name | Hex Code | Purpose / Usage |
| :--- | :--- | :--- |
| `surface-container-lowest` | `#0A0A0A` | Deepest background void, global canvas backing |
| `surface` / `surface-dim` | `#131313` | Primary screen and card background foundation |
| `surface-container-low` | `#181818` | Base cards, secondary panels |
| `surface-container` | `#1E1E1E` | Elevated cards, list items, floating dialogs |
| `surface-container-high` | `#262626` | Hover states, active tabs, inset wells |
| `surface-container-highest` | `#333333` | Badges, subtle dividers, pill backings |
| `surface-bright` | `#3A3939` | Highlighted surfaces, interactive borders |

### Platinum & Accent Hierarchy
| Token Name | Hex Code | Purpose / Usage |
| :--- | :--- | :--- |
| `primary` (Platinum Luster) | `#E5E4E2` | Hero badges, key accent highlights, metallic iconography |
| `primary-container` | `#F4F4F2` | High-contrast call-to-actions, inverted luxury buttons |
| `on-primary` | `#0E0E0E` | High-contrast text on platinum CTA buttons |
| `platinum-muted` | `#A3A2A0` | Secondary metadata, tracked subheads, captions |
| `outline` / `border-subtle` | `#2D2C2C` | Hairline dividers, card outlines (1px solid) |
| `outline-focus` | `#E5E4E2` | Active state outlines and focus rings |

---

## 3. Typography & Hierarchy

- **Display & Headlines**: `Bodoni Moda` (or high-contrast luxury serif such as `Playfair Display` / `Didot`).
  - **Weight**: 400 (Regular) to 600 (SemiBold).
  - **Letter-spacing**: Tight to neutral (`tracking-tight` for large hero titles; dramatic wide tracking `tracking-[0.25em]` for uppercase section eyebrow headers).
- **Body & Technical Data**: `Inter` / `Plus Jakarta Sans` / `Helvetica Neue`.
  - **Weight**: 300 (Light) and 400 (Regular).
  - **Treatment**: High legibility, neutral grotesk feel, subtle opacity layers (`text-white/80`, `text-[#A3A2A0]`).

### Scale Specifications
- **Hero Title / Display XL**: `2.75rem - 3.5rem` (44px - 56px), serif, line-height 1.1.
- **Section Heading / H2**: `1.75rem - 2.25rem` (28px - 36px), serif, line-height 1.25.
- **Card Title / H3**: `1.25rem - 1.5rem` (20px - 24px), serif or medium grotesk.
- **Eyebrow / Overline**: `0.6875rem` (11px), uppercase, `tracking-[0.2em]`, font-medium, platinum.
- **Body Regular**: `0.9375rem` (15px), line-height 1.6, `text-neutral-300`.
- **Caption / Meta**: `0.75rem` (12px), `text-neutral-500`, tracking-wider.

---

## 4. Components & Interactive Patterns

### Buttons & CTAs
- **Primary Luxury Action**:
  - Background: `#F4F4F2` (Luminous Platinum).
  - Text: `#0E0E0E`, Uppercase, `tracking-[0.15em]`, font-semibold.
  - Hover / Active: Subtle glow (`shadow-[0_0_25px_rgba(229,228,226,0.25)]`), opacity transition.
- **Secondary Ghost Action**:
  - Background: Transparent with `1px solid rgba(229, 228, 226, 0.25)`.
  - Text: `#E5E4E2`, tracking-widest, hover state shifts border to 60% opacity.

### Badges & Tags
- Rounded pill (`rounded-full`) or sharp 2px radius (`rounded-sm`).
- Inset: `px-3 py-1`, background `rgba(255, 255, 255, 0.05)`, border `1px solid rgba(229, 228, 226, 0.15)`.
- Text: 11px uppercase tracked metadata.

### Cards & Elevation
- No heavy dropshadows; depth is created strictly through surface tinting and hairline metallic borders.
- Border treatment: `border border-white/[0.08]` with optional top highlight gradient (`linear-gradient(to right, transparent, rgba(229,228,226,0.3), transparent)`).
- Card corner radius: Restrained `rounded-xl` (12px) or architectural `rounded-none`.

---

## 5. Layout & Spacing Rules

- **Mobile Viewport Grid**: 16px to 24px horizontal gutter margins.
- **Vertical Rhythm**: Generous 32px to 48px sectional breaks to reinforce unhurried luxury pacing.
- **Imagery**: Monochromatic, deep moody lighting, metallic reflections, macro product crops, high-key contrast.
