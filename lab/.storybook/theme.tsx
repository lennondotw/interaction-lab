import { create, ThemeVarsPartial } from 'storybook/theming';

const themeConfig: Omit<ThemeVarsPartial, 'base'> = {
  brandTitle: 'Storybook',
};

export const customThemeLight = create({
  base: 'light',
  ...themeConfig,
});

export const customThemeDark = create({
  base: 'dark',
  ...themeConfig,
});
