import '#src/global.css';
import type { Preview } from '@storybook/react-vite';
import { useEffect, useRef, useState } from 'react';
import { scan } from 'react-scan';
import { Toaster } from 'sonner';
import { CustomDocsContainer } from './preview-docs/docs-container.js';
import { initPreview } from './preview-utils/init-preview.js';
import { ThemeProvider, useTheme } from './preview-utils/theme-context.js';
import { resolveTheme, THEME_STORAGE_KEY } from './preview-utils/theme.js';

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    docs: {
      container: CustomDocsContainer,
    },
  },
  globalTypes: {
    theme: {
      description: 'Global color theme',
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
  },
  initialGlobals: {
    theme: 'system',
  },
  decorators: [
    // Sonner Toast decorator
    function Decorator(Story) {
      const theme = useTheme();
      return (
        <>
          <Toaster theme={theme} />
          <Story />
        </>
      );
    },
    // Theme decorator
    function Decorator(Story, context) {
      const media = useRef(window.matchMedia('(prefers-color-scheme: dark)'));
      const [systemTheme, setSystemTheme] = useState<'dark' | 'light'>(media.current.matches ? 'dark' : 'light');
      const selectedTheme = (context.globals as { theme: 'light' | 'dark' | 'system' | undefined }).theme ?? 'system';
      const resolvedTheme = resolveTheme(selectedTheme, systemTheme);

      useEffect(() => {
        localStorage.setItem(THEME_STORAGE_KEY, selectedTheme);
      }, [selectedTheme]);

      useEffect(() => {
        const mediaQuery = media.current;
        const handler = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? 'dark' : 'light');
        mediaQuery.addEventListener('change', handler);
        return () => mediaQuery.removeEventListener('change', handler);
      }, []);

      useEffect(() => {
        const resolvedTheme = resolveTheme(selectedTheme, systemTheme);
        document.documentElement.setAttribute('data-theme', resolvedTheme);
      }, [selectedTheme, systemTheme]);

      return (
        <ThemeProvider value={resolvedTheme}>
          <Story />
        </ThemeProvider>
      );
    },
  ],
};

export default preview;

const shouldEnableReactScan =
  new URLSearchParams(window.location.search).get('reactScan') !== 'false' &&
  window.localStorage.getItem('reactScan') !== 'false';

if (import.meta.env.DEV && shouldEnableReactScan) {
  scan({ enabled: true });
}

initPreview();
