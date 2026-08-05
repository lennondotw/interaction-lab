import { cn } from '@monorepo/utils';
import { FC, PropsWithChildren } from 'react';
import { AnimationControlsProvider } from './animation-controls-provider.js';
import { ContentControlsPanel } from './content-controls-panel.js';
import { MetricsPanel } from './metrics-panel.js';
import { ParamsPanel } from './params-panel.js';
import { RenderArea } from './render-area.js';
import { SpringBufferProvider } from './spring-buffer-provider.js';

export const AppProviders: FC<PropsWithChildren> = ({ children }) => {
  return (
    <AnimationControlsProvider>
      <SpringBufferProvider>{children}</SpringBufferProvider>
    </AnimationControlsProvider>
  );
};

export const SpringBufferRenderer: FC = () => {
  return (
    <AppProviders>
      <div
        className={cn(`
          mx-auto flex max-w-5xl flex-col items-stretch gap-4 px-2 py-3
          md:px-3 md:py-6
        `)}
      >
        <ParamsPanel />
        <ContentControlsPanel />
        <MetricsPanel />
        <RenderArea />
      </div>
    </AppProviders>
  );
};
