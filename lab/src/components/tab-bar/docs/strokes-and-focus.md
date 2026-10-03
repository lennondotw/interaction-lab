# Stroke and focus ownership

Each tab paints one outer outline and one internal separator. Nested idle outlines would overlap at
the title/close boundary and at outer edges, making a nominal 1 px stroke thicker or darker.

## One owner per idle edge

[The shared style tokens](../tab-bar.styles.ts) use 1 px outlines with -1 px outline offsets so the
stroke stays inside its box without consuming layout width. The title and close controls have
transparent idle outlines; the whole tab owns the visible outer stroke.

The title button's `::before` paints the divider: `right-0 w-px`, neutral-500 at 15% alpha, inset by
1 px at the top and bottom. It is one standalone pixel-wide separator, not two adjacent button borders.
The vertical inset prevents overlapping the tab's horizontal outer strokes and darkening their
intersection. It is noninteractive, and a zero-width title slot clips it away.

There is no second idle stroke around the close button. This preserves uniform alpha at the top,
bottom, right edge, and internal divider instead of blending several translucent strokes.

## Deliberate visual hierarchy

| Element/state                    | Outline treatment                |
| -------------------------------- | -------------------------------- |
| Fieldset frame                   | Neutral-500 at 20% alpha         |
| Idle tab and add button          | Neutral-500 at 15% alpha         |
| Active tab                       | Neutral-500 at 40% alpha, dashed |
| Title and close controls at rest | Transparent                      |
| Keyboard focus-visible control   | Neutral-500 at 70% alpha         |

The 15/20/40 hierarchy matches the repository's wireframe time-wheel treatment. Focus outlines are
intentional emphasis owned by the focused control; idle uniformity does not require suppressing them.
X and plus icons use 1.5 px SVG strokes at 14 px and 18 px sizes respectively.

## Accessible controls and typography

The outer fieldset is labeled “Tabs”. Selection, close, and add are separate native buttons. Selection
uses `aria-pressed`, a full-title accessible label, and the native title tooltip. Icons are aria-hidden.
The active close button advertises Shift+W, add advertises Shift+T, and the fieldset advertises supported
arrow chords. Exiting tabs are inert; the sizing row is aria-hidden and noninteractive.

The fieldset explicitly uses base text size, 24 px line height, normal weight, and normal tracking to
keep host typography from changing this demo's geometry. Controls retain native button focus/action
semantics. The component does not implement an ARIA tablist/tabpanel pairing, roving tabindex, or panel
content ownership; hosts requiring those semantics need an explicit integration design.

Implementation: [AnimatedTab](../animated-tab.tsx) and [TabBar](../tab-bar.tsx). Visual alpha, single-pixel
divider rendering, and focused states are browser checks rather than pixel assertions in the current
unit suite. See [verification](./verification.md).

[Architecture index](../README.md)
