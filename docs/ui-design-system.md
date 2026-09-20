# FoxLog UI design system

FoxLog's interface (launcher, side panel, log modal, toasts, settings popup) is styled from a single set of design tokens. This page explains how the pieces fit together and the rules to follow when changing the UI.

## Files

| File | Role |
|------|------|
| `src/theme.css` | Design tokens (light and dark), base rules (box-sizing, font, focus ring, reduced motion) |
| `src/styles.css` | Launcher button, side panel, shared spinner/icon primitives |
| `src/modal-styles.css` | Log modal shell and every tab (Summary, Analysis, Flow, Calls, Raw, Diff), toasts |
| `popup.html` | Settings popup. Links `theme.css` and uses the `fl-theme` class on `<body>` |

`theme.css` is listed first in `manifest.json`, so tokens are available to both content stylesheets.

## Scoping

Tokens are declared on FoxLog's own roots, never on `:root`, so nothing leaks into the Salesforce page:

```
#sf-foxlog-toggle, #sf-debug-panel, .sf-log-modal, .sf-toast, .fl-theme
```

**Adding a new root element** (something appended to `document.body`)? Add its selector to the lists in `theme.css` (tokens, tone aliases, dark block, base rules), otherwise its `var(--fl-*)` will resolve to nothing.

## Tokens

All tokens use the `--fl-` prefix.

- **Surfaces**: `page` (outermost), `card`, `inset` (recessed inside a card), `hover`, `pressed`, `track` (meter background), `scrim` (modal backdrop).
- **Lines and text**: `border-0/border/border-2`, `text/text-2/text-3/text-4`. `text-4` fails AA on purpose: it is for decoration and disabled states only, never for readable text.
- **Accent**: `accent` (fill, always paired with `on-accent`), `accent-hover`, `accent-fg` (accent-coloured text or icons on a surface), `accent-tint`, `accent-line`, `focus`.
- **Status hues** (`red`, `amber`, `green`, `blue`, `violet`, plus `orange` and `indigo`): `-50/-100/-200/-300` are tints for backgrounds and borders, `-400/-500/-600` are solid fills, `-fg` and `-fg-2` are text that sits on a tint.
- **Tone aliases**: `success`, `warning`, `danger`, `info`, each with `-fg`, `-tint` and `-line`. Prefer these over hue tokens when a component expresses a state.
- **Ink** (`ink-900..600`, `ink-fg`, `ink-fg-2`): surfaces that stay dark in both themes.
- **Shape and motion**: `r-sm/md/lg/xl/pill`, `ease`, `dur`. Elevation: `shadow-1/2/3`.
- **Type**: `font` and `mono` are system stacks only. The extension makes no external requests, so do not add web fonts.

### Dark theme

Dark values are declared once, in `@media (prefers-color-scheme: dark)`, by redefining the same token names. Components never branch on the theme. To make something themeable, use a token instead of a literal colour.

Tints become translucent hue overlays in dark mode (for example `--fl-red-50` is a 10% red), so they stack correctly on any surface.

## Rules for component CSS

1. **No `#hex` or `rgb()` literals** for UI colours. Pick a surface, text or tone token. (Shadows may use `rgba(0,0,0,x)`.)
2. **Text on a tinted background uses the matching `-fg` token**, for example `--fl-green-fg` on `--fl-green-50`. Solid fills use `-500/-600` with `--fl-on-accent`.
3. **Convey state with more than colour**: icons, labels, dashed vs solid outlines, `aria-pressed`.
4. **Specificity over `!important`.** Scope selectors to the root (`#sf-debug-panel .sf-x`) instead. Keep `!important` for properties the host page might override (position, z-index, display of the launcher).
5. **Numbers use tabular figures** (`font-variant-numeric: tabular-nums`) wherever they line up (durations, sizes, counters).
6. **Motion respects `prefers-reduced-motion`**: `theme.css` already shortens all animations inside FoxLog roots.

## Components

- **Chip** (`.sf-filter-toggle`): quiet tinted pill. Each category sets `--chip-fg/--chip-bg/--chip-line`; active is tinted, inactive is a dashed outline.
- **Log card** (`.sf-log-entry`): status rail (`sf-log-tone-success|danger`), operation as title, status chip, tabular meta.
- **KPI card** (`.sf-summary-overview .sf-summary-item`) and **meter** (`.sf-limit-fill.sf-limit-success|warning|danger`, thresholds at 75% and 90%; `--score` drives the health-score meter).
- **Switch** (`.sf-debug-toggle-*`, popup `.toggle-switch`): uses `--fl-switch-off`, which meets 3:1 against the surface.
- **Tabs**: panel tabs are a segmented control; modal tabs are underlined. Both use roving tabindex and arrow keys.

## Accessibility checklist

- Every icon-only button has an `aria-label` (not just `title`).
- Clickable non-button elements use `role="button"`, `tabindex="0"` and Enter/Space handling, and must not contain other interactive elements.
- Scrollable regions that hold no focusable content get `tabindex="0"`.
- The modal is a `role="dialog"` with `aria-modal`, traps Tab, closes on Esc and returns focus.
- Text contrast is at least 4.5:1 in both themes. Check any new token pair before using it.

## Previewing and verifying

See "Previewing the UI without a Salesforce org" in the README. When you change styles:

1. Open the scenes in both OS themes (`?open=panel`, `?open=panel&panelTab=import`, `?open=modal&tab=summary|analysis|graph|calls|raw|diff`).
2. Run an axe-core pass (WCAG 2.2 A/AA) on each scene in both themes. The redesign shipped with zero violations.
3. Tab through the panel and modal with the keyboard only.
