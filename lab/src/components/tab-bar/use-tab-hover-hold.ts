import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { TabBarProps } from './tab-bar.types.js';
import { createTabHoverHold, type TabBarHoldState } from './tab-hover-hold.js';

export function useTabHoverHold(onHoldStateChange: TabBarProps['onHoldStateChange']) {
  const [heldWidths, setHeldWidths] = useState<ReadonlyMap<string, number> | null>(null);
  const [holdState, setHoldState] = useState<TabBarHoldState>('natural');
  const holdStateCallback = useRef(onHoldStateChange);
  useLayoutEffect(() => {
    holdStateCallback.current = onHoldStateChange;
  }, [onHoldStateChange]);
  const [hoverHold] = useState(() =>
    createTabHoverHold(
      (state) => {
        setHoldState(state);
        holdStateCallback.current?.(state);
      },
      () => setHeldWidths(null)
    )
  );
  useEffect(() => () => hoverHold.stop(), [hoverHold]);

  return { heldWidths, setHeldWidths, holdState, hoverHold };
}
