export const CARD_COUNT = 10;
export const TRIGGER_COUNT = CARD_COUNT - 1; // 9 trigger points between 10 cards
export const CARD_HEIGHT_SVH = 70;
export const CARD_GAP_SVH = 3;
export const CARD_UNIT_SVH = CARD_HEIGHT_SVH + CARD_GAP_SVH; // 75svh per card

// Each card corresponds to this fixed scroll distance (in pixels)
export const SCROLL_PER_CARD_PX = 200;

// Trigger zone within each 10% segment (relative to segment, so 0.4-0.6 means 40% - 60% of the 10% segment)
export const TRIGGER_ZONE_LOW = 0.4; // 40% within segment
export const TRIGGER_ZONE_HIGH = 0.6; // 60% within segment

export const CARD_GRADIENTS = [
  'from-rose-500 to-pink-600',
  'from-orange-500 to-amber-600',
  'from-yellow-500 to-lime-600',
  'from-emerald-500 to-teal-600',
  'from-cyan-500 to-sky-600',
  'from-blue-500 to-indigo-600',
  'from-violet-500 to-purple-600',
  'from-fuchsia-500 to-pink-600',
  'from-slate-500 to-zinc-600',
  'from-red-500 to-rose-600',
  'from-amber-500 to-orange-600',
] as const;

export function getCardGradient(index: number): (typeof CARD_GRADIENTS)[number] {
  return CARD_GRADIENTS[index % CARD_GRADIENTS.length] ?? CARD_GRADIENTS[0];
}
