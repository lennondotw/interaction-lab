import { faker } from '@faker-js/faker';
import { cn } from '@monorepo/utils';
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react';
import { FC, PropsWithChildren, useCallback, useLayoutEffect, useMemo, useRef } from 'react';

export const ScrollSmoothing: FC = () => {
  const paragraphs = useMemo(() => {
    return Array.from({ length: 20 }, () => faker.lorem.paragraph({ min: 10, max: 20 }));
  }, []);
  return (
    <ScrollSmoothed className="mx-auto max-w-4xl space-y-6 px-4 py-10 leading-relaxed">
      {paragraphs.map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </ScrollSmoothed>
  );
};

export const ScrollSmoothed: FC<PropsWithChildren & { className?: string }> = ({ children, className }) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const placeholderRef = useRef<HTMLDivElement>(null);

  const { scrollY } = useScroll();
  const prefersReduced = useReducedMotion();

  const smoothY = useSpring(scrollY, {
    stiffness: 140,
    damping: 22,
    mass: 1.05,
  });

  const y = useTransform(prefersReduced ? scrollY : smoothY, (v) => -v);

  const updatePlaceholderHeight = useCallback((newHeight: number) => {
    const placeholder = placeholderRef.current;
    if (!placeholder) return;
    placeholder.style.height = `${newHeight}px`;
  }, []);

  // measure the content height
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const handleContentResize = () => {
      const height = content.getBoundingClientRect().height;
      updatePlaceholderHeight(height);
    };

    const observer = new ResizeObserver(handleContentResize);
    window.addEventListener('resize', handleContentResize);
    handleContentResize();

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleContentResize);
    };
  }, [updatePlaceholderHeight]);

  return (
    <>
      {/* placeholder for native scroll height */}
      <div ref={placeholderRef} aria-hidden />
      {/* fixed layer to hold the actual content, offset by the smoothed -scrollY */}
      <motion.div style={{ y }} role="presentation" className={cn('fixed inset-0 will-change-transform')}>
        <div ref={contentRef} className={className}>
          {children}
        </div>
      </motion.div>
    </>
  );
};
