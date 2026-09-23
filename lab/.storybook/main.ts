import type { StorybookConfig } from '@storybook/react-vite';
import { themes } from 'storybook/theming';
import { UserConfig } from 'vite';

const viteFinal = (config: UserConfig): UserConfig => {
  return {
    ...config,
    build: {
      ...config.build,
      chunkSizeWarningLimit: 1500,
      sourcemap: process.env.ENABLE_SOURCE_MAP === 'true',
    },
  };
};

const addCloudflareAnalytics = (head: string | undefined, configType: string | undefined): string | undefined => {
  if (configType !== 'PRODUCTION') return head;

  // Use the standalone lab.lennon.sh analytics site, independent of Pages.
  // This is the public beacon identifier, not the deployment API credential.
  const beacon = `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"df2afb915d614581a4c172bcde696094"}'></script>`;
  return `${head ?? ''}\n${beacon}`;
};

/*
 * First-paint background for the manager page (`/`, `index.html`).
 *
 * The problem: the manager's `index.html` ships no page background and no `color-scheme`. Its
 * theme only reaches the page once the manager bundle has loaded and emotion has injected a
 * `body` background, so until then the canvas is the light `Canvas` color of `color-scheme:
 * normal` - a white flash on every load, even on a dark system.
 *
 * The fix, injected into the manager's `<head>` so it applies from the first frame:
 * - `color-scheme: light dark`, so the canvas and native UI follow the system appearance;
 * - a `light-dark()` background built from the manager themes' own `appBg`, so the first frame
 *   is already the color the loaded manager paints. `.storybook/manager.tsx` picks the light or
 *   dark theme from `prefers-color-scheme`, which is exactly what `light-dark()` resolves
 *   against here, so this is the real background, not an approximation.
 *
 * The colors are read from `storybook/theming`'s built-in themes rather than copied, so a
 * Storybook upgrade that changes them carries through. `.storybook/theme.tsx` builds the lab's
 * themes with `create({ base })` and does not override `appBg`; if it ever does, read the value
 * from there instead, or this frame and the loaded manager will disagree.
 *
 * The rule sits in a layer so any unlayered rule the manager adds for `:root` wins over it; it
 * only has to hold until the manager's own styles arrive. Keeping `color-scheme: light dark` on
 * afterwards is intended: the manager theme follows the system too.
 *
 * Part of the lab's first-paint rule; see `src/docs/first-paint-background.mdx`.
 */
const managerFirstPaintStyle = `<style>
  @layer manager-boot {
    :root {
      color-scheme: light dark;
      background-color: light-dark(${themes.light.appBg}, ${themes.dark.appBg});
    }
  }
</style>`;

const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/**/{,.}*.mdx', '../src/**/{,.}*.stories.{,c,m}{j,t}s{,x}'],
  addons: ['@storybook/addon-docs'],
  viteFinal,
  managerHead: (head, options) =>
    addCloudflareAnalytics(`${head ?? ''}\n${managerFirstPaintStyle}`, options.configType),
  previewHead: (head, options) => addCloudflareAnalytics(head, options.configType),
  docs: {
    //👇 See the table below for the list of supported options
    defaultName: 'Documentation',
  },
};

export default config;
