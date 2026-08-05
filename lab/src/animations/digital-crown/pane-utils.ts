import { useEffect } from 'react';
import { BindingParams, Pane } from 'tweakpane';
import { pane } from './pane.js';

export const usePaneBinding = <O extends Record<string, unknown>>(
  pane: Pane,
  obj: O,
  key: keyof O,
  params?: BindingParams
) => {
  useEffect(() => {
    const b = pane.addBinding(obj, key, params);
    return () => {
      b.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};

export const useAppPaneBinding = <O extends Record<string, unknown>>(obj: O, key: keyof O, params?: BindingParams) => {
  return usePaneBinding(pane, obj, key, params);
};
