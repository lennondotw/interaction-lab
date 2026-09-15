/** Physical coefficients for a linear damped spring. Mass defaults to 1. */
export interface SpringPhysics {
  stiffness: number;
  damping: number;
  mass?: number;
}

/** Natural frequency and damping ratio, not Motion's duration/bounce options. */
export interface SpringDynamics {
  /** Undamped natural angular frequency in rad/s, not Hz. Must be positive. */
  angularFrequency: number;
  /** 0 = undamped, < 1 = underdamped, 1 = critical, > 1 = overdamped. */
  dampingRatio: number;
  /** Positive mass, preserved for reversible conversion. Defaults to 1. */
  mass?: number;
}

function requireParameter(name: string, value: number, allowZero = false) {
  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new RangeError(`${name} must be finite and ${allowZero ? 'non-negative' : 'positive'}.`);
  }
}

/** Convert k/c/m to omega/zeta/m without rounding. */
export function toSpringDynamics({ stiffness, damping, mass = 1 }: SpringPhysics): Required<SpringDynamics> {
  requireParameter('stiffness', stiffness);
  requireParameter('damping', damping, true);
  requireParameter('mass', mass);
  const angularFrequency = Math.sqrt(stiffness / mass);
  return {
    angularFrequency,
    dampingRatio: damping / (2 * mass * angularFrequency),
    mass,
  };
}

/**
 * Convert omega/zeta/m to k/c/m for Motion's physical spring options.
 * Change frequency to tune speed while preserving the damping ratio.
 *
 * @example
 * toSpringPhysics({ angularFrequency: 20, dampingRatio: 0.8 })
 * // { stiffness: 400, damping: 32, mass: 1 }
 */
export function toSpringPhysics({ angularFrequency, dampingRatio, mass = 1 }: SpringDynamics): Required<SpringPhysics> {
  requireParameter('angularFrequency', angularFrequency);
  requireParameter('dampingRatio', dampingRatio, true);
  requireParameter('mass', mass);
  return {
    stiffness: mass * angularFrequency ** 2,
    damping: 2 * mass * angularFrequency * dampingRatio,
    mass,
  };
}
