# Scroll boundary event observations

These observations came from the local Storybook in the Codex in-app browser.
The controlled runs used browser automation scroll input, not a physical trackpad.
They do not establish how hardware momentum behaves after fingers leave a trackpad.

## Controlled run: already at the bottom

After preparing at the bottom and allowing setup to settle, two separate downward
scroll inputs produced the following captured events. No `scroll` event appeared
between them; the sampled `scrollTop` stayed at 3281.875px and the raw distance to
the bottom stayed at 0.125px.

| Event     | Handler time relative to recording start (ms) | Distance (px) |
| --------- | --------------------------------------------: | ------------: |
| wheel     |                                        6733.5 |         0.125 |
| scrollend |                                        6733.7 |         0.125 |
| wheel     |                                       17020.5 |         0.125 |
| scrollend |                                       17020.6 |         0.125 |

This confirms boundary input without a captured position-changing scroll in this
automated run. The later wheel was a separate injected input; it was not evidence
of inertia continuing after the earlier scrollend.

## Controlled run: starting above the bottom

The verified starting distance was 160.125px (`scrollTop = 3121.875px`). One downward
scroll input produced:

| Event     | Handler time relative to recording start (ms) | Sampled distance (px) |
| --------- | --------------------------------------------: | --------------------: |
| wheel     |                                        7641.6 |                 0.125 |
| scroll    |                                        7641.9 |                 0.125 |
| scrollend |                                        7642.0 |                 0.125 |

The first wheel handler already observed the final position. Consequently, the
instrument must describe its measurements as handler-time geometry, not as the
position before the browser applies a wheel's default action. A wheel sample at
the boundary alone does not establish whether the input started before or after
reaching the boundary.

## Still requiring a physical trial

Start above the bottom, flick downward, and lift fingers before reaching the end.
Wait without further input, then pause and export the log. Observe whether wheel
events continue at a stable boundary, and where scrollend occurs in that sequence.
Repeat from the bottom while deliberately continuing to swipe as a separate control.

Finger release and momentum phase are not identified by the logged standard wheel
fields. The operator's knowledge of when they released the trackpad is necessary;
`isTrusted` and wheel events after any earlier scrollend do not prove momentum.
