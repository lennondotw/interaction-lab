export const expoDecay = (t: number, k = 0.5): number => {
  return Math.exp(-k * t);
};

export function expDecayGaussian(x: number, lambda = 0.3): number {
  return Math.exp(-lambda * x * x);
}
