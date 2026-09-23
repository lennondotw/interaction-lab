import '#src/global.css';
import * as background from '@monorepo/storybook-addons/background';
import { createThemeAddon, useResolvedTheme } from '@monorepo/storybook-addons/theme';
import type { Preview } from '@storybook/react-vite';
import { Toaster } from 'sonner';

import { CustomDocsContainer } from './preview-docs/docs-container.js';
import { initPreview } from './preview-utils/init-preview.js';

// Default apply: `data-theme` on <html>, which is what `@monorepo/tailwindcss`'s `dark` variant
// keys on. The addon sets `color-scheme` itself.
const theme = createThemeAddon();

const preview: Preview = {
  parameters: {
    ...background.parameters,
    layout: 'fullscreen',
    docs: {
      container: CustomDocsContainer,
    },
    options: {
      /**
       * The sidebar's top level is the taxonomy, so it is ordered by what the sections *are*
       * rather than alphabetically: the reusable things first, then the two kinds of exhibit
       * built out of them, then the tools you look at those with, then the prose, and last the
       * file you copy to start a new story.
       *
       * Anything not named here sorts after, alphabetically — a new section shows up at the
       * bottom rather than silently taking a position it did not ask for.
       */
      storySort: { order: ['Components', 'Scenes', 'Studies', 'Instruments', 'Documentation', 'Templates'] },
    },
  },
  globalTypes: {
    ...background.globalTypes,
    ...theme.globalTypes,
  },
  initialGlobals: {
    ...background.initialGlobals,
    ...theme.initialGlobals,
  },
  decorators: [
    // Sonner toasts take the theme as a prop, so this reads it from the theme addon - and
    // therefore has to sit inside it, i.e. before it in this array.
    function Decorator(Story) {
      const resolvedTheme = useResolvedTheme();
      return (
        <>
          <Toaster theme={resolvedTheme} />
          <Story />
        </>
      );
    },
    ...theme.decorators,
    ...background.decorators,
  ],
};

export default preview;

const shouldEnableReactScan =
  new URLSearchParams(window.location.search).get('reactScan') !== 'false' &&
  window.localStorage.getItem('reactScan') !== 'false';

if (import.meta.env.DEV && shouldEnableReactScan) {
  // Imported lazily so react-scan — and its react-grab / bippy transitive deps, which reach for
  // __REACT_DEVTOOLS_GLOBAL_HOOK__ at module scope — stay out of the built preview bundle.
  // See preview-head.html for the crash that reaching for that hook used to cause.
  void import('react-scan').then(({ scan }) => {
    scan({ enabled: true });
  });
}

initPreview();
