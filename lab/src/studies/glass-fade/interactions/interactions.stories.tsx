import { glassFadeMeta, type GlassFadeStory } from '../glass-fade-story-meta.js';

const meta = { ...glassFadeMeta, title: 'Studies/Glass fade/Interactions' };

export default meta;
type Story = GlassFadeStory;

/*
 * The stories below are the first ones here with a time axis, and the only place the defect
 * can be judged the way a user meets it — in flight.
 *
 * There are three layers between a gesture and a pixel, and they apply in this order:
 *
 *   1. gesture      the target α, 0 or 1
 *   2. easing       how α travels there over time
 *   3. mapping      what a given α means in radius, tint alpha and content opacity
 *
 * Each story's name says which of 2 and 3 are switched on. Order matters and is not
 * commutative: easing reshapes time, the mapping reshapes the material, and swapping them
 * gives a different curve. It is also why these drive α per frame rather than handing the job
 * to a CSS `transition` — a transition interpolates each property's *endpoint values* and
 * never evaluates the α in between, and since 0 and 1 map to 0 and 1 under any mapping, a
 * transition-driven toggle silently ignores layer 3 entirely.
 *
 * `mode` stays live on all of them. Switching it to `opacity on the layer` and running the
 * gesture again is the shortest route to the whole point of the demo: the same motion, over
 * the same copy, reading as dirty instead of as frosted.
 */

/**
 * **Layers: gesture → decelerating α → perceptual mapping.** All three.
 *
 * α from the story's `progress` to 1 on pointer-enter — a surface *strengthening* under the
 * pointer rather than appearing, which is the common case for a hover state on glass. Starting
 * at 0.5 rather than 0 also means the wrong modes are already showing their ghost at rest, and
 * the gesture only deepens it.
 *
 * Both layers on, because a hover has no patience: it has to answer on the first frame, which
 * is what the deceleration curve buys, and it starts from half strength, so the mapping's slow
 * low end is not even in the range being travelled. Drop `mapping` to `linear` and the second
 * half of the gesture goes flat — by then the radius is far past where more of it shows.
 */
export const HoverToStrengthen: Story = {
  name: 'interactive · hover 0.5 → 1, remapped parameters + ease',
  args: { blurGamma: 2.6, interaction: 'hover', mapping: 'remapped', mode: 'material', progress: 0.5, timing: 'ease' },
};

/**
 * Same 0 → 1 hover, 500ms duration and easing as the remapped twin; only remapping is
 * disabled. Blur, tint, border and content use the eased progress directly, so their
 * gamma controls are hidden. This isolates parameter remapping from gesture timing.
 */
export const HoverFromNothingUnmapped: Story = {
  name: 'interactive · hover 0 → 1, no remap + ease',
  args: { interaction: 'hover', mapping: 'linear', mode: 'material', progress: 0, timing: 'ease' },
};

/**
 * **Layers: gesture → decelerating α → perceptual mapping.** The same hover from nothing.
 *
 * Worth having both, because the range travelled is what decides whether the mapping matters at
 * all. Strengthening from 0.5 never enters the low end, so γ barely shows; appearing from 0
 * crosses all of it, and this is the story where `blurGamma` earns its slider — sweep it to 4
 * and the surface hesitates under the pointer, drop it to 1 and everything arrives in the first
 * two frames with the rest of the gesture going nowhere.
 *
 * One cost this story makes visible: a hover target sits at α = 0 almost all of its life, and
 * during a gesture the SVG filter stays attached even at radius zero, with an identity kernel.
 * Only its weights change between frames, and the filter remains attached at rest too.
 * This keeps the topology stable through zero but reserves a compositing layer even when
 * the material is invisible — a cost to consider when rendering many panels.
 */
export const HoverFromNothing: Story = {
  name: 'interactive · hover 0 → 1, remapped parameters + ease',
  args: { blurGamma: 2.6, interaction: 'hover', mapping: 'remapped', mode: 'material', progress: 0, timing: 'ease' },
};

/**
 * **Layers: gesture → linear α → no mapping.** The baseline.
 *
 * The appearance proper: 0 → 1 on a button, which is the transition every sheet, popover and
 * toolbar runs. Constant-rate α with no mapping, so what you feel is the material's own
 * response curve and nothing else — and it front-loads badly, because one eighth of the way in
 * the blur has already delivered 85% of the change it will ever make.
 *
 * This is also the one to watch with `mode` on `opacity on an ancestor` — the blur is not
 * merely wrong mid-flight there, it is absent, and then snaps in at the end.
 */
export const ToggleVisibility: Story = {
  name: 'interactive · toggle',
  args: { interaction: 'toggle', mode: 'material' },
};

/**
 * **Layers: gesture → linear α → perceptual mapping.**
 *
 * The remapping layer alone, with time still constant-rate so the two cannot be confused.
 * Defaults remap blur at gamma 2.6 and leave tint/border/content at gamma 1. Each exponent is
 * independently adjustable, even though the gesture binds all input progress values.
 *
 * `blurGamma` is a control because the right value is a judgement the numbers cannot settle.
 * The metric's own optimum is 4, and it is not shippable — 0.3⁴ of 20px is 0.16px, so the first
 * third reads as a dead zone. The archived gamma 2 preset measured about 1.4× more even
 * than linear, with nothing dead; the current default is 2.6. Nothing in between is *correct*; perceived frostiness goes as roughly the log of
 * the radius, so evening it out always means crawling through the low end.
 *
 * The original CSS sweep showed compositor treads near radii 9px and 18px; the archive
 * preserves that evidence. This story now uses SVG convolution, so that measurement is not
 * a claim about its current output. The CSS blur issues story retains the downsampling jumps.
 */
export const ToggleVisibilityPerceptual: Story = {
  name: 'interactive · toggle, remapped parameters',
  args: { blurGamma: 2.6, interaction: 'toggle', mapping: 'remapped', mode: 'material' },
};

/**
 * **Layers: gesture → decelerating α → perceptual mapping.** All three, in order.
 *
 * The shared progress uses `cubic-bezier(0, 0.4, 0.01, 1)` over 500ms, then each
 * parameter applies its own remap curve. The ease spends progress early, while the default
 * blur remap holds back radius at the low end. The same timing applies when reversing;
 * an interrupted gesture starts from the current progress rather than from an endpoint.
 *
 * Compare with `remapped parameters` to feel the easing alone, and flip `mapping` to `linear` to see the
 * pairing that ships by default: a decelerating curve over an unmapped material, which puts
 * nearly all of the perceived change in the first few frames.
 */
export const ToggleVisibilityEased: Story = {
  name: 'interactive · toggle, remapped parameters + ease',
  args: { blurGamma: 2.6, interaction: 'toggle', mapping: 'remapped', mode: 'material', timing: 'ease' },
};
