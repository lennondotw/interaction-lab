import type { Decorator, Preview } from '@storybook/react-vite';
import { createContext, createElement, useContext, useLayoutEffect, useSyncExternalStore } from 'react';

/**
 * Preview theme switcher: a toolbar global (`light` / `dark` / `system`), the
 * resolved theme applied to the preview document, and a hook for anything in
 * the preview that needs to know it.
 *
 * What it writes, and why it is split in two
 * ------------------------------------------
 * Applying a theme is two separate jobs:
 *
 * 1. `color-scheme` - a platform contract, the same for every project. It
 *    decides the browser's `Canvas` colour, native controls and scrollbars,
 *    and which side `light-dark()` resolves to (the background addon relies
 *    on that). The addon always sets it, and it is not configurable.
 * 2. The project's own styling switch - a `data-theme` attribute, a `.dark`
 *    class, both - whatever that project's `dark` variant keys on. This is
 *    the `apply` option; by default it sets `data-theme`.
 *
 * Because the addon owns (1), `light-dark()` and the canvas follow the
 * toolbar on any page, whether or not its stylesheet also derives
 * `color-scheme` from (2).
 *
 * How `color-scheme` is set: an attribute, not an inline style
 * ------------------------------------------------------------
 * The addon sets `data-sb-color-scheme` on `<html>` and injects one unlayered
 * stylesheet mapping it to `color-scheme`. It does not write
 * `style.colorScheme`, because the root's inline style is shared with stories:
 * a story that forces a scheme (the Digital Crown scene sets `dark` inline and
 * clears it on unmount) would otherwise have its value overwritten on the next
 * theme change, and its cleanup would wipe the addon's.
 *
 * Precedence, deliberately: the rule is unlayered and `:root[attr]`, so it
 * beats a stylesheet's `:root` rules whether they sit in a cascade layer or
 * not; it is not `!important`, so a story's inline `color-scheme` still wins.
 * A story that forces a scheme is making a choice the toolbar should not undo.
 *
 * The attributes are applied in a layout effect, so the first frame after a
 * change is already themed, and never removed: the preview always has a theme.
 *
 * Usage
 * -----
 * ```ts
 * import { createThemeAddon } from '@monorepo/storybook-addons/theme';
 *
 * // Default: color-scheme + data-theme.
 * const theme = createThemeAddon();
 * // A project whose dark variant keys on a class:
 * // createThemeAddon({ apply: (root, t) => root.classList.toggle('dark', t === 'dark') });
 *
 * const preview: Preview = {
 *   decorators: [...theme.decorators],
 *   globalTypes: { ...theme.globalTypes },
 *   initialGlobals: { ...theme.initialGlobals },
 * };
 * ```
 *
 * Inside the preview, `useResolvedTheme()` returns `'light' | 'dark'`, for
 * things that take a theme as a prop rather than from CSS (a toast library,
 * a canvas renderer). A decorator using it must sit inside this addon's, that
 * is, earlier in the `decorators` array.
 */

export type ResolvedTheme = 'light' | 'dark';
type ThemeOption = ResolvedTheme | 'system';

export interface ThemeAddonOptions {
  /**
   * Applies the project's own styling switch for the resolved theme, on the
   * preview's root element. Runs on every theme change. `color-scheme` is
   * handled by the addon and must not be set here.
   *
   * @default sets `data-theme` to the resolved theme
   */
  apply?: (root: HTMLElement, theme: ResolvedTheme) => void;
}

const COLOR_SCHEME_ATTRIBUTE = 'data-sb-color-scheme';
const STYLESHEET_ID = 'sb-theme-color-scheme';

const STYLESHEET = `
  :root[${COLOR_SCHEME_ATTRIBUTE}='light'] {
    color-scheme: light;
  }
  :root[${COLOR_SCHEME_ATTRIBUTE}='dark'] {
    color-scheme: dark;
  }
`;

/** Injects the color-scheme stylesheet once per document; later calls find it and return. */
const ensureStylesheet = () => {
  if (document.getElementById(STYLESHEET_ID)) return;
  const style = document.createElement('style');
  style.id = STYLESHEET_ID;
  style.textContent = STYLESHEET;
  document.head.append(style);
};

const applyDataTheme = (root: HTMLElement, theme: ResolvedTheme) => {
  root.setAttribute('data-theme', theme);
};

const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)';

const subscribeToSystem = (onChange: () => void) => {
  const media = window.matchMedia(SYSTEM_DARK_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
};

const getSystemTheme = (): ResolvedTheme => (window.matchMedia(SYSTEM_DARK_QUERY).matches ? 'dark' : 'light');

const parseOption = (value: unknown): ThemeOption => (value === 'light' || value === 'dark' ? value : 'system');

const ResolvedThemeContext = createContext<ResolvedTheme | null>(null);

/** The theme the preview is currently showing. Must be used inside the theme addon's decorator. */
export const useResolvedTheme = (): ResolvedTheme => {
  const theme = useContext(ResolvedThemeContext);
  if (theme === null) throw new Error('useResolvedTheme must be used inside the theme addon decorator');
  return theme;
};

export const createThemeAddon = ({ apply = applyDataTheme }: ThemeAddonOptions = {}) => {
  const WithTheme: Decorator = (Story, context) => {
    const option = parseOption(context.globals['theme']);
    // Subscribed even when a theme is forced, so switching back to `system` is already current.
    const systemTheme = useSyncExternalStore(subscribeToSystem, getSystemTheme, () => 'light' as const);
    const resolved = option === 'system' ? systemTheme : option;

    useLayoutEffect(() => {
      ensureStylesheet();
      const root = document.documentElement;
      root.setAttribute(COLOR_SCHEME_ATTRIBUTE, resolved);
      apply(root, resolved);
    }, [resolved]);

    return createElement(ResolvedThemeContext.Provider, { value: resolved }, createElement(Story));
  };

  const decorators: Decorator[] = [WithTheme];

  const globalTypes = {
    theme: {
      description: 'Preview color theme',
      toolbar: {
        icon: 'mirror',
        items: [
          { value: 'light', title: 'Always Light' },
          { value: 'dark', title: 'Always Dark' },
          { value: 'system', title: 'Follow System' },
        ],
        dynamicTitle: true,
      },
    },
  } satisfies NonNullable<Preview['globalTypes']>;

  const initialGlobals = { theme: 'system' };

  return { decorators, globalTypes, initialGlobals };
};
