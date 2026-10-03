import type { Meta, StoryObj } from '@storybook/react-vite';
import { useArgs } from 'storybook/preview-api';

import { BACKDROP_KINDS, FADE_MODES } from './glass-fade-modes.js';
import { GlassFadeStage } from './glass-fade.js';

/**
 * `backdrop-filter` **replaces** what is behind an element with a processed copy
 * of it; `opacity` **blends** the element back over the unprocessed original. Run
 * both and the backdrop is composited twice:
 *
 * ```text
 * result = α · (blurred backdrop + content) + (1 − α) · sharp backdrop
 * ```
 *
 * So a half-transparent glass layer is not half-frosted, it is a double exposure.
 * Each story drives the same 0 → 1 through a different property; scrub it — in the page
 * or in Controls, they are the same value — and try to read the copy through the panel.
 * You should not be able to, at any value.
 *
 * `blurPx` and `tintAlphaTarget` are where each ramp *ends*; the sliders are where along
 * it the material currently is. The independent-progress scrubs split blur, tint, border and content
 * into four inputs. Bound scrubs omit those overrides so all four follow `progress`.
 *
 * Keep `backdrop` on `text` while judging: a legible word inside the panel is proof
 * the frost is not working, and it needs no calibration to see. `flat` is there to
 * show the opposite — over a solid colour every mode looks correct, which is the
 * reason this ships broken so often.
 */
export const glassFadeMeta = {
  component: GlassFadeStage,
  parameters: { layout: 'fullscreen' },
  argTypes: {
    backdrop: { control: 'inline-radio', options: BACKDROP_KINDS },
    blurPx: { control: { max: 48, min: 0, step: 1, type: 'range' } },
    blurImplementation: { control: false },
    captionNote: { control: false },
    // Off by default, and re-enabled by the split scrubs that read them. A knob that does
    // nothing is worse than no knob, and in every other mode the material is simply done.
    blurRadiusProgress: { control: false },
    borderAlphaProgress: { control: false },
    borderColor: { control: 'color' },
    borderAlphaTarget: { control: { max: 0.6, min: 0, step: 0.01, type: 'range' } },
    contentProgress: { control: false },
    // One curve per parameter, visible whenever remapping is enabled, including bound progress.
    blurGamma: {
      control: { max: 4, min: 0.1, step: 0.1, type: 'range' },
      if: { arg: 'mapping', eq: 'remapped' },
    },
    borderGamma: {
      control: { max: 4, min: 0.1, step: 0.1, type: 'range' },
      if: { arg: 'mapping', eq: 'remapped' },
    },
    tintGamma: {
      control: { max: 4, min: 0.1, step: 0.1, type: 'range' },
      if: { arg: 'mapping', eq: 'remapped' },
    },
    contentGamma: {
      control: { max: 4, min: 0.1, step: 0.1, type: 'range' },
      if: { arg: 'mapping', eq: 'remapped' },
    },
    // Structural: which gesture owns the α is what a story *is*, not something to flip.
    interaction: { control: false },
    mapping: { control: 'inline-radio', options: ['linear', 'remapped'] },
    mode: { control: 'select', options: FADE_MODES },
    timing: { control: 'inline-radio', options: ['linear', 'ease'] },
    progress: { control: { max: 1, min: 0, step: 0.01, type: 'range' } },
    // Colour and alpha as two controls: a dark glass is reachable without touching the
    // component, and the alpha stays a slider, which is how you find the value where
    // the tint stops carrying the ramp.
    tint: { control: 'color' },
    tintAlphaProgress: { control: false },
    tintAlphaTarget: { control: { max: 0.6, min: 0, step: 0.01, type: 'range' } },
  },
  /*
   * `mapping` and `timing` are spelled out rather than left to the component's defaults, so the
   * radios show what is actually applied instead of showing nothing selected. Unmapped and
   * constant-rate is the default everywhere: the material's own response curve first, the
   * corrections in the stories that say so in their names.
   */
  args: {
    backdrop: 'text',
    blurPx: 16,
    borderColor: '#ffffff',
    borderAlphaTarget: 0.08,
    borderGamma: 1,
    // Working examples use fixed-support SVG kernels. Defect stories opt into CSS explicitly.
    blurImplementation: 'svg-convolution',
    mapping: 'linear',
    blurGamma: 2.6,
    tintGamma: 1,
    contentGamma: 1,
    progress: 0.5,
    timing: 'linear',
    tint: '#000000',
    tintAlphaTarget: 0.1,
  },
  /*
   * `useArgs` is a Storybook hook, not a React one: its context is only live while the
   * story function runs, so it has to be called in `render` itself. Moving it into a
   * component throws "Rendered more hooks than during the previous render".
   */
  render: (args) => {
    const [, updateArgs] = useArgs();

    return (
      <div className="flex min-h-screen w-full items-center justify-center px-2">
        <GlassFadeStage {...args} onOptionsChange={updateArgs} />
      </div>
    );
  },
} satisfies Meta<typeof GlassFadeStage>;

export type GlassFadeStory = StoryObj<typeof glassFadeMeta>;
