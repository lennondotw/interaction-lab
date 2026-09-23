export type MacOSWindowVariant = 'basic' | 'rounded';

export interface MacOSWindowStyleSpec {
  cornerRadius: number;
  /**
   * Height of the strip the traffic lights sit in. The window draws no bar
   * of its own — the lights float over the content — so this is the inset
   * content has to leave clear, exposed as `--macos-window-titlebar-height`.
   */
  titleBarHeight: number;
  /** Top-left of the first light, measured from the window's corner. */
  trafficLightOffsetX: number;
  trafficLightOffsetY: number;
  trafficLightSize: number;
  trafficLightGap: number;
}

/**
 * Both variants use macOS's native 14px lights with a 9px gap; they differ
 * only in corner radius and how far the group is inset from the corner.
 *
 * - basic:   title strip 32 = 9 + 14 + 9, first light at (9, 9)
 * - rounded: title strip 52 = 18 + (1 + 14 + 1) + 18, first light at (19, 19)
 */
export const MACOS_WINDOW_STYLES = {
  basic: {
    cornerRadius: 16,
    titleBarHeight: 32,
    trafficLightOffsetX: 9,
    trafficLightOffsetY: 9,
    trafficLightSize: 14,
    trafficLightGap: 9,
  },
  rounded: {
    cornerRadius: 26,
    titleBarHeight: 52,
    trafficLightOffsetX: 19,
    trafficLightOffsetY: 19,
    trafficLightSize: 14,
    trafficLightGap: 9,
  },
} as const satisfies Record<MacOSWindowVariant, MacOSWindowStyleSpec>;

/** Close, minimize, zoom. The same in light and dark appearance. */
export const TRAFFIC_LIGHT_COLORS = ['#ff736a', '#febc2e', '#19c332'] as const;

/** Preset frame sizes carried over from the source Storybook toolbar. */
export const MACOS_WINDOW_SIZES = {
  small: { width: 720, height: 480 },
  medium: { width: 960, height: 640 },
  large: { width: 1200, height: 800 },
} as const satisfies Record<string, { width: number; height: number }>;

export type MacOSWindowSize = keyof typeof MACOS_WINDOW_SIZES;
