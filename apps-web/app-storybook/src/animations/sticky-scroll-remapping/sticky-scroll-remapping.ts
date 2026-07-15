export interface StickyScrollGeometry {
  sectionHeight: number;
  stickyHeight: number;
  viewportHeight: number;
}

const DRIFT_VELOCITY = 0.08;
const TRANSITION_VIEWPORT_RATIO = 0.65;
const TRANSITION_LOW_REGION_RATIO = 0.6;

const clampUnitInterval = (value: number) => Math.min(1, Math.max(0, value));

// Integrating a C2-continuous smootherstep velocity profile produces a position curve whose
// acceleration also reaches zero at each boundary. The native sticky layout remains untouched;
// this curve is used only to calculate the visual compensation applied to its child layer.
const integrateSmootherstep = (progress: number) => {
  const clampedProgress = clampUnitInterval(progress);
  const progressSquared = clampedProgress * clampedProgress;
  const progressFourth = progressSquared * progressSquared;

  return (
    clampedProgress * clampedProgress * progressFourth - 3 * clampedProgress * progressFourth + 2.5 * progressFourth
  );
};

const getNativeStickyDisplacement = ({
  inputDistance,
  plateauDistance,
  viewportHeight,
}: {
  inputDistance: number;
  plateauDistance: number;
  viewportHeight: number;
}) => {
  if (inputDistance <= viewportHeight) return inputDistance;
  if (inputDistance <= viewportHeight + plateauDistance) return viewportHeight;

  return inputDistance - plateauDistance;
};

export const getRemappedStickyDisplacement = (
  progress: number,
  { sectionHeight, stickyHeight, viewportHeight }: StickyScrollGeometry
) => {
  const plateauDistance = sectionHeight - stickyHeight;
  const totalInputDistance = viewportHeight + sectionHeight;

  if (plateauDistance <= 0 || stickyHeight <= 0 || totalInputDistance <= 0 || viewportHeight <= 0) {
    return getNativeStickyDisplacement({
      inputDistance: clampUnitInterval(progress) * Math.max(0, totalInputDistance),
      plateauDistance: Math.max(0, plateauDistance),
      viewportHeight: Math.max(0, viewportHeight),
    });
  }

  const equivalentLowVelocityDistance = plateauDistance / (1 - DRIFT_VELOCITY);
  const transitionDistance = Math.min(
    viewportHeight * TRANSITION_VIEWPORT_RATIO,
    equivalentLowVelocityDistance * TRANSITION_LOW_REGION_RATIO
  );
  const driftDistance = equivalentLowVelocityDistance - transitionDistance;

  // Preserve the integral of the native velocity profile. This keeps both endpoints fixed while
  // replacing its two sharp velocity corners with gradual deceleration, drift, and acceleration.
  const outerDistanceReduction = (plateauDistance * DRIFT_VELOCITY) / (1 - DRIFT_VELOCITY) + transitionDistance;
  const outerDistance = viewportHeight + stickyHeight;
  const outerDistanceScale = Math.max(0, 1 - outerDistanceReduction / outerDistance);
  const leadingDistance = viewportHeight * outerDistanceScale;
  const trailingDistance = stickyHeight * outerDistanceScale;
  const inputDistance = clampUnitInterval(progress) * totalInputDistance;

  if (inputDistance <= leadingDistance) return inputDistance;

  let remainingDistance = inputDistance - leadingDistance;
  let displacement = leadingDistance;

  if (remainingDistance <= transitionDistance) {
    const transitionProgress = remainingDistance / transitionDistance;

    return (
      displacement +
      transitionDistance * (transitionProgress + (DRIFT_VELOCITY - 1) * integrateSmootherstep(transitionProgress))
    );
  }

  displacement += transitionDistance * ((1 + DRIFT_VELOCITY) / 2);
  remainingDistance -= transitionDistance;

  if (remainingDistance <= driftDistance) {
    return displacement + remainingDistance * DRIFT_VELOCITY;
  }

  displacement += driftDistance * DRIFT_VELOCITY;
  remainingDistance -= driftDistance;

  if (remainingDistance <= transitionDistance) {
    const transitionProgress = remainingDistance / transitionDistance;

    return (
      displacement +
      transitionDistance *
        (DRIFT_VELOCITY * transitionProgress + (1 - DRIFT_VELOCITY) * integrateSmootherstep(transitionProgress))
    );
  }

  displacement += transitionDistance * ((1 + DRIFT_VELOCITY) / 2);
  remainingDistance -= transitionDistance;

  return displacement + Math.min(remainingDistance, trailingDistance);
};

export const getStickyScrollCompensation = (progress: number, geometry: StickyScrollGeometry) => {
  const plateauDistance = Math.max(0, geometry.sectionHeight - geometry.stickyHeight);
  const totalInputDistance = Math.max(0, geometry.viewportHeight + geometry.sectionHeight);
  const inputDistance = clampUnitInterval(progress) * totalInputDistance;
  const nativeDisplacement = getNativeStickyDisplacement({
    inputDistance,
    plateauDistance,
    viewportHeight: geometry.viewportHeight,
  });
  const remappedDisplacement = getRemappedStickyDisplacement(progress, geometry);

  return nativeDisplacement - remappedDisplacement;
};
