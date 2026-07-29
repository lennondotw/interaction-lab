// Mutable physics + immutable per-bubble random parameters live in the same
// struct; selection state intentionally does NOT live here — it's read from
// a Set<string> ref so the picker can stay a controlled component without
// shadow state to keep in sync.

export interface Vec2 {
  x: number;
  y: number;
}

export interface BubbleState {
  // Stable identity
  id: string;
  label: string;

  // Mutable physics
  pos: Vec2;
  vel: Vec2;
  restPos: Vec2;
  scale: number;
  radius: number;

  // Procedural randomness, frozen for the lifetime of this bubble
  phase: number;
  harmAmp: readonly [number, number, number];
  harmSpeed: readonly [number, number, number];
  textureRotationDeg: number;
  driftAmp: Vec2;
  driftFreq: Vec2;
  driftPhase: Vec2;
  slack: number;

  // Render cache filled once after settle + textMeasurer pass
  idleLines: string[];
  selectedLines: string[];
  idleLineHeight: number;
  selectedLineHeight: number;

  // Texture refs filled when the consumer's images decode
  idleImage: HTMLImageElement | null;
  selectedImage: HTMLImageElement | null;
}
