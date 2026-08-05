import { faker } from '@faker-js/faker';
import { FC, useCallback, useId, useLayoutEffect, useRef, useState } from 'react';

export const Overflow: FC<{ demoId?: string }> = ({ demoId }) => {
  const [content, setContent] = useState<string>('Hello World');
  const internalDemoId = useId();

  return (
    <div
      className="overflow-x-auto overflow-y-clip py-[2em] ring-1 ring-red-500"
      data-overflow-demo-id={demoId ?? internalDemoId}
    >
      <div className="bg-amber-500/20 p-[1em] outline-1 -outline-offset-1 outline-amber-500">
        <div
          // Kept a div rather than promoted to a button: this demo is about the
          // box model of an overflowing child, and a button's own display and
          // intrinsic sizing would be the thing under test.
          // eslint-disable-next-line jsx-a11y/prefer-tag-over-role
          role="button"
          tabIndex={0}
          onClick={() => setContent(faker.lorem.sentence({ min: 1, max: 3 }))}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setContent(faker.lorem.sentence({ min: 1, max: 3 }));
            }
          }}
          className="mr-[-3em] bg-amber-500/20 px-[4em] py-[1em] outline-1 -outline-offset-1 outline-amber-500"
        >
          {content}
        </div>
      </div>
    </div>
  );
};

export const OverflowWithMutationObserver: FC = () => {
  const overflowRef = useRef<HTMLDivElement>(null);
  const demoId = useId();

  useLayoutEffect(() => {
    overflowRef.current = document.querySelector(`[data-overflow-demo-id="${demoId}"]`);
  }, [demoId]);

  const handleChildrenMutation = useCallback(() => {
    const overflowElement = overflowRef.current;
    if (!overflowElement) return;
    overflowElement.style.paddingRight = '0px'; // reset padding
    const paddingRight = overflowElement.scrollWidth - overflowElement.clientWidth; // trigger reflow
    overflowElement.style.paddingRight = `${paddingRight}px`; // set new padding
  }, []);

  useLayoutEffect(() => {
    handleChildrenMutation();
  }, [handleChildrenMutation]);

  useLayoutEffect(() => {
    const overflowElement = overflowRef.current;
    if (!overflowElement) return;

    const mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.target === overflowElement) {
          return;
        }
        handleChildrenMutation();
      });
    });

    mutationObserver.observe(overflowElement, {
      childList: true,
      attributes: true,
      characterData: true,
      subtree: true,
    });

    return () => {
      mutationObserver.disconnect();
    };
  }, [handleChildrenMutation]);

  return <Overflow demoId={demoId} />;
};
