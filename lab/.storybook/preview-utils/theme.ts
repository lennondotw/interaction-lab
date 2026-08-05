export const THEME_STORAGE_KEY = 'sb-theme';

export const resolveTheme = (theme: 'light' | 'dark' | 'system', systemTheme: 'dark' | 'light') => {
  if (theme === 'system') return systemTheme;
  return theme;
};

export const getSavedTheme = (): 'light' | 'dark' | 'system' => {
  const theme = localStorage.getItem(THEME_STORAGE_KEY);
  if (theme === 'dark') return 'dark';
  if (theme === 'light') return 'light';
  return 'system';
};
