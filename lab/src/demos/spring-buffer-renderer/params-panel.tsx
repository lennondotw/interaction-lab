import { FC } from 'react';
import { SPRING_PARAMS } from './constants.js';
import { useSpringBufferContext } from './spring-buffer-provider.js';
import { SpringParameterControl } from './spring-parameter-control.js';

export const ParamsPanel: FC = () => {
  const { visualDuration, setVisualDuration } = useSpringBufferContext();

  return (
    <SpringParameterControl
      visualDuration={visualDuration}
      onVisualDurationChange={(values) => setVisualDuration(values[0] ?? 0)}
      onReset={() => {
        setVisualDuration(SPRING_PARAMS.VISUAL_DURATION.DEFAULT);
      }}
    />
  );
};
