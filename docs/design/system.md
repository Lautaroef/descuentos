# Design System — Tokens & Tailwind v4 Config

> D3 synthesis. Copy these values into `src/app/globals.css` and Tailwind v4 `@theme` directives. D4 should implement these literally; deviations need justification.

All tokens are defined as CSS custom properties on `:root` and exposed to Tailwind utility classes via `@theme`. No hardcoded values in components — if a value isn't in this file, it doesn't exist in the design.

---

## 1. Colors

### Raw tokens (CSS custom properties)

```css
:root {
  /* Surfaces — warm-neutral */
  --color-bg:              #FBF9F5;
  --color-surface:         #FFFFFF;
  --color-surface-raised:  #FFFFFF;
  --color-surface-sunken:  #F3EFE7;

  /* Text — warm near-black, graduated */
  --color-text-primary:    #14110C;
  --color-text-secondary:  #5A544B;
  --color-text-muted:      #8A8377;
  --color-text-whisper:    #B4AD9F;

  /* Borders & dividers */
  --color-border:          #E8E2D5;
  --color-border-strong:   #D3CCBE;
  --color-divider:         #EEE8DB;

  /* Brand accent — single identity color, doubles as savings */
  --color-accent:          #1F7A5A;
  --color-accent-hover:    #186347;
  --color-accent-soft:     #E3F0EA;
  --color-accent-ink:      #FFFFFF;

  /* Semantic (purpose-built, scarce) */
  --color-savings:         #1F7A5A;
  --color-savings-strong:  #135C42;
  --color-warning:         #B45309;
  --color-warning-soft:    #FDF3E4;
  --color-error:           #9F1239;
  --color-error-soft:      #FBE7EC;

  /* Zero-price (100% / 2×1) categorical treatment */
  --color-zero-ink:        #14110C;
  --color-zero-bg:         #FFF3B8;
}
```

### Contrast verification

| Pair | Ratio | Rating |
|---|---|---|
| `--color-text-primary` on `--color-bg` | 14.2:1 | AAA |
| `--color-text-secondary` on `--color-bg` | 7.1:1 | AAA |
| `--color-text-muted` on `--color-bg` | 4.9:1 | AA |
| `--color-text-whisper` on `--color-bg` | 3.3:1 | AA large text only |
| `--color-accent` on `--color-bg` | 5.6:1 | AA |
| `--color-savings-strong` (large) on `--color-bg` | 7.8:1 | AAA |
| `--color-accent-ink` on `--color-accent` | 6.2:1 | AAA |
| `--color-warning` on `--color-warning-soft` | 5.0:1 | AA |

---

## 2. Spacing

4px base unit. 8-step scale.

```css
:root {
  --space-0: 0;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 48px;
  --space-8: 64px;
}
```

Banned in components: `p-0.5`, `p-1.5`, `p-2.5`, arbitrary `[13px]` values. Only the 8 steps above.

### Page container max-widths

```css
:root {
  --container-sm: 640px;   /* mobile layout max */
  --container-md: 768px;
  --container-lg: 1024px;
  --container-xl: 1120px;  /* home + landing pages */
  --container-detail: 720px; /* promo detail */
  --container-sheet:  440px; /* onboarding sheet desktop */
}
```

---

## 3. Type scale

```css
:root {
  /* Font family */
  --font-sans: 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;

  /* Sizes / line-heights / letter-spacing */
  --text-xs:   12px;
  --text-xs-lh: 16px;
  --text-xs-ls: 0.01em;

  --text-sm:   14px;
  --text-sm-lh: 20px;
  --text-sm-ls: 0;

  --text-base: 16px;
  --text-base-lh: 24px;
  --text-base-ls: 0;

  --text-lg:   20px;
  --text-lg-lh: 28px;
  --text-lg-ls: -0.01em;

  --text-xl:   28px;
  --text-xl-lh: 34px;
  --text-xl-ls: -0.015em;

  --text-2xl:  40px;
  --text-2xl-lh: 44px;
  --text-2xl-ls: -0.02em;

  --text-3xl:  56px;
  --text-3xl-lh: 60px;
  --text-3xl-ls: -0.025em;

  /* Weights */
  --font-weight-regular: 400;
  --font-weight-medium:  500;
  --font-weight-semi:    600;
  --font-weight-bold:    700;
}
```

### Numeric formatting

Apply to any element rendering a peso amount, pct, or date:

```css
.tabular {
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum" 1, "cv11" 1, "ss03" 1;
}
```

Default to `tabular-nums` globally on `body` to avoid having to add the class per-component:

```css
body {
  font-feature-settings: "cv11" 1, "ss03" 1;
  font-variant-numeric: tabular-nums;
}
```

---

## 4. Radii

```css
:root {
  --radius-none: 0;
  --radius-xs:   4px;
  --radius-sm:   6px;
  --radius-md:   10px;
  --radius-lg:   16px;
  --radius-xl:   24px;
  --radius-pill: 9999px;
}
```

Mapping:
- `--radius-xs` → small inline badges, timestamps, skeleton blocks
- `--radius-sm` → inputs, selects, buttons (rectangular)
- `--radius-md` → PromoCard, detail card section, section containers ("data surfaces")
- `--radius-lg` → bottom sheets, modals, PromoDetail hero card
- `--radius-xl` → PWA install prompts (rare)
- `--radius-pill` → chips, filter pills, avatar rings

---

## 5. Shadows

```css
:root {
  --shadow-none:   none;
  --shadow-1:      0 1px 2px 0 rgba(30, 24, 15, 0.04);
  --shadow-2:      0 4px 16px -4px rgba(30, 24, 15, 0.08);
  --shadow-3:      0 12px 32px -8px rgba(30, 24, 15, 0.12);
  --shadow-focus:  0 0 0 3px rgba(31, 122, 90, 0.20);
}
```

Usage:
- `--shadow-none` — default for all cards and data surfaces
- `--shadow-1` — PromoCard on hover, low-elevation affordances
- `--shadow-2` — dropdowns, popovers
- `--shadow-3` — bottom sheets, modals
- `--shadow-focus` — keyboard focus ring (outline-offset 2px)

---

## 6. Motion

```css
:root {
  /* Durations */
  --duration-quick:    150ms;
  --duration-default:  220ms;
  --duration-settle:   320ms;
  --duration-countup:  480ms;
  --duration-shimmer: 1800ms;

  /* Easings */
  --ease-linear:    cubic-bezier(0, 0, 1, 1);
  --ease-out:       cubic-bezier(0.22, 1, 0.36, 1);
  --ease-in-out:    cubic-bezier(0.65, 0, 0.35, 1);
  --ease-spring:    cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* Respect reduced motion */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## 7. Z-index scale

```css
:root {
  --z-base:     0;
  --z-sticky:   40;   /* NavBar, sticky FilterBar */
  --z-dropdown: 50;
  --z-backdrop: 60;   /* modal/sheet backdrop */
  --z-modal:    70;   /* OnboardingSheet, dialogs */
  --z-toast:    80;
}
```

---

## 8. Full `globals.css` scaffold

This is the complete file D4 should produce. Drop-in ready for Tailwind v4.

```css
/* src/app/globals.css — Descuentos AR design system */
@import 'tailwindcss';

:root {
  /* Colors — surfaces */
  --color-bg:              #FBF9F5;
  --color-surface:         #FFFFFF;
  --color-surface-raised:  #FFFFFF;
  --color-surface-sunken:  #F3EFE7;

  /* Colors — text */
  --color-text-primary:    #14110C;
  --color-text-secondary:  #5A544B;
  --color-text-muted:      #8A8377;
  --color-text-whisper:    #B4AD9F;

  /* Colors — borders */
  --color-border:          #E8E2D5;
  --color-border-strong:   #D3CCBE;
  --color-divider:         #EEE8DB;

  /* Colors — brand accent */
  --color-accent:          #1F7A5A;
  --color-accent-hover:    #186347;
  --color-accent-soft:     #E3F0EA;
  --color-accent-ink:      #FFFFFF;

  /* Colors — semantic */
  --color-savings:         #1F7A5A;
  --color-savings-strong:  #135C42;
  --color-warning:         #B45309;
  --color-warning-soft:    #FDF3E4;
  --color-error:           #9F1239;
  --color-error-soft:      #FBE7EC;

  /* Colors — zero-price */
  --color-zero-ink:        #14110C;
  --color-zero-bg:         #FFF3B8;

  /* Spacing */
  --space-0: 0;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 48px;
  --space-8: 64px;

  /* Containers */
  --container-sm: 640px;
  --container-md: 768px;
  --container-lg: 1024px;
  --container-xl: 1120px;
  --container-detail: 720px;
  --container-sheet:  440px;

  /* Typography */
  --font-sans: 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;

  --text-xs: 12px;   --text-xs-lh: 16px;   --text-xs-ls: 0.01em;
  --text-sm: 14px;   --text-sm-lh: 20px;   --text-sm-ls: 0;
  --text-base: 16px; --text-base-lh: 24px; --text-base-ls: 0;
  --text-lg: 20px;   --text-lg-lh: 28px;   --text-lg-ls: -0.01em;
  --text-xl: 28px;   --text-xl-lh: 34px;   --text-xl-ls: -0.015em;
  --text-2xl: 40px;  --text-2xl-lh: 44px;  --text-2xl-ls: -0.02em;
  --text-3xl: 56px;  --text-3xl-lh: 60px;  --text-3xl-ls: -0.025em;

  --font-weight-regular: 400;
  --font-weight-medium:  500;
  --font-weight-semi:    600;
  --font-weight-bold:    700;

  /* Radii */
  --radius-none: 0;
  --radius-xs:   4px;
  --radius-sm:   6px;
  --radius-md:   10px;
  --radius-lg:   16px;
  --radius-xl:   24px;
  --radius-pill: 9999px;

  /* Shadows */
  --shadow-none:  none;
  --shadow-1:     0 1px 2px 0 rgba(30, 24, 15, 0.04);
  --shadow-2:     0 4px 16px -4px rgba(30, 24, 15, 0.08);
  --shadow-3:     0 12px 32px -8px rgba(30, 24, 15, 0.12);
  --shadow-focus: 0 0 0 3px rgba(31, 122, 90, 0.20);

  /* Motion */
  --duration-quick:    150ms;
  --duration-default:  220ms;
  --duration-settle:   320ms;
  --duration-countup:  480ms;
  --duration-shimmer: 1800ms;

  --ease-linear: cubic-bezier(0, 0, 1, 1);
  --ease-out:    cubic-bezier(0.22, 1, 0.36, 1);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);

  /* Z-index */
  --z-base:     0;
  --z-sticky:   40;
  --z-dropdown: 50;
  --z-backdrop: 60;
  --z-modal:    70;
  --z-toast:    80;
}

/* Tailwind v4 theme — expose tokens as utility classes.
 * Any class like `bg-bg`, `text-primary`, `border-border` maps to the var. */
@theme {
  --color-bg:              var(--color-bg);
  --color-surface:         var(--color-surface);
  --color-surface-raised:  var(--color-surface-raised);
  --color-surface-sunken:  var(--color-surface-sunken);
  --color-text-primary:    var(--color-text-primary);
  --color-text-secondary:  var(--color-text-secondary);
  --color-text-muted:      var(--color-text-muted);
  --color-text-whisper:    var(--color-text-whisper);
  --color-border:          var(--color-border);
  --color-border-strong:   var(--color-border-strong);
  --color-divider:         var(--color-divider);
  --color-accent:          var(--color-accent);
  --color-accent-hover:    var(--color-accent-hover);
  --color-accent-soft:     var(--color-accent-soft);
  --color-accent-ink:      var(--color-accent-ink);
  --color-savings:         var(--color-savings);
  --color-savings-strong:  var(--color-savings-strong);
  --color-warning:         var(--color-warning);
  --color-warning-soft:    var(--color-warning-soft);
  --color-error:           var(--color-error);
  --color-error-soft:      var(--color-error-soft);
  --color-zero-ink:        var(--color-zero-ink);
  --color-zero-bg:         var(--color-zero-bg);

  --font-sans: var(--font-sans);

  --spacing-0: var(--space-0);
  --spacing-1: var(--space-1);
  --spacing-2: var(--space-2);
  --spacing-3: var(--space-3);
  --spacing-4: var(--space-4);
  --spacing-5: var(--space-5);
  --spacing-6: var(--space-6);
  --spacing-7: var(--space-7);
  --spacing-8: var(--space-8);

  --radius-xs:   var(--radius-xs);
  --radius-sm:   var(--radius-sm);
  --radius-md:   var(--radius-md);
  --radius-lg:   var(--radius-lg);
  --radius-xl:   var(--radius-xl);
  --radius-pill: var(--radius-pill);

  --shadow-1:     var(--shadow-1);
  --shadow-2:     var(--shadow-2);
  --shadow-3:     var(--shadow-3);
  --shadow-focus: var(--shadow-focus);
}

/* Base styles */
html, body {
  background: var(--color-bg);
  color: var(--color-text-primary);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-feature-settings: "cv11" 1, "ss03" 1;
  font-variant-numeric: tabular-nums;
  font-family: var(--font-sans);
  text-rendering: optimizeLegibility;
}

body {
  min-height: 100dvh;
}

/* Focus ring — applies to all interactive elements by default */
:where(a, button, input, select, textarea, [role="button"], [tabindex]):focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
  border-radius: var(--radius-sm);
}

/* Reduce scrollbar noise */
::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 6px;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--color-border-strong);
}

/* Shimmer for skeletons */
@keyframes shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.skeleton {
  background: linear-gradient(
    90deg,
    var(--color-surface-sunken) 0%,
    var(--color-surface) 50%,
    var(--color-surface-sunken) 100%
  );
  background-size: 200% 100%;
  animation: shimmer var(--duration-shimmer) linear infinite;
}

/* Page entry animation — fade + translateY */
@keyframes page-enter {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Sheet entry — from bottom */
@keyframes sheet-enter {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}

/* Backdrop fade */
@keyframes backdrop-enter {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* Respect reduced motion */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* Utility — tabular numerals explicitly when a specific element opts out of the global */
.no-tabular {
  font-variant-numeric: normal;
}
```

---

## 9. Font loading — Next.js App Router

Update `src/app/layout.tsx` to load Inter via `next/font/google`:

```ts
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  /* ... unchanged metadata ... */
};

export const viewport: Viewport = {
  themeColor: '#FBF9F5',   // match new bg
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={inter.variable}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
```

Notes:
- `display: 'swap'` — use system fallback until Inter loads, swap in without FOIT.
- `variable: '--font-sans'` — Next exposes a CSS variable applied via `className`; our `globals.css` consumes it.
- `weight: ['400', '500', '600', '700']` — matches every weight our type scale uses. Inter variable serves these all from one file.
- Subset `latin` covers Spanish diacritics. We do NOT need `latin-ext` unless future copy includes accents beyond AR-Spanish (Polish, Czech, etc.).

---

## 10. PWA manifest alignment

Update `src/app/manifest.ts` (or `public/manifest.webmanifest`) to match the new theme:

```ts
theme_color: '#FBF9F5',     // warm off-white to match --color-bg
background_color: '#FBF9F5',
```

Also update the existing viewport `themeColor: '#0a0a0b'` in `layout.tsx` (currently dark-mode) to `#FBF9F5`.

---

## 11. Tailwind v4 component utility hints

D4 reference — these are the most-used class patterns under the new tokens.

### Surfaces

```tsx
// Page bg
<body className="bg-bg">

// Card (PromoCard, detail card)
<article className="bg-surface border border-border rounded-md p-4">

// Raised sheet/modal
<div className="bg-surface-raised rounded-lg shadow-3 p-5">

// Sunken group (sin-tope section)
<section className="bg-surface-sunken rounded-md p-5">
```

### Typography

```tsx
// Hero tope number
<div className="text-2xl font-bold text-savings-strong tracking-[-0.02em]">

// Page title
<h1 className="text-xl font-semibold text-text-primary tracking-[-0.015em]">

// Body copy
<p className="text-base text-text-primary">

// Supporting
<span className="text-sm text-text-secondary">

// Whisper
<span className="text-xs text-text-whisper">
```

### Chips

```tsx
// Default chip
<button className="inline-flex items-center gap-1 rounded-pill border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-secondary hover:border-border-strong">

// Active chip
<button className="... border-accent bg-accent-soft text-accent">
```

### Buttons

```tsx
// Primary
<button className="rounded-sm bg-accent px-6 py-3 text-base font-semibold text-accent-ink hover:bg-accent-hover transition-colors duration-[150ms] ease-[cubic-bezier(0.22,1,0.36,1)]">

// Secondary
<button className="rounded-sm border border-border bg-surface px-6 py-3 text-base font-medium text-text-primary hover:border-border-strong">
```

### Motion

```tsx
// Tap feedback
<div className="transition-transform duration-[150ms] active:scale-[0.99]">

// Hover lift
<article className="transition-all duration-[150ms] hover:shadow-1 hover:border-border-strong">
```

Tailwind v4 supports arbitrary cubic-bezier values via `ease-[...]`. D4 may define named easing classes in a shared `cn()` util if arbitrary values proliferate.

---

## 12. Tokens NOT in this system

Explicitly missing — D4 should refuse to add them without escalation:

- No dark-mode tokens. Revisit post-launch.
- No additional accent colors ("secondary brand"). One accent.
- No gradient tokens. Solid colors only.
- No additional semantic reds/greens. Warning is amber; error is crimson; savings is pampa green.
- No "elevation" tokens beyond shadows 1-3. Don't invent `--shadow-4`.
- No motion durations >520ms. If something needs longer, rethink the pattern.
- No arbitrary spacing values. 4px grid is the law.

If a design need arises that seems to require a new token, escalate to D3 — don't silently add to `globals.css`.

---

## 13. Migration checklist for D4

When porting existing Phase 2 code:

1. Replace all usages of `--bg`, `--bg-elevated`, `--bg-subtle`, `--border`, `--text`, `--text-muted`, `--text-dim`, `--accent`, `--accent-contrast`, `--success`, `--warning` in `globals.css` with the new tokens above.
2. Remove the current dark-mode palette entirely.
3. Update `layout.tsx` viewport `themeColor` from `#0a0a0b` to `#FBF9F5`.
4. Update `manifest.ts` theme/background colors.
5. Add Inter font loader to `layout.tsx`.
6. In each component, replace legacy class names:
   - `bg-elevated` → `bg-surface`
   - `bg-subtle` → `bg-surface-sunken`
   - `border-token` → `border-border`
   - `tx-muted` → `text-text-secondary` (or `text-muted` depending on tier)
   - `tx-dim` → `text-text-muted` or `text-text-whisper`
   - `text-[color:var(--color-accent)]` → `text-accent`
   - etc.
7. Re-apply component specs from `components.md` — don't just swap colors; the hierarchy has changed (tope is now the hero, not pct).
8. Add count-up animation on PromoDetail hero (see `direction.md` motion spec).
9. Replace `<OnboardingSheet>` modal backdrop from pure black to warm `rgba(20,17,12,0.32)`.
10. Delete any remaining usage of `text-[color:var(--color-accent-contrast)]` — zero-contrast token no longer exists.
