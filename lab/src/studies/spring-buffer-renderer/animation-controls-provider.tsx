/* eslint-disable react-refresh/only-export-components */

import { createContext, FC, PropsWithChildren, useContext, useState } from 'react';

interface AnimationControlsContextValue {
  showBuffer: boolean;
  setShowBuffer: (showBuffer: boolean) => void;

  showTrailing: boolean;
  setShowTrailing: (showTrailing: boolean) => void;
}

const AnimationControlsContext = createContext<AnimationControlsContextValue | null>(null);

export const useAnimationControlsContext = (): AnimationControlsContextValue => {
  const context = useContext(AnimationControlsContext);
  if (!context) throw new Error('useAnimationControls must be used within AnimationControlsProvider');
  return context;
};

const useAnimationControlsValue = (): AnimationControlsContextValue => {
  const [showBuffer, setShowBuffer] = useState(false);
  const [showTrailing, setShowTrailing] = useState(false);
  return { showBuffer, setShowBuffer, showTrailing, setShowTrailing };
};

export const AnimationControlsProvider: FC<PropsWithChildren<{ value?: AnimationControlsContextValue }>> = ({
  children,
  value: initialValue,
}) => {
  const internalValue = useAnimationControlsValue();
  return (
    <AnimationControlsContext.Provider value={initialValue ?? internalValue}>
      {children}
    </AnimationControlsContext.Provider>
  );
};
