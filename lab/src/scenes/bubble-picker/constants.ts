// Cluster geometry. All distances in CSS px; all rates in 1/seconds.

export const BUBBLE_COUNT = 20;
export const DEFAULT_MAX_SELECT = 3;

export const MIN_R = 45;
export const MAX_R = 57.5;
export const SELECTED_SCALE = 1.15;

export const MIN_GAP = 10;
export const MAX_GAP = 14;

export const SAMPLE_COUNT = 48;
export const VERTICAL_PAD = 50;
export const DRIFT_AMP_MAX = 5;

// Settle (offline, runs once on mount)
export const SETTLE_ITERS = 500;
export const SETTLE_PBD_ITERS = 20;
export const SETTLE_GRAVITY_K = 5;
export const SETTLE_REPULSE_K = 35;
export const SETTLE_WALL_K = 25;
export const SETTLE_DAMPING = 8;
export const SETTLE_DT = 1 / 60;
export const SETTLE_EDGE_PAD_FRACTION = 0.25;

// Runtime (per-frame, all per-second rates)
export const RUNTIME_REST_K = 6;
export const RUNTIME_PUSH_K = 30;
export const RUNTIME_WALL_K = 14;
export const RUNTIME_DAMPING = 6;
export const RUNTIME_PBD_ITERS = 2;
export const SCALE_EASE_RATE = 12;

export const DT_CLAMP = 1 / 30;

// Tap-vs-scroll
export const TOUCH_SLOP_PX = 8;

// Rest detector thresholds
export const REST_VEL_EPS = 0.5; // px/s sum |vx| + |vy|
export const REST_POS_EPS = 0.5; // px sum |dx| + |dy| from restPos
export const REST_SCALE_EPS = 0.001;
