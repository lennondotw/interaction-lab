import type { MotionValue } from 'motion/react';
import { useAnimationFrame, useMotionValue, useMotionValueEvent } from 'motion/react';
import { useRef } from 'react';

interface Opts {
  /** Time constant of the EMA. Smaller means faster decay. */
  tauMs?: number;
  /** EMA deadband. If |ema| <= deadband, it is considered 0. */
  deadband?: number;
  /** Threshold for leaving 0. If |ema| >= upZero, it will exit 0 state. */
  upZero?: number;
  /** Threshold for returning to 0. If |ema| <= downZero, it will return to 0 state. Must be < upZero. */
  downZero?: number;
  /** Fractional threshold for increasing from n to n+1. (n + upFrac) */
  upFrac?: number;
  /** Fractional threshold for decreasing from n to n-1. ((n-1) + downFrac). Must be < upFrac. */
  downFrac?: number;
  /** Maximum spike suppression. */
  maxSpike?: number;
}

export function useQuantizedVelocityRaf(
  vRaw: MotionValue<number>,
  {
    tauMs = 80,
    deadband = 0.1,
    upZero = 0.6,
    downZero = 0.3,
    upFrac = 0.8,
    downFrac = 0.2,
    maxSpike = Infinity,
  }: Opts = {}
): MotionValue<number> {
  const vOut = useMotionValue<number>(0);

  const emaRef = useRef(0); // smooth velocity in continuous domain
  const zeroSticky = useRef(true); // whether in "0 state"
  const signRef = useRef<1 | -1>(1); // fixed sign in non-0 state, until returning to 0 allows switching
  const qRef = useRef(0); // last quantized value output (including sign)
  const active = useRef(false);
  const tPrev = useRef<number | null>(null);

  // when the raw velocity changes, mark the entry into active state
  useMotionValueEvent(vRaw, 'change', (cur0) => {
    const cur = Math.max(-maxSpike, Math.min(maxSpike, cur0));
    if (cur !== 0) active.current = true;
  });

  useAnimationFrame((t) => {
    if (!active.current) return;

    const dt = tPrev.current == null ? 16.7 : Math.max(1, t - tPrev.current);
    tPrev.current = t;

    // EMA coefficient independent of frame rate
    const alpha = 1 - Math.exp(-dt / tauMs);

    // read and limit
    const cur = Math.max(-maxSpike, Math.min(maxSpike, vRaw.get()));

    // push EMA
    let ema = emaRef.current + alpha * (cur - emaRef.current);
    if (Math.abs(ema) <= deadband) ema = 0;

    // 0 state hysteresis: only leave 0 when |ema| >= upZero; only return to 0 when |ema| <= downZero
    if (zeroSticky.current) {
      if (Math.abs(ema) >= upZero) {
        zeroSticky.current = false;
        signRef.current = (Math.sign(ema) || 1) as 1 | -1;
        // first time leaving 0: at least to 1
        qRef.current = 1 * signRef.current;
        vOut.set(qRef.current);
        emaRef.current = ema;
        return;
      } else {
        // keep 0, if ema and raw are both zero, stop updating
        vOut.set(0);
        emaRef.current = 0;
        if (cur === 0) {
          active.current = false;
          tPrev.current = null;
        }
        return;
      }
    }

    // non-0 state: lock sign until returning to 0, to avoid symbol jitter near 0
    const s = signRef.current;
    const mag = Math.abs(ema);
    let qAbs = Math.max(1, Math.abs(qRef.current)); // current integer step (absolute value >= 1)

    // return to 0 takes precedence over step down
    if (mag <= downZero) {
      zeroSticky.current = true;
      qRef.current = 0;
      vOut.set(0);
      emaRef.current = 0;
      // if raw is also stationary, exit active state
      if (cur === 0) {
        active.current = false;
        tPrev.current = null;
      }
      return;
    }

    // integer step hysteresis:
    // - upgrade: mag >= qAbs + upFrac -> qAbs++
    // - downgrade: qAbs > 1 and mag <= (qAbs - 1) + downFrac -> qAbs--
    if (mag >= qAbs + upFrac) {
      qAbs += 1;
    } else if (qAbs > 1 && mag <= qAbs - 1 + downFrac) {
      qAbs -= 1;
    } // otherwise keep the original step, to avoid 1/2 jitter

    const q = qAbs * s;
    if (q !== qRef.current) {
      qRef.current = q;
      vOut.set(q);
    }

    emaRef.current = ema;
  });

  return vOut;
}
