import { describe, expect, it } from 'vitest';

import { createDemoReplyPlan, demoConversation } from '../chat-demo-replies.js';

describe('demo reply plans', () => {
  it('matches the coffee conversation despite capitalization and spacing', () => {
    expect(createDemoReplyPlan('  COFFEE   this afternoon?!  ')).toEqual(createDemoReplyPlan('Coffee this afternoon?'));
    expect(createDemoReplyPlan(demoConversation[1]!.input).replies).toEqual(
      createDemoReplyPlan('Coffee this afternoon?').replies
    );
    expect(createDemoReplyPlan('Coffee this afternoon?').replies).toEqual([
      'Yes, please.',
      'I could use a little break.',
      'There is a quiet place by the park with really good coffee.',
    ]);
  });

  it('keeps an unknown input reproducible regardless of intervening conversations', () => {
    const expected = { replies: ['I see what you mean.'], delays: [1172] };
    expect(createDemoReplyPlan('A small detour')).toEqual(expected);
    for (const entry of demoConversation) createDemoReplyPlan(entry.input);
    expect(createDemoReplyPlan(' a small detour! ')).toEqual(expected);
  });

  it('uses one fallback reply and bounded deterministic intervals', () => {
    for (const text of [...demoConversation.map((entry) => entry.input), 'Unscripted', 'Another thought']) {
      const plan = createDemoReplyPlan(text);
      expect(plan.delays).toHaveLength(plan.replies.length);
      expect(plan.delays.every((delay) => delay >= 800 && delay <= 1200)).toBe(true);
    }
    expect(createDemoReplyPlan('Unscripted').replies).toHaveLength(1);
    expect(createDemoReplyPlan('Another thought').replies).toHaveLength(1);
  });
});
