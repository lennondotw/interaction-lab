# Stories and instrumentation

The story exposes implicit layout state so motion decisions can be inspected. `size` and `space`
are presentation diagnostics, not additional state consumed by the production layout controller.

## Three independent dimensions

| Label                                 | Source                                          | Meaning                                               |
| ------------------------------------- | ----------------------------------------------- | ----------------------------------------------------- |
| `status: natural / holding / waiting` | Hover controller transitions                    | Pointer hold and release intent.                      |
| `size: natural / compressed`          | Final resolved widths versus CSS bases          | Whether any tab destination is smaller than its base. |
| `space: available / full`             | Final occupied width versus available row width | Whether the destination leaves usable room.           |

`holding` can be natural-size, compressed with available space, or compressed and full. `natural`
status can still be compressed because the ordinary flex destination must fit the container.
New-tab entrance at width zero does not automatically classify the destination as compressed.

## Classify destinations at the change

[useTabLayout](../use-tab-layout.ts) publishes resolved destinations as `data-tab-width-target` on
hidden placeholders, updating the attribute only when its value changes.
[useTabLayoutDisplay](../use-tab-layout-display.ts) reads those destinations, observes target-row
resize, and observes destination-attribute mutations. It does not sum visible animated widths.

For `n` logical tabs, destination occupancy is `sum(widths) + n * gap + addWidth`. A width more than
1 CSS px below its computed flex basis marks `compressed`; occupancy more than 1 px below available
width marks `available`. This tolerance absorbs fractional browser flex rounding. The empty list is
not compressed and can leave space around its add button.

Labels therefore reflect the new resolved layout during the commit/measurement cycle, without waiting
for springs to settle. They can change on resize or hold release because destinations changed, not
because a temporary footprint crossed a threshold. Overflow masks, in contrast, inspect current
visible title geometry because that is a presentation question.

The story reports waiting without a countdown. Status text and controls sit outside the hover region;
moving to them can legitimately trigger leave. They are not an extension of the holding rectangle.

## Speed controls and story composition

Default starts with three tabs, Compressed with eight, and Empty with zero. Resizable uses a width-only
window starting at 640 px with a 320 px minimum; HoverHolds reuses it with eight initial tabs. These
window dimensions include surrounding chrome/padding and are not the target row's available width.

Resizable and HoverHolds show the same Segmented control pattern as the Chat container: 0.1×, 0.25×,
0.5×, and 1.0×. `useArgs()` keeps that control, Storybook Controls, and URL args synchronized. All stories
also expose the public speed prop through a select control. Changing speed preserves tab IDs, current
selection, and active animation resources; changing `initialCount` deliberately changes the demo key
and resets it. The initial-count control ranges from zero through twelve; that is not a runtime cap.

The demo host uses sequential IDs, selects a new tab, and selects the following survivor when the
active tab closes, or the preceding survivor when closing the tail. These are host policies illustrated
by [the stories](../tab-bar.stories.tsx), not state hidden inside TabBar.

Verification: [target-width tests](../__tests__/tab-target-layout.test.ts) protect held compressed
additions with spare space and natural-size additions. Label timing, speed-control synchronization,
and demo state preservation are browser checks in the [verification guide](./verification.md).

[Architecture index](../README.md)
