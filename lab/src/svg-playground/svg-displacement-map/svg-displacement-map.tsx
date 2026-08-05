import { ImageWithState } from '#src/animations/eager-layout/image-with-state.js';
import { LiquidDiv } from '#src/animations/liquid-square/liquid-div.js';
import { SpringTap } from '#src/animations/liquid-square/spring-tap.js';
import { Button } from '#src/components/button/button.js';
import { cn } from '@monorepo/utils';
import { cubicBezier, motion, useMotionValue } from 'motion/react';
import { FC, useMemo, useReducer, useState } from 'react';
import { drawCircularGlassDisplacementMap } from './draw-map-circular-glass.js';
import { getImages, imageReducer } from './images.js';

export const SvgDisplacementMap: FC = () => {
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const allImages = useMemo(() => getImages(), []);

  const [imageState, imageDispatch] = useReducer(imageReducer, {
    allImages: allImages,
    currentImage: allImages[0],
    currentImageName: allImages[0].name,
    currentImageUrl: allImages[0].url,
    currentImageIndex: 0,
    nextImageName: allImages[1].name,
  });

  const displacementMap = useMemo(() => drawCircularGlassDisplacementMap(), []);

  const [active, setActive] = useState(false);

  const [showBlurLayer, setShowBlurLayer] = useState(true);
  const [showDarkenLayer, setShowDarkenLayer] = useState(true);
  const [showTintLayer, setShowTintLayer] = useState(false);
  const [showGlassLayer, setShowGlassLayer] = useState(true);
  const [showVibranceLayer, setShowVibranceLayer] = useState(true);
  const [showActiveLayer, setShowActiveLayer] = useState(true);
  const [showEdgeHighlightLayer, setShowEdgeHighlightLayer] = useState(true);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 py-4">
      <SvgDefs className="absolute" displacementMapUrl={displacementMap?.dataUrl} />

      <h2 className="-mb-1 text-xl">SVG Displacement Map</h2>
      <p className="px-2 pb-6 text-sm">Drag the circle in the images to see the displacement effects.</p>

      {/* controls */}
      <div className={`flex max-w-3xl flex-row flex-wrap place-content-center gap-2 overflow-clip px-2 select-none`}>
        <Button
          size="sm"
          color={'green'}
          allPossibleContents={allImages.map((image) => `Switch to ${image.name} image`)}
          onClick={() => imageDispatch('next')}
          className="px-2"
        >
          Switch to {imageState.nextImageName} image
        </Button>

        <Button
          size="sm"
          color={showBlurLayer ? 'yellow' : 'green'}
          allPossibleContents={['Show blur layer', 'Hide blur layer']}
          onClick={() => setShowBlurLayer((prev) => !prev)}
          className="px-2"
        >
          {showBlurLayer ? 'Hide blur layer' : 'Show blur layer'}
        </Button>

        <Button
          size="sm"
          color={showDarkenLayer ? 'yellow' : 'green'}
          allPossibleContents={['Show darken layer', 'Hide darken layer']}
          onClick={() => setShowDarkenLayer((prev) => !prev)}
          className="px-2"
        >
          {showDarkenLayer ? 'Hide darken layer' : 'Show darken layer'}
        </Button>

        <Button
          size="sm"
          color={showTintLayer ? 'yellow' : 'green'}
          allPossibleContents={['Show tint layer', 'Hide tint layer']}
          onClick={() => setShowTintLayer((prev) => !prev)}
          className="px-2"
        >
          {showTintLayer ? 'Hide tint layer' : 'Show tint layer'}
        </Button>

        <Button
          size="sm"
          color={showGlassLayer ? 'yellow' : 'green'}
          allPossibleContents={['Show glass layer', 'Hide glass layer']}
          onClick={() => setShowGlassLayer((prev) => !prev)}
          className="px-2"
        >
          {showGlassLayer ? 'Hide glass layer' : 'Show glass layer'}
        </Button>

        <Button
          size="sm"
          color={showVibranceLayer ? 'yellow' : 'green'}
          allPossibleContents={['Show vibrance layer', 'Hide vibrance layer']}
          onClick={() => setShowVibranceLayer((prev) => !prev)}
          className="px-2"
        >
          {showVibranceLayer ? 'Hide vibrance layer' : 'Show vibrance layer'}
        </Button>

        <Button
          size="sm"
          color={showActiveLayer ? 'yellow' : 'green'}
          allPossibleContents={['Show active layer', 'Hide active layer']}
          onClick={() => setShowActiveLayer((prev) => !prev)}
          className="px-2"
        >
          {showActiveLayer ? 'Hide active layer' : 'Show active layer'}
        </Button>

        <Button
          size="sm"
          color={showEdgeHighlightLayer ? 'yellow' : 'green'}
          allPossibleContents={['Show edge highlight layer', 'Hide edge highlight layer']}
          onClick={() => setShowEdgeHighlightLayer((prev) => !prev)}
          className="px-2"
        >
          {showEdgeHighlightLayer ? 'Hide edge highlight layer' : 'Show edge highlight layer'}
        </Button>
      </div>

      {/* displacement map channels */}
      <div className={`flex flex-row gap-8 overflow-clip p-4 select-none`}>
        {/* r channel (x-axis) */}
        <img
          className="w-30 min-w-0 object-contain"
          src={displacementMap?.dataUrl}
          style={{
            aspectRatio: (displacementMap?.width ?? 1) / (displacementMap?.height ?? 1),
            filter: 'url(#r-channel-only)',
          }}
          alt="Displacement map (R channel)"
        />

        {/* g channel (y-axis) */}
        <img
          className="w-30 min-w-0 object-contain"
          src={displacementMap?.dataUrl}
          style={{
            aspectRatio: (displacementMap?.width ?? 1) / (displacementMap?.height ?? 1),
            filter: 'url(#g-channel-only)',
          }}
          alt="Displacement map (G channel)"
        />

        {/* original displacement map */}
        <img
          className="w-30 min-w-0 object-contain"
          src={displacementMap?.dataUrl}
          style={{
            aspectRatio: (displacementMap?.width ?? 1) / (displacementMap?.height ?? 1),
          }}
          alt="Displacement Map (original)"
        />
      </div>

      {/* results */}
      <div
        className={`
          flex flex-col gap-4 px-4 select-none
          md:flex-row md:gap-8
        `}
      >
        {/* displacement map overlay */}
        <div className="relative">
          <ImageWithState
            src={imageState.currentImageUrl ?? undefined}
            alt="Landscape nature field tree"
            draggable={false}
            className="aspect-square w-80 object-cover"
          />
          <motion.div
            className={cn('absolute inset-0 z-10 m-auto size-30 rounded-full')}
            drag
            dragConstraints={{ left: 0, top: 0, right: 0, bottom: 0 }}
            dragTransition={{ restDelta: 0.01, restSpeed: 0.1 }}
            dragElastic={1}
            style={{ x, y }}
          >
            <img
              src={displacementMap?.dataUrl}
              draggable={false}
              className="size-full rounded-full object-cover opacity-60"
            />
          </motion.div>
        </div>

        {/* final result */}
        <div className="relative">
          <ImageWithState
            src={imageState.currentImageUrl ?? undefined}
            alt="Landscape nature field tree"
            draggable={false}
            className="aspect-square w-80 object-cover"
          />
          <motion.div className={cn('absolute inset-0 z-10 m-auto size-30 rounded-full')} style={{ x, y }}>
            <LiquidDiv
              onTapStart={() => setActive(true)}
              onTap={() => setActive(false)}
              onTapCancel={() => setActive(false)}
              liquidConfig={{ hoverCursorShape: 'pointer', activeAndOutsideCursorShape: 'pointer' }}
              className="size-full rounded-full"
            >
              <SpringTap className="relative size-full rounded-full">
                {showBlurLayer && (
                  <div className={cn('pointer-events-none absolute inset-0 rounded-full backdrop-blur-[1px]')} />
                )}

                {showDarkenLayer && (
                  <div
                    className={cn('pointer-events-none absolute inset-0 rounded-full')}
                    style={{ backdropFilter: 'url(#darken)' }}
                  />
                )}

                {showTintLayer && (
                  <div
                    className={cn('pointer-events-none absolute inset-0 rounded-full')}
                    style={{ backdropFilter: 'url(#tint)' }}
                  />
                )}

                {showGlassLayer && (
                  <div
                    className={cn('pointer-events-none absolute inset-0 rounded-full')}
                    style={{ backdropFilter: 'url(#displacement-map-filter)' }}
                  />
                )}

                {showVibranceLayer && (
                  <div
                    className={cn('pointer-events-none absolute inset-0 rounded-full')}
                    style={{ backdropFilter: 'url(#vibrance)' }}
                  />
                )}

                {showActiveLayer && (
                  <motion.div
                    className={cn('pointer-events-none absolute inset-0 rounded-full')}
                    style={{ backdropFilter: 'url(#active)' }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: active ? 1 : 0 }}
                    transition={{ type: 'tween', duration: 0.5, ease: cubicBezier(0, 1, 0.2, 1) }}
                  />
                )}

                {showEdgeHighlightLayer && (
                  <div
                    className={cn('pointer-events-none absolute inset-0 rounded-full')}
                    style={{
                      backdropFilter: 'url(#highlight)',
                      maskImage: 'url(#edge-mask)',
                    }}
                  />
                )}
              </SpringTap>
            </LiquidDiv>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

const SvgDefs: FC<{ className?: string; displacementMapUrl?: string }> = ({ className, displacementMapUrl }) => {
  return (
    <svg className={cn(className)} width="0" height="0">
      <defs>
        <filter id="r-channel-only">
          <feColorMatrix
            type="matrix"
            values={`
            1 0 0 0 0
            0 0 0 0 0
            0 0 0 0 0
            0 0 0 0 1
          `}
          />
        </filter>

        <filter id="g-channel-only">
          <feColorMatrix
            type="matrix"
            values={`
            0 0 0 0 0
            0 1 0 0 0
            0 0 0 0 0
            0 0 0 0 1
          `}
          />
        </filter>

        <filter
          filterUnits="objectBoundingBox"
          primitiveUnits="objectBoundingBox"
          colorInterpolationFilters="sRGB"
          id="displacement-map-filter"
        >
          {displacementMapUrl && (
            <feImage
              href={displacementMapUrl}
              x="-0.02"
              y="-0.02"
              width="1.04"
              height="1.04"
              preserveAspectRatio="none"
              result="map"
            />
          )}
          <feDisplacementMap
            x="0"
            y="0"
            width="1"
            height="1"
            in="SourceGraphic"
            in2="map"
            scale={0.8}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>

        <filter id="vibrance" colorInterpolationFilters="sRGB">
          <feColorMatrix type="saturate" values="1.4" />
          <feComponentTransfer>
            <feFuncR type="gamma" amplitude="1" exponent="0.9" offset="0" />
            <feFuncG type="gamma" amplitude="1" exponent="0.9" offset="0" />
            <feFuncB type="gamma" amplitude="1" exponent="0.9" offset="0" />
          </feComponentTransfer>
        </filter>

        <filter id="active" colorInterpolationFilters="sRGB">
          <feFlood floodColor="#ffffff" floodOpacity="0.1" result="whiteLayer" />
          <feBlend in="SourceGraphic" in2="whiteLayer" mode="overlay" />
          <feColorMatrix type="saturate" values="1.1" />
          <feComponentTransfer>
            <feFuncR type="gamma" amplitude="1.3" exponent="0.8" offset="0.2" />
            <feFuncG type="gamma" amplitude="1.3" exponent="0.8" offset="0.2" />
            <feFuncB type="gamma" amplitude="1.3" exponent="0.8" offset="0.2" />
          </feComponentTransfer>
        </filter>

        {/* tint */}
        <filter id="darken" colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            values={`
              0.6 0 0 0 0
              0 0.6 0 0 0
              0 0 0.6 0 0
              0 0 0 1 0
            `}
          />
        </filter>

        <filter id="tint" colorInterpolationFilters="sRGB">
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values={`
              0.6 0.2 0.2 0 0
              0.2 0.6 0.2 0 0
              0.2 0.2 0.6 0 0
              0 0 0 1 0
            `}
            result="base"
          />
          <feFlood floodColor="#1e46fa" floodOpacity="0.2" result="blueLayer" />
          <feBlend in="base" in2="blueLayer" mode="overlay" />
        </filter>

        {/* edge highlight */}
        <filter
          filterUnits="objectBoundingBox"
          primitiveUnits="objectBoundingBox"
          colorInterpolationFilters="sRGB"
          id="highlight"
        >
          <feComponentTransfer>
            <feFuncR type="linear" slope="0.7" intercept="0.7" />
            <feFuncG type="linear" slope="0.7" intercept="0.7" />
            <feFuncB type="linear" slope="0.7" intercept="0.7" />
            <feFuncA type="identity" />
          </feComponentTransfer>
        </filter>

        <filter id="ring-blur" filterUnits="objectBoundingBox" primitiveUnits="objectBoundingBox">
          <feGaussianBlur stdDeviation="0.01" />
        </filter>

        <linearGradient
          id="edge-mask-gradient"
          gradientUnits="objectBoundingBox"
          gradientTransform="rotate(60 0.5 0.5)"
        >
          <stop offset="0%" stopColor="white" />
          <stop offset="50%" stopColor="black" />
          <stop offset="100%" stopColor="white" />
        </linearGradient>

        <mask id="edge-mask" maskUnits="objectBoundingBox" maskContentUnits="objectBoundingBox">
          <g opacity="0.8">
            <rect x="-0.2" y="-0.2" width="1.4" height="1.4" fill="url(#edge-mask-gradient)" />
            <g style={{ mixBlendMode: 'multiply' }} filter="url(#ring-blur)">
              <circle cx="0.5" cy="0.5" r="0.5" fill="black" />
            </g>
          </g>
        </mask>
      </defs>
    </svg>
  );
};
