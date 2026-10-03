import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  transform,
  type MotionValue,
} from 'motion/react';
import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';

import { createIndicatorSpring, handleSpring } from './indicator-spring.js';
import {
  indicatorDash,
  indicatorLength,
  indicatorSize,
  indicatorTravelScale,
  measureIndicatorGeometry,
  type EdgeAxis,
  type IndicatorGeometry,
} from './resize-indicator-geometry.js';

export type HandleAxis = EdgeAxis | 'both';
export type HoveredHandle = HandleAxis | 'none';
type MeasuredGeometry = { measured: IndicatorGeometry | null };

const indicatorColor = { rest: 'rgb(115, 115, 115)', active: '#fff' };
const indicatorOpacity = { rest: 0.6, hover: 0.8, active: 1 };

/** Single-axis grips and curved indicators use the same states and spring parameters. */
export function useIndicatorStyle(
  axis: EdgeAxis,
  hoveredAxis: MotionValue<HoveredHandle>,
  activeAxis: MotionValue<HoveredHandle>,
  cornerProgress?: MotionValue<number>
) {
  const reducedMotion = useReducedMotion();
  const edgeLength = useMotionValue(indicatorSize.rest.length);
  const cornerLength = useMotionValue(indicatorSize.hover.length * indicatorTravelScale);
  const thickness = useMotionValue(indicatorSize.rest.thickness);
  const white = useMotionValue(0);
  const opacity = useMotionValue(indicatorOpacity.rest);

  useLayoutEffect(() => {
    const springs = {
      edgeLength: createIndicatorSpring(edgeLength),
      cornerLength: createIndicatorSpring(cornerLength),
      thickness: createIndicatorSpring(thickness),
      white: createIndicatorSpring(white),
      opacity: createIndicatorSpring(opacity),
    };
    function retarget() {
      const pressed = activeAxis.get() === axis || activeAxis.get() === 'both';
      const hovered = hoveredAxis.get() === axis;
      const cornerHovered = hoveredAxis.get() === 'both';
      const size = pressed ? indicatorSize.active : hovered ? indicatorSize.hover : indicatorSize.rest;
      springs.edgeLength.set(size.length, pressed, !!reducedMotion);
      springs.cornerLength.set(
        (pressed ? indicatorSize.active.length : indicatorSize.hover.length) * indicatorTravelScale,
        pressed,
        !!reducedMotion
      );
      springs.thickness.set(
        pressed
          ? indicatorSize.active.thickness
          : hovered || cornerHovered
            ? indicatorSize.hover.thickness
            : indicatorSize.rest.thickness,
        pressed,
        !!reducedMotion
      );
      springs.white.set(Number(pressed), pressed, !!reducedMotion);
      springs.opacity.set(
        pressed ? indicatorOpacity.active : hovered || cornerHovered ? indicatorOpacity.hover : indicatorOpacity.rest,
        pressed,
        !!reducedMotion
      );
    }
    retarget();
    const stopHover = hoveredAxis.on('change', retarget);
    const stopActive = activeAxis.on('change', retarget);
    return () => {
      stopHover();
      stopActive();
      for (const spring of Object.values(springs)) spring.stop();
    };
  }, [axis, hoveredAxis, activeAxis, reducedMotion, edgeLength, cornerLength, thickness, white, opacity]);

  const color = useTransform(() => transform(white.get(), [0, 1], [indicatorColor.rest, indicatorColor.active]));
  const readStyle = useCallback(() => {
    const at = cornerProgress?.get() ?? 0;
    return {
      // Keep the travel spring separate: both edges still share one normalized 35/1 route.
      // Both footprint lengths carry their own pixel velocity across press/release;
      // the affine mix also preserves the ongoing contour movement's velocity.
      length: indicatorLength(at, edgeLength.get(), cornerLength.get()),
      thickness: thickness.get(),
      opacity: opacity.get(),
    };
  }, [cornerProgress, edgeLength, cornerLength, thickness, opacity]);
  return { readStyle, thickness, color, opacity };
}

type IndicatorStyle = ReturnType<typeof useIndicatorStyle>;

function EdgeIndicator({
  axis,
  geometry,
  progress,
  style,
  readLayerOpacity,
}: {
  axis: EdgeAxis;
  geometry: MotionValue<MeasuredGeometry>;
  progress: MotionValue<number>;
  style: IndicatorStyle;
  readLayerOpacity: () => number;
}) {
  const pathRef = useRef<SVGPathElement>(null);
  const { readStyle, thickness, color } = style;
  const strokeOpacity = useTransform(() => readStyle().opacity / readLayerOpacity());
  const readStroke = useCallback(() => {
    const measured = geometry.get().measured;
    // Read every motion input before measurement so dependency tracking subscribes immediately.
    const at = progress.get();
    const appearance = readStyle();
    if (measured === null) return null;
    const dash = indicatorDash(measured, axis, at, appearance.length, appearance.thickness);
    return {
      path: measured.path,
      transform: `translate(${measured.origin.x} ${measured.origin.y})`,
      array: dash.array,
      offset: dash.offset,
    };
  }, [axis, geometry, progress, readStyle]);
  const path = useTransform(() => readStroke()?.path ?? '');
  const placement = useTransform(() => readStroke()?.transform ?? '');
  const dashArray = useTransform(() => readStroke()?.array ?? '');
  const dashOffset = useTransform(() => readStroke()?.offset ?? 0);

  // ResizeObserver runs before paint, after Motion's frame. Apply the measured geometry without a frame of lag.
  useLayoutEffect(
    () =>
      geometry.on('change', () => {
        const current = readStroke()!;
        const element = pathRef.current!;
        element.setAttribute('d', current.path);
        element.setAttribute('transform', current.transform);
        element.setAttribute('stroke-dasharray', current.array);
        element.setAttribute('stroke-dashoffset', String(current.offset));
      }),
    [geometry, readStroke]
  );

  return (
    <motion.path
      ref={pathRef}
      data-resize-indicator={axis}
      d={path}
      transform={placement}
      strokeDasharray={dashArray}
      strokeDashoffset={dashOffset}
      fill="none"
      stroke={color}
      strokeOpacity={strokeOpacity}
      strokeWidth={thickness}
      strokeLinecap="round"
    />
  );
}

/** Both paths follow one normalized spring, independent of their distances to the corner. */
export function ResizeIndicators({
  bodyRef,
  hoveredAxis,
  activeAxis,
}: {
  bodyRef: RefObject<HTMLDivElement | null>;
  hoveredAxis: MotionValue<HoveredHandle>;
  activeAxis: MotionValue<HoveredHandle>;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const geometry = useMotionValue<MeasuredGeometry>({ measured: null });
  const reducedMotion = useReducedMotion();
  const cornerTarget = useTransform(() => Number(hoveredAxis.get() === 'both' || activeAxis.get() === 'both'));
  const cornerSpring = useSpring(cornerTarget, handleSpring);
  const progress = useTransform(() => (reducedMotion ? cornerTarget.get() : cornerSpring.get()));
  const widthStyle = useIndicatorStyle('width', hoveredAxis, activeAxis, progress);
  const heightStyle = useIndicatorStyle('height', hoveredAxis, activeAxis, progress);
  const readWidthStyle = widthStyle.readStyle;
  const readHeightStyle = heightStyle.readStyle;
  // Composite the two paths before applying opacity: two coincident 0.8-alpha
  // strokes would otherwise become 0.96 at the corner. Normalize each stroke
  // against this shared layer so an unrelated resting edge still retains 0.6.
  const readLayerOpacity = useCallback(
    () => Math.max(readWidthStyle().opacity, readHeightStyle().opacity),
    [readWidthStyle, readHeightStyle]
  );
  const opacity = useTransform(readLayerOpacity);

  useLayoutEffect(() => {
    const svgElement = svgRef.current!;
    const windowElement = svgElement.parentElement!;
    const bodyElement = bodyRef.current!;
    // Native SVG arc length, evaluated only when the window/body layout changes.
    const contour = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const measureLength = (path: string) => {
      contour.setAttribute('d', path);
      return contour.getTotalLength();
    };

    function measure() {
      const windowBounds = windowElement.getBoundingClientRect();
      const bodyBounds = bodyElement.getBoundingClientRect();
      const svgBounds = svgElement.getBoundingClientRect();
      const style = getComputedStyle(windowElement);
      const radius = parseFloat(style.borderBottomRightRadius);
      // The frame has a uniform border; follow its painted center line.
      const halfBorder = parseFloat(style.borderRightWidth) / 2;
      geometry.set({
        measured: measureIndicatorGeometry(
          {
            x: windowBounds.x + halfBorder - svgBounds.x,
            y: windowBounds.y + halfBorder - svgBounds.y,
            width: windowBounds.width - 2 * halfBorder,
            height: windowBounds.height - 2 * halfBorder,
            radius: radius - halfBorder,
          },
          {
            x: bodyBounds.x + bodyBounds.width / 2 - svgBounds.x,
            y: bodyBounds.y + bodyBounds.height / 2 - svgBounds.y,
          },
          measureLength
        ),
      });
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(windowElement);
    observer.observe(bodyElement);
    return () => observer.disconnect();
  }, [bodyRef, geometry]);

  return (
    <motion.svg
      ref={svgRef}
      aria-hidden="true"
      focusable="false"
      className="pointer-events-none absolute inset-0 z-20 size-full overflow-visible"
      style={{ opacity }}
    >
      <EdgeIndicator
        axis="width"
        geometry={geometry}
        progress={progress}
        style={widthStyle}
        readLayerOpacity={readLayerOpacity}
      />
      <EdgeIndicator
        axis="height"
        geometry={geometry}
        progress={progress}
        style={heightStyle}
        readLayerOpacity={readLayerOpacity}
      />
    </motion.svg>
  );
}
