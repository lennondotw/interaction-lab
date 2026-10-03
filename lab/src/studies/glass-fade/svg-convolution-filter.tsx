import { Fragment, useSyncExternalStore, type FC } from 'react';

import { gaussianConvolution } from './gaussian-convolution.js';

function subscribeDpr(changed: () => void) {
  let resolution = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
  const update = () => {
    resolution.removeEventListener('change', update);
    resolution = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    resolution.addEventListener('change', update);
    changed();
  };

  resolution.addEventListener('change', update);
  return () => resolution.removeEventListener('change', update);
}

const readDpr = () => window.devicePixelRatio;

export const SvgConvolutionFilter: FC<{ id: string; radius: number; targetRadius: number }> = ({
  id,
  radius,
  targetRadius,
}) => {
  const dpr = useSyncExternalStore(subscribeDpr, readDpr);
  const kernel = gaussianConvolution(radius, targetRadius, dpr);

  return (
    <svg aria-hidden className="pointer-events-none absolute" height={0} width={0}>
      <defs>
        {/* Overscan keeps primitive crop bounds outside the panel. sRGB matches CSS blur;
            preserving alpha keeps a zero-radius pass from washing out the backdrop. */}
        <filter colorInterpolationFilters="sRGB" height="300%" id={id} width="300%" x="-100%" y="-100%">
          {Array.from({ length: kernel.passes }, (_, pass) => (
            <Fragment key={pass}>
              <feConvolveMatrix
                divisor={1}
                edgeMode="duplicate"
                in={pass === 0 ? 'SourceGraphic' : `vertical-${pass - 1}`}
                kernelMatrix={kernel.matrix}
                order={`${kernel.order} 1`}
                preserveAlpha
                result={`horizontal-${pass}`}
                targetX={kernel.half}
                targetY={0}
              />
              <feConvolveMatrix
                divisor={1}
                edgeMode="duplicate"
                in={`horizontal-${pass}`}
                kernelMatrix={kernel.matrix}
                order={`1 ${kernel.order}`}
                preserveAlpha
                result={`vertical-${pass}`}
                targetX={0}
                targetY={kernel.half}
              />
            </Fragment>
          ))}
        </filter>
      </defs>
    </svg>
  );
};
