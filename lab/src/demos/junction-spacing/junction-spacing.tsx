import { cn, joinWithSpacing, needsSpaceBetween, segmentWithSpacing } from '@monorepo/utils';
import { type FC, type ReactNode } from 'react';

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

const Tinted: FC<{ tint: string; children: ReactNode; isolate?: boolean }> = ({ children, isolate, tint }) => (
  <span
    // Square, so a one-space highlight reads as the full width of the space it
    // marks. A radius on a 4px-wide box eats most of the box.
    className={tint}
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

const CaseCard: FC<{ spacingCase: SpacingCase; isolate: boolean }> = ({ isolate, spacingCase }) => {
  const { label, parts, rtl } = spacingCase;
  const texts = parts.map((part) => part.text);
  const segments = segmentWithSpacing(texts);

  const present = parts.filter((part) => part.text !== '');
  const splitCluster = present.some(
    (part, index) => index > 0 && splitsGraphemeCluster(present[index - 1]?.text ?? '', part.text)
  );

  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-white p-3 ring-1 ring-black/5 dark:bg-neutral-900 dark:ring-white/10">
      <p className="text-lg leading-relaxed whitespace-pre-wrap" dir={rtl === true ? 'rtl' : undefined}>
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
        <p
          className="text-lg leading-relaxed text-neutral-500 whitespace-pre-wrap"
          dir={rtl === true ? 'rtl' : undefined}
        >
          {joinWithSpacing(texts)}
          <span className="ms-2 align-middle text-xs">as one string, cluster intact</span>
        </p>
      )}
      <p className="text-xs text-neutral-500 dark:text-neutral-400">{label}</p>
    </div>
  );
};

export const JunctionSpacingLegend: FC = () => (
  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg bg-white px-4 py-3 ring-1 ring-black/5 dark:bg-neutral-900 dark:ring-white/10">
    <span className="text-sm font-semibold">Legend</span>
    {LEGEND.map(({ label, tint }) => (
      <span className="flex items-center gap-2 text-sm" key={label}>
        <span className={cn('size-4', tint)} />
        {label}
      </span>
    ))}
  </div>
);

export const JunctionSpacingBoard: FC<{ groups?: readonly SpacingGroup[]; isolateDynamic?: boolean }> = ({
  groups = SPACING_GROUPS,
  isolateDynamic = true,
}) => (
  <div className="mx-auto flex max-w-6xl flex-col gap-8 p-6">
    <JunctionSpacingLegend />
    {groups.map((group) => (
      <section className="flex flex-col gap-3" key={group.id}>
        {/* px-3 matches the cards' own padding, so the heading starts on the same
            vertical as the copy it describes rather than on the card edge. */}
        <header className="flex flex-col gap-1 px-3">
          <h2 className="text-sm font-semibold">{group.title}</h2>
          <p className="max-w-3xl text-xs text-neutral-500 dark:text-neutral-400">{group.blurb}</p>
        </header>
        <div className="grid gap-2 lg:grid-cols-2">
          {group.cases.map((spacingCase) => (
            <CaseCard isolate={isolateDynamic} key={spacingCase.label} spacingCase={spacingCase} />
          ))}
        </div>
      </section>
    ))}
  </div>
);

/**
 * One junction, asked directly — the smallest thing the board is made of.
 */
export const JunctionVerdicts: FC<{ pairs: readonly [string, string][] }> = ({ pairs }) => (
  <div className="mx-auto flex max-w-3xl flex-col gap-1 p-6">
    {pairs.map(([left, right]) => (
      <div
        className="flex items-baseline gap-3 rounded-lg bg-white px-3 py-2 ring-1 ring-black/5 dark:bg-neutral-900 dark:ring-white/10"
        key={left + right}
      >
        <code className="text-xs text-neutral-500 dark:text-neutral-400">
          {JSON.stringify(left)} + {JSON.stringify(right)}
        </code>
        <span className="text-lg whitespace-pre-wrap">
          <Tinted tint={TINT.clientBody}>{left}</Tinted>
          {needsSpaceBetween(left, right) && <Tinted tint={TINT.insertedSpace}> </Tinted>}
          <Tinted tint={TINT.dynamicBody}>{right}</Tinted>
        </span>
        <span className="ms-auto text-xs text-neutral-500 dark:text-neutral-400">
          {needsSpaceBetween(left, right) ? 'space' : 'flush'}
        </span>
      </div>
    ))}
  </div>
);
