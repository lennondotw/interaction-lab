# Automatic reply demonstration

The `Automatic Replies` story keeps only the composer and 0.25× / 1× animation controls.
`Automatic Replies With Guide` reuses the same `ChatDemo` and adds the happy-path inputs, expected
replies, and label cues alongside it (below it on narrow screens). The guide reads `demoConversation`
directly; the complete presenter walkthrough is also recorded in that preset's code comment. Try this
conversation in order: `Hey!`, `Coffee this afternoon?`, `Where should we meet?`, `What time?`,
and `See you there!`. Each preset returns one to three related messages. The first send inserts a
`Today` date item before the outgoing message. The coffee preset inserts a status item halfway
between its second and third replies. Labels remain in the timeline. These insertion rules belong
to the story; the list provides the reusable types, rendering, spacing, and animation.

For a taller composer, replace the short coffee invitation with this bulleted preset (paste it,
or use Shift+Enter for line breaks). Both versions match the same conversation:

```text
- Good coffee
- A quiet table outside
- A walk by the park afterward
```

Matching ignores capitalization, repeated whitespace, and final `.`, `!`, or `?` characters.
Unmatched input selects exactly one fallback using a stable text hash. The same normalized input
also produces the same 800–1200ms reply delays, including the wait after typing starts. Typing begins
after 600ms and stops with the first reply; it does not reappear between replies in that batch.
Playback controls affect motion only. Rapid sends queue complete reply plans in submission order,
and leaving the story cancels the timer. Presets and hashing live in `chat-demo-replies.ts`.

Implementation: [reply plans](../chat-demo-replies.ts) and [story composition](../chat-scroll-container.stories.tsx).

[Architecture index](../README.md) · [Verification guide](./verification.md)
