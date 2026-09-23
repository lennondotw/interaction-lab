import type { Decorator, Preview } from '@storybook/react-vite';
import { createElement, useEffect } from 'react';

/**
 * Preview background switcher, ported from today-platform-web's Storybook
 * package with only the plain options kept: `unmodified`, `solid`,
 * `transparent` and `grid`.
 *
 * How it works
 * ------------
 * It renders nothing of its own and never writes a style. It injects one
 * stylesheet into the preview document (once), and an option is selected by
 * setting a single attribute on the root element:
 *
 *   <html data-sb-background="grid">
 *
 * `unmodified` removes the attribute, which undoes everything the addon did.
 * There is no per-property bookkeeping and nothing to restore.
 *
 * Why the root element (`<html>`): its background is the canvas background,
 * so it covers the whole preview however tall the content is. A `<body>`
 * background only reaches the canvas when the root's own background is
 * transparent, which the preview's stylesheet never leaves it.
 *
 * Why `!important`: the overrides have to beat both the page's own `:root`
 * background (Tailwind's `base` layer) and a story's inline background on
 * `<html>` (see "Stories with their own background" below). An `!important`
 * author rule beats any normal declaration, inline ones included.
 *
 * Why the stylesheet is unlayered: `!important` inverts layer order - an
 * important declaration inside a cascade layer beats an unlayered one. Kept
 * unlayered, these rules win over every normal declaration while staying the
 * weakest of the important ones, so they never out-rank something that asked
 * for `!important` on purpose.
 *
 * Light and dark come from `light-dark()`, which resolves against the root's
 * used `color-scheme`. The page is expected to set that from its theme -
 * `@monorepo/tailwindcss` sets it from `data-theme` - so a theme switch
 * restyles the override with no script running. On a page that leaves
 * `color-scheme: normal`, `light-dark()` always picks the light value.
 *
 * Stories with their own background
 * ---------------------------------
 * `unmodified` means exactly that: whatever the story and the page paint is
 * left alone. A story that needs a background of its own (a scene whose glass
 * needs something to refract) must follow three rules, or this addon cannot
 * override it:
 *
 * 1. Paint it on `<html>` - inline, set on mount and removed on unmount - not
 *    on a wrapper element. A wrapper sits above the root and hides whatever
 *    the addon puts there.
 * 2. No `!important`, or it out-ranks the override.
 * 3. Clean up on unmount, so the background does not leak into the next story.
 *
 * The full rule, with the rest of the lab's background conventions, is in
 * `lab/src/docs/first-paint-background.mdx`.
 *
 * Usage
 * -----
 * Spread the exports into `.storybook/preview`:
 *
 * ```ts
 * import * as background from '@monorepo/storybook-addons/background';
 *
 * const preview: Preview = {
 *   decorators: [...background.decorators],
 *   globalTypes: { ...background.globalTypes },
 *   initialGlobals: { ...background.initialGlobals },
 *   parameters: { ...background.parameters },
 * };
 * ```
 */

type BackgroundOption = 'unmodified' | 'solid' | 'transparent' | 'grid';

const ATTRIBUTE = 'data-sb-background';
const STYLESHEET_ID = 'sb-background-overrides';

/** A 20px checkerboard: four 45° gradients, each contributing one triangle per cell. */
const CHECKER_SQUARE = 'light-dark(#d0d0d0, #333)';

const STYLESHEET = `
  :root[${ATTRIBUTE}='solid'] {
    background: light-dark(#fff, #000) !important;
  }

  /*
   * Removes the page background, nothing more. What shows instead depends on the host, which is
   * why the toolbar labels it "varies by host, use with caution":
   * - inside the manager, with matching color-schemes: the manager's own background, through
   *   the (transparent) <iframe> element;
   * - inside the manager with mismatched color-schemes, or opened standalone: the browser's
   *   Canvas color for the root's used color-scheme (#fff, or about #121212 in Chrome's dark),
   *   because the canvas must be opaque there.
   * It is never actually see-through to anything under test. To inspect a component's own
   * transparency, use Grid.
   */
  :root[${ATTRIBUTE}='transparent'] {
    background: transparent !important;
  }

  :root[${ATTRIBUTE}='grid'] {
    background-color: light-dark(#e5e5e5, #2a2a2a) !important;
    background-image:
      linear-gradient(45deg, ${CHECKER_SQUARE} 25%, transparent 25%),
      linear-gradient(-45deg, ${CHECKER_SQUARE} 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, ${CHECKER_SQUARE} 75%),
      linear-gradient(-45deg, transparent 75%, ${CHECKER_SQUARE} 75%) !important;
    background-size: 20px 20px !important;
    background-position: 0 0, 0 10px, 10px -10px, -10px 0 !important;
    background-repeat: repeat !important;
    background-attachment: scroll !important;
  }
`;

/** Injects the override stylesheet once per document; later calls find it and return. */
const ensureStylesheet = () => {
  if (document.getElementById(STYLESHEET_ID)) return;
  const style = document.createElement('style');
  style.id = STYLESHEET_ID;
  style.textContent = STYLESHEET;
  document.head.append(style);
};

const parseOption = (value: unknown): BackgroundOption =>
  value === 'solid' || value === 'transparent' || value === 'grid' ? value : 'unmodified';

const WithBackground: Decorator = (Story, context) => {
  const option = parseOption(context.globals['background']);

  useEffect(() => {
    if (option === 'unmodified') return;
    ensureStylesheet();
    const root = document.documentElement;
    root.setAttribute(ATTRIBUTE, option);
    return () => root.removeAttribute(ATTRIBUTE);
  }, [option]);

  return createElement(Story);
};

export const decorators: Decorator[] = [WithBackground];

export const globalTypes = {
  background: {
    // Shown as the toolbar button's tooltip. Names the two things a developer needs: what is
    // replaced (the canvas background) and where (the root element), which is also where a story
    // must paint a background of its own for these options to override it.
    description: 'Canvas background (overrides <html>)',
    toolbar: {
      title: 'Background',
      icon: 'photo',
      items: [
        // `right` is the grey hint shown next to each item in the dropdown; the toolbar button
        // itself keeps the short title. Transparent's hint is a warning rather than a description,
        // see its stylesheet comment above for what varies and why.
        { value: 'unmodified', title: 'Unmodified', right: 'no override', icon: 'paintbrush' },
        { value: 'solid', title: 'Solid', right: '#fff / #000', icon: 'circle' },
        { value: 'transparent', title: 'Transparent', right: 'varies by host, use with caution', icon: 'eye' },
        { value: 'grid', title: 'Grid', right: 'checkerboard · shows alpha', icon: 'grid' },
      ],
      dynamicTitle: true,
    },
  },
} satisfies NonNullable<Preview['globalTypes']>;

export const initialGlobals = {
  background: 'unmodified',
};

/** Hide Storybook's built-in backgrounds tool so there is one background control, not two. */
export const parameters = {
  backgrounds: { disable: true },
};
