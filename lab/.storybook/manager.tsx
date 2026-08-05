import { addons } from 'storybook/manager-api';
import { customThemeDark, customThemeLight } from './theme.js';

const updateManagerTheme = (theme: 'light' | 'dark') => {
  addons.setConfig({
    theme: theme === 'light' ? customThemeLight : customThemeDark,
  });
};

const listenSystemThemeChange = () => {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaQuery.addEventListener('change', (e) => {
    updateManagerTheme(e.matches ? 'dark' : 'light');
  });
  updateManagerTheme(mediaQuery.matches ? 'dark' : 'light');
};

listenSystemThemeChange();
