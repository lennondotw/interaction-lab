import { useLayoutEffect, useRef, type FC } from 'react';

export const TabTitle: FC<{ title: string }> = ({ title }) => {
  const titleRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const viewport = titleRef.current!;
    const text = viewport.firstElementChild!;
    const measure = () => {
      viewport.toggleAttribute(
        'data-overflow',
        text.getBoundingClientRect().width > viewport.getBoundingClientRect().width
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(text);
    measure();
    return () => observer.disconnect();
  }, [title]);

  return (
    <span
      ref={titleRef}
      className="block overflow-clip whitespace-nowrap data-overflow:mask-r-from-[calc(100%-20px)] data-overflow:mask-r-to-100% data-overflow:mask-r-to-black/50"
    >
      <span className="inline-block px-3">{title}</span>
    </span>
  );
};
