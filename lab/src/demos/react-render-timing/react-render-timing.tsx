import { buttonVariants } from '#src/components/button/index.js';
import { cn } from '@monorepo/utils';
import { nanoid } from 'nanoid';
import { FC, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';

interface LoggerLike {
  log: (message: string) => void;
}

const useRerender = () => {
  const [state, setState] = useState<Record<string, never>>({});
  const rerender = useCallback(() => setState({}), []);
  return { rerender, state };
};

export const ReactRenderTiming: FC<{ logger: LoggerLike }> = ({ logger }) => {
  logger.log('Parent render()');

  const { state, rerender } = useRerender();

  useLayoutEffect(() => {
    logger.log('Parent useLayoutEffect() (no deps)');
    return () => {
      logger.log('Parent useLayoutEffect() (no deps) cleanup');
    };
  }, [logger]);

  useLayoutEffect(() => {
    logger.log('Parent useLayoutEffect() (with own deps)');
    return () => {
      logger.log('Parent useLayoutEffect() (with own deps) cleanup');
    };
  }, [logger, state]);

  useEffect(() => {
    logger.log('Parent useEffect() (no deps)');
    return () => {
      logger.log('Parent useEffect() (no deps) cleanup');
    };
  }, [logger]);

  useEffect(() => {
    logger.log('Parent useEffect() (with own deps)');
    return () => {
      logger.log('Parent useEffect() (with own deps) cleanup');
    };
  }, [logger, state]);

  const stubRef = useRef<null>(null);

  useImperativeHandle(stubRef, () => {
    logger.log('Parent useImperativeHandle()');
    return null;
  });

  const refCallback = useCallback(
    (el: HTMLDivElement | null) => {
      if (el) {
        logger.log('Parent ref callback (non-null)');
      } else {
        logger.log('Parent ref callback (null)');
      }
    },
    [logger]
  );

  const randomElementRefCallback = useCallback(
    (el: HTMLDivElement | null) => {
      if (el) {
        logger.log('Parent random element ref callback (non-null)');
      } else {
        logger.log('Parent random element ref callback (null)');
      }
    },
    [logger]
  );

  const handleRerender = useCallback(() => {
    logger.log('========');
    logger.log('Clicked parent rerender button');
    rerender();
  }, [logger, rerender]);

  return (
    <div className="flex flex-col items-center gap-2 border border-red-500/60 p-2">
      <div ref={refCallback}>Parent component</div>
      <button className={cn(buttonVariants())} onClick={handleRerender}>
        Rerender parent
      </button>
      <Child logger={logger} parentState={state} />
      <div className="hidden" key={nanoid()} ref={randomElementRefCallback}></div>
    </div>
  );
};

export const Child: FC<{ logger: LoggerLike; parentState: Record<string, never> }> = ({ logger, parentState }) => {
  logger.log('Child render()');

  const { state, rerender } = useRerender();

  const { state: stateForLayoutEffect, rerender: rerenderForLayoutEffect } = useRerender();

  useLayoutEffect(() => {
    logger.log('Child useLayoutEffect() (no deps)');
    return () => {
      logger.log('Child useLayoutEffect() (no deps) cleanup');
    };
  }, [logger]);

  useLayoutEffect(() => {
    logger.log('Child useLayoutEffect() (with own deps)');
    return () => {
      logger.log('Child useLayoutEffect() (with own deps) cleanup');
    };
  }, [logger, state]);

  useLayoutEffect(() => {
    logger.log('Child useLayoutEffect() (with parent deps)');
    return () => {
      logger.log('Child useLayoutEffect() (with parent deps) cleanup');
    };
  }, [logger, parentState]);

  useLayoutEffect(() => {
    logger.log('Child useLayoutEffect() (with rerender)');
    rerender();
    return () => {
      logger.log('Child useLayoutEffect() (with rerender) cleanup');
    };
  }, [logger, rerender, stateForLayoutEffect]);

  useEffect(() => {
    logger.log('Child useEffect() (no deps)');
    return () => {
      logger.log('Child useEffect() (no deps) cleanup');
    };
  }, [logger]);

  useEffect(() => {
    logger.log('Child useEffect() (with own deps)');
    return () => {
      logger.log('Child useEffect() (with own deps) cleanup');
    };
  }, [logger, state]);

  useEffect(() => {
    logger.log('Child useEffect() (with parent deps)');
    return () => {
      logger.log('Child useEffect() (with parent deps) cleanup');
    };
  }, [logger, parentState]);

  const stubRef = useRef<null>(null);

  useImperativeHandle(stubRef, () => {
    logger.log('Child useImperativeHandle()');
    return null;
  });

  const refCallback = useCallback(
    (el: HTMLDivElement | null) => {
      if (el) {
        logger.log('Child ref callback (non-null)');
      } else {
        logger.log('Child ref callback (null)');
      }
    },
    [logger]
  );

  const randomElementRefCallback = useCallback(
    (el: HTMLDivElement | null) => {
      if (el) {
        logger.log('Child random element ref callback (non-null)');
      } else {
        logger.log('Child random element ref callback (null)');
      }
    },
    [logger]
  );

  const handleRerender = useCallback(() => {
    logger.log('========');
    logger.log('Clicked child rerender button');
    rerender();
  }, [logger, rerender]);

  const handleRerenderWithLayoutEffect = useCallback(() => {
    logger.log('========');
    logger.log('Clicked child rerender button (with rerender in layout effect)');
    rerenderForLayoutEffect();
  }, [logger, rerenderForLayoutEffect]);

  return (
    <div className="mt-1 flex flex-col items-center gap-2 border border-blue-500/60 p-2" ref={refCallback}>
      <div>Child component</div>
      <button className={cn(buttonVariants())} onClick={handleRerender}>
        Rerender child
      </button>
      <button className={cn(buttonVariants())} onClick={handleRerenderWithLayoutEffect}>
        Rerender child (with rerender in layout effect)
      </button>
      <div className="hidden" key={nanoid()} ref={randomElementRefCallback}></div>
    </div>
  );
};
