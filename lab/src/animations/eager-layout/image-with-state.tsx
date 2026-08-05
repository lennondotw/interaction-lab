import { ComponentProps, FC, useState } from 'react';

/**
 * `alt` is required rather than optional as `ComponentProps<'img'>` has it. Every
 * caller already passes one; making it part of the contract is what stops the
 * next one from forgetting, since jsx-a11y cannot see an alt that arrives
 * through a spread and so cannot catch it here.
 */
export const ImageWithState: FC<ComponentProps<'img'> & { alt: string }> = ({ ...props }) => {
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading');
  return (
    // eslint-disable-next-line jsx-a11y/alt-text -- arrives via the spread, and the type above requires it
    <img
      {...props}
      onLoad={(...args) => {
        setState('loaded');
        props.onLoad?.(...args);
      }}
      onError={(...args) => {
        setState('error');
        props.onError?.(...args);
      }}
      data-state={state}
    />
  );
};
