import { useMotionValue, type MotionValue } from 'motion/react';
import { useLayoutEffect, useState } from 'react';

import { createTabCloseCapacity } from './tab-close-capacity.js';

export function useTabCloseLayout(isPresent: boolean, width: MotionValue<number>) {
  const closeCapacity = useMotionValue(0);
  const [controller] = useState(() => createTabCloseCapacity(width, closeCapacity));
  useLayoutEffect(() => controller.connect(), [controller]);
  useLayoutEffect(() => controller.setPresent(isPresent), [controller, isPresent]);
  return { closeCapacity, setCloseTarget: controller.setTarget };
}
