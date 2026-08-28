import { en, Faker } from '@faker-js/faker';

import type { BubblePickerItem } from './bubble-picker.js';

/**
 * Fixed seed. Faker is here to keep the demo content neutral, not to add
 * randomness — every story, every reload, and every visual diff must see
 * the exact same label set, otherwise the settle replay and the debug
 * overlays stop being comparable between runs.
 */
export const BUBBLE_ITEM_SEED = 20260729;

/**
 * A bubble is ~90–115px across and wraps its label at `radius * 1.5`, so a
 * three-word name ("Apple Juice Concentrate") stacks three lines and fills
 * the whole marble. Two words is the most that still reads as a tag.
 */
const MAX_LABEL_WORDS = 2;

/** Bail-out for the dedupe loop in case a locale's pool is smaller than `count`. */
const MAX_DRAWS_PER_LABEL = 50;

function toTitleCase(value: string): string {
  return value.replace(/\b\p{Ll}/gu, (c) => c.toUpperCase());
}

function splitWords(value: string): string[] {
  return value.trim().split(/\s+/);
}

/**
 * Seeded food names, title-cased to read like picker tags. Draws are
 * rejected unless they fit in `MAX_LABEL_WORDS` and are unique — the
 * cluster is small enough that a duplicate is immediately visible. The
 * ingredient pool is short-name-heavy, so the filter costs ~2 extra draws
 * across 30 labels.
 */
export function buildBubbleLabels(count: number): string[] {
  const faker = new Faker({ locale: [en], seed: BUBBLE_ITEM_SEED });
  const labels: string[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < count; i++) {
    let label = '';
    let lastWords: string[] = [];
    for (let draw = 0; draw < MAX_DRAWS_PER_LABEL; draw++) {
      const words = splitWords(toTitleCase(faker.food.ingredient()));
      lastWords = words;
      const candidate = words.join(' ');
      if (words.length <= MAX_LABEL_WORDS && !seen.has(candidate)) {
        label = candidate;
        break;
      }
    }
    // Pool exhausted — fall back to the last draw's first word plus an
    // index, which honours the count, stays unique, and is still two words.
    if (label === '') label = `${lastWords[0] ?? 'Item'} ${i + 1}`;
    seen.add(label);
    labels.push(label);
  }

  return labels;
}

export function buildBubbleItems(count: number): BubblePickerItem[] {
  return buildBubbleLabels(count).map((label, idx) => ({ id: `bubble-${idx}`, label }));
}
