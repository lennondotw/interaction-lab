import { cn } from '@monorepo/utils';
import type { CSSProperties, FC, ReactNode } from 'react';

import { MACOS_WINDOW_STYLES, type MacOSWindowStyleSpec, TRAFFIC_LIGHT_COLORS } from './macos-window-styles.js';
import type { MacOSWindowVariant } from './macos-window-styles.js';

export interface MacOSWindowProps {
  /**
   * `basic` is a 16px corner with the lights centered in a 32px strip;
   * `rounded` is a 26px corner with the lights pushed in to match it.
   */
  variant?: MacOSWindowVariant;
  /**
   * Draw an opaque title bar behind the lights, with a hairline under it,
   * and lay `children` out below it instead of under the lights.
   */
  titleBar?: boolean;
  children?: ReactNode;
  /** The window has no intrinsic size — set it here, or let the parent's layout do it. */
  className?: string;
  style?: CSSProperties;
}

/**
 * Hairline edge plus drop shadow, both as `box-shadow` so neither takes
 * layout space. The hairline flips from a dark line on light to a light
 * line on dark, which is what keeps the edge visible against either
 * wallpaper.
 */
const FRAME = `
  relative isolate flex flex-col overflow-hidden bg-white
  shadow-[0_0_0_0.5px_rgba(0,0,0,0.23),0_16px_48px_rgba(0,0,0,0.35)]
  dark:bg-[#1E1E1E] dark:shadow-[0_0_0_0.5px_rgba(255,255,255,0.15),0_16px_48px_rgba(0,0,0,0.55)]
`;

/**
 * The separator is an outer `box-shadow` hanging below the bar, in the
 * window hairline's color at half its alpha. Being a shadow, it leaves the
 * bar exactly the variant's title-strip height; being outside, it lies
 * over the first 0.5px of the content, so the bar is lifted above the
 * content layer to keep the line from being painted over.
 */
const TITLE_BAR = `
  relative z-1 flex-none bg-white shadow-[0_0.5px_0_rgba(0,0,0,0.115)]
  dark:bg-[#262626] dark:shadow-[0_0.5px_0_rgba(255,255,255,0.075)]
`;

const TrafficLights: FC<{ spec: MacOSWindowStyleSpec }> = ({ spec }) => (
  <div
    aria-hidden
    className="pointer-events-none absolute z-10 flex items-center"
    style={{ left: spec.trafficLightOffsetX, top: spec.trafficLightOffsetY, gap: spec.trafficLightGap }}
  >
    {TRAFFIC_LIGHT_COLORS.map((color) => (
      <span
        key={color}
        className="rounded-full shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.1)]"
        style={{ width: spec.trafficLightSize, height: spec.trafficLightSize, backgroundColor: color }}
      />
    ))}
  </div>
);

/**
 * A macOS window frame: rounded, hairline-edged, drop-shadowed, with the
 * three traffic lights in its top-left corner.
 *
 * The lights are decoration only — no hover glyphs, no inactive state, no
 * pointer events. By default they float over `children`, the way a
 * full-size-content window draws them, and content that must stay clear of
 * them can pad by `--macos-window-titlebar-height`, which the frame sets to
 * the variant's title-strip height. With `titleBar` the strip becomes an
 * opaque bar, `children` start below it, and the variable drops to `0px`
 * so the same padding does not double up.
 *
 * @example
 * ```tsx
 * <MacOSWindow variant="rounded" className="h-160 w-240">
 *   <div className="pt-(--macos-window-titlebar-height)">…</div>
 * </MacOSWindow>
 * ```
 */
export const MacOSWindow: FC<MacOSWindowProps> = ({
  variant = 'basic',
  titleBar = false,
  children,
  className,
  style,
}) => {
  const spec = MACOS_WINDOW_STYLES[variant];

  return (
    <div
      className={cn(FRAME, className)}
      style={
        {
          borderRadius: spec.cornerRadius,
          '--macos-window-titlebar-height': titleBar ? '0px' : `${String(spec.titleBarHeight)}px`,
          ...style,
        } as CSSProperties
      }
    >
      <TrafficLights spec={spec} />
      {titleBar && <div className={TITLE_BAR} style={{ height: spec.titleBarHeight }} />}
      <div className="relative min-h-0 flex-1">{children}</div>
    </div>
  );
};
