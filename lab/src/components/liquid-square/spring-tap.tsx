import { HTMLMotionProps, motion } from 'motion/react';
import { FC } from 'react';

export const SpringTap: FC<HTMLMotionProps<'div'>> = (props) => {
  const { children, ...restProps } = props;
  return (
    <motion.div
      {...restProps}
      whileTap={{
        scale: 1.2,
        transition: {
          type: 'spring',
          stiffness: 300,
          damping: 12,
          mass: 0.6,
          restDelta: 0.001,
          restSpeed: 0.01,
        },
      }}
    >
      {children}
    </motion.div>
  );
};
