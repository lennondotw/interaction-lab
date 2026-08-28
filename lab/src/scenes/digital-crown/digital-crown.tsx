import { cn } from '@monorepo/utils';
import { FC, useEffect, useRef } from 'react';

import { CardStack } from './card-stack.js';
import { DebugPanel } from './debug-panel.js';
import { SoundToggleButton } from './sound-toggle-button.js';
import { TimelineRuler } from './timeline-ruler.js';
import { useDigitalCrown } from './use-digital-crown.js';

export const DigitalCrown: FC = () => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const {
    contentRef,
    placeholderRef,
    scrollProgress,
    triggeredValue,
    linkedValue,
    combinedValue,
    cardY,
    activeCard,
    flashingForward,
    flashingBackward,
    isMuted,
    unmute,
    mute,
  } = useDigitalCrown(scrollContainerRef);

  // Force dark theme and disable body scroll
  useEffect(() => {
    // Set color-scheme
    document.documentElement.style.colorScheme = 'dark';
    document.documentElement.style.backgroundColor = '#000';
    document.body.style.backgroundColor = '#000';

    // Disable body scroll
    document.documentElement.style.overflow = 'clip';
    document.body.style.overflow = 'clip';

    // Set meta theme-color
    let metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (!metaThemeColor) {
      metaThemeColor = document.createElement('meta');
      metaThemeColor.setAttribute('name', 'theme-color');
      document.head.appendChild(metaThemeColor);
    }
    metaThemeColor.setAttribute('content', '#000000');

    return () => {
      // Cleanup on unmount
      document.documentElement.style.colorScheme = '';
      document.documentElement.style.backgroundColor = '';
      document.body.style.backgroundColor = '';
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <>
      {/* Fixed layer containing the visual content */}
      <div className="fixed inset-0 overflow-hidden">
        <CardStack contentRef={contentRef} cardY={cardY} activeCard={activeCard} />
      </div>

      <div
        className={cn(`
          fixed inset-x-0 top-4 hidden
          lg:flex lg:flex-col lg:items-center
        `)}
      >
        <TimelineRuler
          scrollProgress={scrollProgress}
          flashingForward={flashingForward}
          flashingBackward={flashingBackward}
        />
      </div>

      <DebugPanel
        scrollProgress={scrollProgress}
        triggeredValue={triggeredValue}
        linkedValue={linkedValue}
        combinedValue={combinedValue}
        activeCard={activeCard}
      />

      <div ref={scrollContainerRef} className="relative h-svh w-svw overflow-x-clip overflow-y-auto">
        {/* Placeholder for native scroll height */}
        <div ref={placeholderRef} aria-hidden />

        {/* Sound toggle button */}
        <div className={cn('fixed top-4 left-4', !isMuted && 'hidden')}>
          <SoundToggleButton isMuted={isMuted} onToggle={isMuted ? unmute : mute} />
        </div>
      </div>
    </>
  );
};
