# Spring parameters and playback scaling

Express physical springs with natural angular frequency (rad/s), damping ratio, and mass. Keep parameter conversion separate from playback speed.

```text
stiffness = mass * angularFrequency^2
damping = 2 * mass * angularFrequency * dampingRatio
angularFrequency = sqrt(stiffness / mass)
dampingRatio = damping / (2 * mass * angularFrequency)
```

## Decision and why

| Motion                                       | Frequency | Damping ratio |
| -------------------------------------------- | --------- | ------------- |
| Composer flight                              | 18        | 0.8           |
| Bottom catch-up                              | 15        | 1             |
| Flight destination compensation              | 22        | 1             |
| Typing exit visuals                          | 22        | 1             |
| Ordinary message and typing entrance visuals | 26        | 1             |
| Item/typing slots and composer space release | 28        | 1             |

Mass defaults to 1. Vertical flight progress uses the same generator sampled 100ms later than horizontal progress. These are tuned parameters, not duration guarantees; completion also depends on thresholds, distance, layout, and handoff.

Playback controls set animation speed, including active animations. On retarget or velocity handoff, convert wall-clock MotionValue velocity back to normal-speed generator units by dividing by playback speed once. Changing frequency for a new baseline changes stiffness quadratically and damping linearly at fixed damping ratio.

Reduced motion skips flights and entrances and completes layout transitions. Typing's three-dot CSS color cycle remains a separate 1.2s loop with fixed 0.2s phase offsets; playback controls do not slow it. It becomes static under reduced motion. Automatic-reply timers also remain in real time.

## Evidence

- Implementation: [bidirectional parameter conversion](../../../../../packages/utils/src/spring-parameters.ts).
- Current parameters: [flight and compensation](../../chat-send-flight/chat-send-flight.ts), [scrolling](../chat-scroll-controller.ts), [presence and layout](../chat-presence.ts), and [dot loop](../../message-bubble/typing-bubble.css).
- History: [0979bae](https://github.com/lennondotw/interaction-lab/commit/0979bae); later changes are reflected in the current implementation.
- Validation: [relevant checks](./verification.md#parameters).

[Architecture index](../README.md)
