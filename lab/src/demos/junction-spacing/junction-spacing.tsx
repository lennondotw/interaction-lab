import { cn, joinWithSpacing, needsSpaceBetween, segmentWithSpacing, type SpacedSegment } from '@monorepo/utils';
import { createContext, useContext, type FC, type ReactNode } from 'react';

import { SPACING_GROUPS, type SpacingCase, type SpacingGroup, type SpacingPart } from './junction-spacing-cases.js';

/*
 * The anatomy of an interpolation, one card per case: which spans came from the
 * copy, which came from the server, which spaces the copy already carried, and
 * which single spaces junction-spacing put in.
 *
 * The distinction the colours are for is the one that is invisible in the
 * result: `和 Lime 聊聊` looks the same whether the copy was written `和 ` with
 * its own space or whether the space was inserted, and the two are different
 * bugs when one of them is wrong.
 */

/*
 * Two tints per side, the boundary-space one stronger than the content one, and
 * both lifted in dark mode — at the light-mode alphas the content tints read as
 * a smudge on a dark surface rather than as a fill.
 */
const TINT = {
  clientBody: 'bg-sky-500/15 dark:bg-sky-400/25',
  clientSpace: 'bg-sky-500/55 dark:bg-sky-400/70',
  dynamicBody: 'bg-amber-400/25 dark:bg-amber-300/30',
  dynamicSpace: 'bg-amber-400/75 dark:bg-amber-300/80',
  insertedSpace: 'bg-fuchsia-400/60 dark:bg-fuchsia-400/75',
} as const;

const LEGEND: readonly { tint: string; label: string }[] = [
  { label: 'Client content', tint: TINT.clientBody },
  { label: 'Client-side boundary space', tint: TINT.clientSpace },
  { label: 'Dynamic content', tint: TINT.dynamicBody },
  { label: 'Dynamic-side boundary space', tint: TINT.dynamicSpace },
  { label: 'Inserted space', tint: TINT.insertedSpace },
];

/*
 * Whitespace at the edge of a part belongs to whoever wrote that part, so it is
 * tinted as that side's boundary space rather than as its content. `\s` covers
 * the no-break space, which junction-spacing also reads as a settled boundary.
 */
const EDGE_WHITESPACE = /^(\s*)([\s\S]*?)(\s*)$/u;

const GRAPHEME_SEGMENTER = new Intl.Segmenter('en', { granularity: 'grapheme' });

/*
 * True where the two runs meet inside one grapheme cluster. Two things follow
 * from it, and the card shows both: junction-spacing refuses to insert a space
 * there, and highlighting the parts separately has already split the cluster
 * across two elements, so the glyph in the anatomy line is broken in a way the
 * joined string is not.
 */
function splitsGraphemeCluster(left: string, right: string): boolean {
  if (!left || !right) {
    return false;
  }
  for (const { index } of GRAPHEME_SEGMENTER.segment(left + right)) {
    if (index === left.length) {
      return false;
    }
  }
  return true;
}

function splitEdgeWhitespace(text: string): { lead: string; body: string; trail: string } {
  const match = EDGE_WHITESPACE.exec(text);
  return { body: match?.[2] ?? text, lead: match?.[1] ?? '', trail: match?.[3] ?? '' };
}

/*
 * The two switches are orthogonal on purpose. Disabling the highlight is a
 * question about this board — does the anatomy read as ordinary copy once the
 * tints are off. Disabling the spacing is a question about the copy — what a
 * reader gets without the feature. All four combinations are worth looking at,
 * so neither implies the other.
 *
 * Both are named for the disabled state, matching the switches, so a reader
 * never has to invert a flag in their head between the control and its effect.
 */
const DisableTextHighlightContext = createContext(false);

const Tinted: FC<{ tint: string; children: ReactNode; isolate?: boolean }> = ({ children, isolate, tint }) => (
  <span
    // Square, so a one-space highlight reads as the full width of the space it
    // marks. A radius on a 4px-wide box eats most of the box.
    className={useContext(DisableTextHighlightContext) ? undefined : tint}
    // Bidi is the renderer's half of the job: an isolated run is one visual run,
    // so its logically-last character is also the one the space sits next to.
    dir={isolate === true ? 'auto' : undefined}
    style={isolate === true ? { unicodeBidi: 'isolate' } : undefined}
  >
    {children}
  </span>
);

const PartSpans: FC<{ part: SpacingPart; isolate: boolean }> = ({ isolate, part }) => {
  const { body, lead, trail } = splitEdgeWhitespace(part.text);
  const bodyTint = part.role === 'client' ? TINT.clientBody : TINT.dynamicBody;
  const spaceTint = part.role === 'client' ? TINT.clientSpace : TINT.dynamicSpace;

  return (
    <>
      {lead !== '' && <Tinted tint={spaceTint}>{lead}</Tinted>}
      {body !== '' && (
        <Tinted isolate={isolate && part.role === 'dynamic'} tint={bodyTint}>
          {body}
        </Tinted>
      )}
      {trail !== '' && <Tinted tint={spaceTint}>{trail}</Tinted>}
    </>
  );
};

/*
 * One shell for every view here. Both boards had their own copy of these and
 * drifted apart on width, columns and padding, which read as two unrelated
 * demos.
 */
const PAGE = 'mx-auto flex max-w-6xl flex-col gap-8 p-6';
const GRID = 'grid gap-2 lg:grid-cols-2';
const CARD = 'flex flex-col gap-1.5 rounded-lg bg-white p-3 ring-1 ring-black/5 dark:bg-neutral-900 dark:ring-white/10';
const SAMPLE = 'text-lg leading-relaxed whitespace-pre-wrap';
const CAPTION = 'text-xs text-neutral-500 dark:text-neutral-400';

const CaseCard: FC<{ spacingCase: SpacingCase; isolate: boolean; disableJunctionSpacing: boolean }> = ({
  disableJunctionSpacing,
  isolate,
  spacingCase,
}) => {
  const { label, parts, rtl } = spacingCase;
  const texts = parts.map((part) => part.text);
  const segments: readonly SpacedSegment[] = disableJunctionSpacing
    ? parts.flatMap((part, partIndex) =>
        part.text === '' ? [] : [{ partIndex, text: part.text, type: 'part' } as const]
      )
    : segmentWithSpacing(texts);

  const present = parts.filter((part) => part.text !== '');
  const splitCluster = present.some(
    (part, index) => index > 0 && splitsGraphemeCluster(present[index - 1]?.text ?? '', part.text)
  );

  return (
    <div className={CARD}>
      <p className={SAMPLE} dir={rtl === true ? 'rtl' : undefined}>
        {segments.map((segment, index) =>
          segment.type === 'space' ? (
            <Tinted key={index} tint={TINT.insertedSpace}>
              {segment.text}
            </Tinted>
          ) : (
            <PartSpans key={index} isolate={isolate} part={parts[segment.partIndex] ?? { role: 'client', text: '' }} />
          )
        )}
      </p>
      {splitCluster && (
        <p className={cn(SAMPLE, 'text-neutral-500')} dir={rtl === true ? 'rtl' : undefined}>
          {disableJunctionSpacing ? texts.join('') : joinWithSpacing(texts)}
          <span className="ms-2 align-middle text-xs">as one string, cluster intact</span>
        </p>
      )}
      <p className={CAPTION}>{label}</p>
    </div>
  );
};

const BUTTON_CLASS = `
  cursor-pointer rounded-[4px] border border-black/20 bg-white/0 px-3 py-1.5 font-mono text-[12px] text-black/70
  hover:bg-black/5
  active:bg-black/10
  dark:border-white/30 dark:text-white/80 dark:hover:bg-white/5 dark:active:bg-white/10
`;

/*
 * Both labels stay in the DOM so the button sizes to the wider of the two and
 * does not resize on toggle, which would shove the button beside it sideways
 * mid-click. `visibility: hidden` rather than `display: none` because only the
 * former keeps the box in flow to be measured; `h-0` and `leading-0` keep it
 * from contributing height. Same construction as the beacon stories'
 * ToggleButton, and for the same reason.
 */
const HIDDEN_LABELS_CLASS = 'invisible flex h-0 flex-col overflow-clip leading-0';

const ToggleButton: FC<{ on: boolean; onLabel: string; offLabel: string; onToggle: () => void }> = ({
  offLabel,
  on,
  onLabel,
  onToggle,
}) => (
  <button aria-pressed={on} className={BUTTON_CLASS} onClick={onToggle} type="button">
    {on ? onLabel : offLabel}
    <span className={HIDDEN_LABELS_CLASS}>
      <span>{onLabel}</span>
      <span>{offLabel}</span>
    </span>
  </button>
);

export interface JunctionSpacingOptions {
  /** Paint the tints, or leave the copy as a reader would see it. */
  disableTextHighlight: boolean;
  /** Insert the junction spaces, or show what the copy reads like without them. */
  disableJunctionSpacing: boolean;
}

/*
 * The switches are controlled rather than local state, so the in-page buttons
 * and Storybook's own controls are the same two values and cannot disagree: the
 * story owns them and updates its args, the args come back down as props.
 */
const BoardShell: FC<{
  options: JunctionSpacingOptions;
  onOptionsChange?: (patch: Partial<JunctionSpacingOptions>) => void;
  children: ReactNode;
}> = ({ children, onOptionsChange, options }) => (
  <DisableTextHighlightContext value={options.disableTextHighlight}>
    <div className={PAGE}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg bg-white px-4 py-3 ring-1 ring-black/5 dark:bg-neutral-900 dark:ring-white/10">
        <span className="text-sm font-semibold">Legend</span>
        {LEGEND.map(({ label, tint }) => (
          <span className="flex items-center gap-2 text-sm" key={label}>
            <span className={cn('size-4', tint)} />
            {label}
          </span>
        ))}
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <ToggleButton
            offLabel="disable · text highlight"
            on={options.disableTextHighlight}
            onLabel="enable · text highlight"
            onToggle={() => onOptionsChange?.({ disableTextHighlight: !options.disableTextHighlight })}
          />
          <ToggleButton
            offLabel="disable · junction spacing"
            on={options.disableJunctionSpacing}
            onLabel="enable · junction spacing"
            onToggle={() => onOptionsChange?.({ disableJunctionSpacing: !options.disableJunctionSpacing })}
          />
        </div>
      </div>
      {children}
    </div>
  </DisableTextHighlightContext>
);

export const JunctionSpacingBoard: FC<
  JunctionSpacingOptions & {
    groups?: readonly SpacingGroup[];
    isolateDynamic?: boolean;
    onOptionsChange?: (patch: Partial<JunctionSpacingOptions>) => void;
  }
> = ({
  disableJunctionSpacing,
  disableTextHighlight,
  groups = SPACING_GROUPS,
  isolateDynamic = true,
  onOptionsChange,
}) => (
  <BoardShell onOptionsChange={onOptionsChange} options={{ disableJunctionSpacing, disableTextHighlight }}>
    {groups.map((group) => (
      <section className="flex flex-col gap-3" key={group.id}>
        {/* px-3 matches the cards' own padding, so the heading starts on the same
            vertical as the copy it describes rather than on the card edge. */}
        <header className="flex flex-col gap-1 px-3">
          <h2 className="text-sm font-semibold">{group.title}</h2>
          <p className={cn(CAPTION, 'max-w-3xl')}>{group.blurb}</p>
        </header>
        <div className={GRID}>
          {group.cases.map((spacingCase) => (
            <CaseCard
              disableJunctionSpacing={disableJunctionSpacing}
              isolate={isolateDynamic}
              key={spacingCase.label}
              spacingCase={spacingCase}
            />
          ))}
        </div>
      </section>
    ))}
  </BoardShell>
);

/**
 * One junction, asked directly — the smallest thing the board is made of. Same
 * shell as the board, so the two read as one demo: the sample on the first line,
 * and the caption saying what was asked and what came back.
 */
export const JunctionVerdicts: FC<
  JunctionSpacingOptions & {
    pairs: readonly [string, string][];
    onOptionsChange?: (patch: Partial<JunctionSpacingOptions>) => void;
  }
> = ({ disableJunctionSpacing, disableTextHighlight, onOptionsChange, pairs }) => (
  <BoardShell onOptionsChange={onOptionsChange} options={{ disableJunctionSpacing, disableTextHighlight }}>
    <div className={GRID}>
      {pairs.map(([left, right]) => {
        const spaced = needsSpaceBetween(left, right);

        return (
          <div className={CARD} key={left + right}>
            <p className={SAMPLE}>
              <Tinted tint={TINT.clientBody}>{left}</Tinted>
              {spaced && !disableJunctionSpacing && <Tinted tint={TINT.insertedSpace}> </Tinted>}
              <Tinted tint={TINT.dynamicBody}>{right}</Tinted>
            </p>
            <p className={CAPTION}>
              <code>
                {JSON.stringify(left)} + {JSON.stringify(right)}
              </code>{' '}
              → {spaced ? 'space' : 'flush'}
              {spaced && disableJunctionSpacing && ', not applied'}
            </p>
          </div>
        );
      })}
    </div>
  </BoardShell>
);
