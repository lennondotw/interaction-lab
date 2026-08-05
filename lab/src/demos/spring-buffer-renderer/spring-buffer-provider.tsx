/* eslint-disable react-refresh/only-export-components */

import { createContext, FC, PropsWithChildren, useContext } from 'react';
import { SpringBufferContextValue } from './spring-buffer-provider-interface.js';
import { useSpringBuffer } from './use-spring-buffer.js';

const SpringBufferContext = createContext<SpringBufferContextValue | null>(null);

export const useSpringBufferContext = (): SpringBufferContextValue => {
  const context = useContext(SpringBufferContext);
  if (!context) throw new Error('useSpringBuffer must be used within SpringBufferProvider');
  return context;
};

export const SpringBufferProvider: FC<PropsWithChildren<{ value?: SpringBufferContextValue }>> = ({
  children,
  value: initialValue,
}) => {
  const internalValue = useSpringBuffer();
  return <SpringBufferContext.Provider value={initialValue ?? internalValue}>{children}</SpringBufferContext.Provider>;
};
