import { ComponentProps, FC, useState } from 'react';

export const ImageWithState: FC<ComponentProps<'img'>> = ({ ...props }) => {
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading');
  return (
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
