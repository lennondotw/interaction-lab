import { create, ThemeVarsPartial } from 'storybook/theming';

const themeConfig: Omit<ThemeVarsPartial, 'base'> = {
  brandTitle: 'Storybook',
  /*
   * Background of the manager's `<iframe>` element that hosts the preview.
   *
   * Storybook styles that element with `background-color: theme.background.preview`, which
   * comes from `appPreviewBg`, and both built-in themes default it to `color.lightest` (#FFF),
   * so it is white even under the dark manager theme. That white is meant for projects whose
   * stories paint no background of their own.
   *
   * Ours always do: the preview's `<html>` is opaque from the first frame (the `preview-boot`
   * rule in `preview-head.html`, then `global.css`), so the element's own background is never
   * the intended backdrop. It only leaks through the gaps the inner document does not cover:
   *
   * - macOS rubber-band overscroll, which pulls the whole inner document away from its edges
   *   and shows what is behind it;
   * - switching stories, before the new document has painted its first frame.
   *
   * Transparent lets those gaps show the manager's preview area instead, which follows the
   * manager theme (the system appearance) rather than flashing white. It also makes the
   * background addon's "Transparent" option actually see through to the manager, as long as the
   * preview's `color-scheme` matches the element's; on a mismatch the browser paints an opaque
   * `Canvas` backdrop inside the iframe regardless.
   *
   * Known and accepted: the manager theme follows the system only, so when the toolbar forces
   * a preview theme opposite to the system's, the overscroll gap shows the opposite color.
   *
   * Not `overscroll-behavior: none` on the preview instead: that would remove the bounce the
   * scroll studies in this lab exist to observe.
   *
   * Part of the lab's first-paint rule; see `src/docs/first-paint-background.mdx`.
   */
  appPreviewBg: 'transparent',
};

export const customThemeLight = create({
  base: 'light',
  ...themeConfig,
});

export const customThemeDark = create({
  base: 'dark',
  ...themeConfig,
});
