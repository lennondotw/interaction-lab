/** Scripted conversation for the Automatic Replies story; not a production responder. */
interface ScriptedConversation {
  input: string;
  aliases?: readonly string[];
  replies: readonly string[];
  status?: { beforeReply: number; label: string };
}

/**
 * Happy-path demo, in order:
 * 1. Send "Hey!". The first send inserts Today; the reply asks about your ideal afternoon.
 * 2. Paste this three-line answer (or type it with Shift+Enter):
 *    - Good coffee
 *    - A quiet table outside
 *    - A walk by the park afterward
 *    The composer grows before sending. Three replies follow, with "Looking up the cafe…"
 *    inserted between the second and third replies.
 * 3. Send "Where should we meet?" for the cafe location and outdoor-table suggestion.
 * 4. Send "What time?" for the 3pm plan and a walk afterward.
 * 5. Send "See you there!" to finish the conversation.
 *
 * Let each reply batch finish before the next step for the intended presentation.
 * Typing starts after 600ms and stops with the first reply; reply delays are 800–1200ms.
 * The 0.25× / 1× controls affect animation only. Content and delays are deterministic.
 * Both automatic-reply stories use these same presets and the same ChatDemo component.
 */
export const demoConversation: readonly ScriptedConversation[] = [
  { input: 'Hey!', replies: ['Hey! What would your ideal afternoon look like?'] },
  {
    input: `- Good coffee
- A quiet table outside
- A walk by the park afterward`,
    aliases: ['Coffee this afternoon?'],
    status: { beforeReply: 2, label: 'Looking up the cafe…' },
    replies: [
      'Yes, please.',
      'I could use a little break.',
      'There is a quiet place by the park with really good coffee.',
    ],
  },
  {
    input: 'Where should we meet?',
    replies: ['At the cafe on the corner of Oak Street.', 'I will grab us a table outside if the weather stays nice.'],
  },
  { input: 'What time?', replies: ['How about three?', 'That gives us time for a walk afterward.'] },
  { input: 'See you there!', replies: ['See you at three!'] },
] as const;

const fallbackReplies = [
  'Tell me more.',
  'I am listening.',
  'That sounds good to me.',
  'Let us figure it out together.',
  'I see what you mean.',
  'Take your time. There is no rush.',
] as const;

export interface DemoReplyPlan {
  replies: readonly string[];
  delays: readonly number[];
  status?: ScriptedConversation['status'];
}

function normalize(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/, '');
}

function hashText(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  }
  return hash >>> 0;
}

/** The same normalized input always produces the same replies and 800–1200ms delays. */
export function createDemoReplyPlan(input: string): DemoReplyPlan {
  const key = normalize(input);
  const preset = demoConversation.find(
    (entry) => normalize(entry.input) === key || entry.aliases?.some((alias) => normalize(alias) === key)
  );
  const replies = preset?.replies ?? [fallbackReplies[hashText(key) % fallbackReplies.length]!];
  return {
    replies,
    ...(preset?.status ? { status: preset.status } : {}),
    delays: replies.map((_, index) => 800 + (hashText(`${key}:${index}`) % 401)),
  };
}
