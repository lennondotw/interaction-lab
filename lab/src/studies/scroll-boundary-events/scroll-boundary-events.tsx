import { Fragment, useEffect, useRef, useState } from 'react';

import { Button } from '../../components/button/index.js';

interface Sample {
  sequence: number;
  time: number;
  type: string;
  scrollTop: number;
  distance: number;
  deltaY: number | null;
  deltaMode: number | null;
  ctrlKey: boolean;
  trusted: boolean;
  sinceScrollEnd: number | null;
}

interface Recording {
  samples: Sample[];
  total: number;
  wheelAtBottom: number;
  wheelAfterScrollEnd: number;
}

const emptyRecording = (): Recording => ({
  samples: [],
  total: 0,
  wheelAtBottom: 0,
  wheelAfterScrollEnd: 0,
});

const MAX_SAMPLES = 500;
const VISIBLE_SAMPLES = 40;
const BOTTOM_EPSILON = 1;

export function ScrollBoundaryEvents({ threshold = 20 }: { threshold?: number }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const recordingRef = useRef(emptyRecording());
  const activeRef = useRef(false);
  const startedAtRef = useRef(0);
  const lastScrollEndRef = useRef<number | null>(null);
  const publishFrameRef = useRef<number | null>(null);
  const prepareFrameRef = useRef<number | null>(null);
  const [recording, setRecording] = useState(emptyRecording);
  const [active, setActive] = useState(false);
  const [supportsScrollEnd, setSupportsScrollEnd] = useState(false);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    setSupportsScrollEnd('onscrollend' in viewport);

    function capture(event: Event) {
      if (!activeRef.current || !viewport) return;
      const now = performance.now();
      const wheel = event instanceof WheelEvent ? event : null;
      const distance = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop;
      const current = recordingRef.current;
      const sample: Sample = {
        sequence: current.total + 1,
        time: now - startedAtRef.current,
        type: event.type,
        scrollTop: viewport.scrollTop,
        distance,
        deltaY: wheel?.deltaY ?? null,
        deltaMode: wheel?.deltaMode ?? null,
        ctrlKey: wheel?.ctrlKey ?? false,
        trusted: event.isTrusted,
        sinceScrollEnd: lastScrollEndRef.current === null ? null : now - lastScrollEndRef.current,
      };
      if (event.type === 'scrollend') lastScrollEndRef.current = now;
      // Keep raw boundary distance (including elastic overscroll). This is handler-time
      // geometry: asynchronous scrolling may already be applied before a passive listener runs.
      recordingRef.current = {
        samples: [...current.samples.slice(-(MAX_SAMPLES - 1)), sample],
        total: sample.sequence,
        wheelAtBottom:
          current.wheelAtBottom + (wheel && !wheel.ctrlKey && Math.abs(distance) <= BOTTOM_EPSILON ? 1 : 0),
        wheelAfterScrollEnd:
          current.wheelAfterScrollEnd + (wheel && !wheel.ctrlKey && sample.sinceScrollEnd !== null ? 1 : 0),
      };
      // Capture every event, but publish the log at most once per animation frame.
      if (publishFrameRef.current === null) {
        publishFrameRef.current = requestAnimationFrame(() => {
          publishFrameRef.current = null;
          setRecording(recordingRef.current);
        });
      }
    }

    const eventTypes = [
      'wheel',
      'scroll',
      'scrollend',
      'pointerdown',
      'pointerup',
      'pointercancel',
      'keydown',
      'keyup',
    ];
    for (const type of eventTypes) viewport.addEventListener(type, capture, { passive: true });
    return () => {
      for (const type of eventTypes) viewport.removeEventListener(type, capture);
      if (publishFrameRef.current !== null) cancelAnimationFrame(publishFrameRef.current);
      if (prepareFrameRef.current !== null) cancelAnimationFrame(prepareFrameRef.current);
      publishFrameRef.current = null;
      prepareFrameRef.current = null;
    };
  }, []);

  function prepare(distance: number) {
    const viewport = viewportRef.current;
    if (!viewport) return;
    activeRef.current = false;
    setActive(false);
    if (prepareFrameRef.current !== null) cancelAnimationFrame(prepareFrameRef.current);
    if (publishFrameRef.current !== null) cancelAnimationFrame(publishFrameRef.current);
    publishFrameRef.current = null;
    recordingRef.current = emptyRecording();
    setRecording(recordingRef.current);
    lastScrollEndRef.current = null;
    viewport.scrollTo({
      top: Math.max(0, viewport.scrollHeight - viewport.clientHeight - distance),
      behavior: 'instant',
    });
    // Let setup scrolling settle before capturing the physical gesture.
    prepareFrameRef.current = requestAnimationFrame(() => {
      prepareFrameRef.current = requestAnimationFrame(() => {
        prepareFrameRef.current = null;
        startedAtRef.current = performance.now();
        activeRef.current = true;
        setActive(true);
      });
    });
  }

  function pause() {
    if (prepareFrameRef.current !== null) cancelAnimationFrame(prepareFrameRef.current);
    prepareFrameRef.current = null;
    activeRef.current = false;
    setActive(false);
    setRecording(recordingRef.current);
  }

  function download() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            userAgent: navigator.userAgent,
            supportsScrollEnd,
            threshold,
            bottomEpsilon: BOTTOM_EPSILON,
            ...recordingRef.current,
          },
          null,
          2
        ),
      ],
      { type: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'scroll-boundary-events.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const latest = recording.samples.at(-1);

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="flex w-full max-w-5xl flex-col gap-4 text-sm">
        <h1 className="text-lg font-semibold">Do wheel events continue at the bottom?</h1>
        <p className="max-w-3xl text-neutral-500 dark:text-neutral-400">
          Start above the bottom, flick down with a real trackpad, then lift your fingers before reaching the end. Wait
          for motion to settle, pause, and inspect the log. Repeat from the bottom while continuing to swipe.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => prepare(160)}>Start 160px above bottom</Button>
          <Button onClick={() => prepare(0)}>Start at bottom</Button>
          <Button onClick={pause} disabled={!active}>
            Pause recording
          </Button>
          <Button onClick={download} disabled={recording.total === 0}>
            Download JSON
          </Button>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs">
          <span>
            {active ? 'Recording' : 'Paused'} · {recording.total} events
          </span>
          <span>Wheel sampled at bottom (±1px): {recording.wheelAtBottom}</span>
          <span>Wheel after any scrollend: {recording.wheelAfterScrollEnd}</span>
          <span>scrollend supported: {String(supportsScrollEnd)}</span>
          <span>Distance: {latest ? `${latest.distance.toFixed(2)}px` : '—'}</span>
          <span>
            Within {threshold}px: {latest ? String(latest.distance <= threshold) : '—'}
          </span>
        </div>
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          <div className="h-80 min-w-0 overflow-clip rounded-lg border border-black/10 bg-white dark:border-white/15 dark:bg-[#1E1E1E]">
            <div
              ref={viewportRef}
              data-slot="boundary-event-viewport"
              // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- The native scroller needs keyboard access.
              tabIndex={0}
              aria-label="Native scroll test"
              className="size-full overflow-y-auto scheme-light [overflow-anchor:none] dark:scheme-dark"
            >
              <ol className="m-0 flex list-none flex-col gap-3 p-4">
                {Array.from({ length: 80 }, (_, index) => (
                  <Fragment key={index}>
                    {index > 0 && <li aria-hidden="true" className="h-px shrink-0 bg-neutral-500/15" />}
                    <li>{index === 79 ? 'End of list' : `Row ${index + 1} — A little room for a thought.`}</li>
                  </Fragment>
                ))}
              </ol>
            </div>
          </div>
          <div className="h-80 min-w-0 overflow-auto rounded-lg border border-neutral-500/20 focus-visible:outline-solid focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-neutral-400/50">
            <table className="w-full text-left font-mono text-xs whitespace-nowrap">
              <caption className="p-2 text-left">
                Latest {VISIBLE_SAMPLES} events, newest first. Export retains the latest {MAX_SAMPLES}.
              </caption>
              <thead>
                <tr>
                  {['#', 'ms', 'Event', 'ΔY / mode', 'Top', 'Distance', 'After end ms'].map((label) => (
                    <th key={label} className="px-2 py-1 font-medium">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recording.samples
                  .slice(-VISIBLE_SAMPLES)
                  .reverse()
                  .map((sample) => (
                    <tr
                      key={sample.sequence}
                      className={
                        sample.type === 'wheel' && Math.abs(sample.distance) <= BOTTOM_EPSILON ? 'bg-amber-400/15' : ''
                      }
                    >
                      <td className="px-2 py-1">{sample.sequence}</td>
                      <td className="px-2 py-1">{sample.time.toFixed(1)}</td>
                      <td className="px-2 py-1">
                        {sample.type}
                        {sample.ctrlKey ? ' (zoom)' : ''}
                        {!sample.trusted ? ' (untrusted)' : ''}
                      </td>
                      <td className="px-2 py-1">
                        {sample.deltaY === null ? '—' : `${sample.deltaY.toFixed(2)} / ${sample.deltaMode}`}
                      </td>
                      <td className="px-2 py-1">{sample.scrollTop.toFixed(2)}</td>
                      <td className="px-2 py-1">{sample.distance.toFixed(2)}</td>
                      <td className="px-2 py-1">{sample.sinceScrollEnd?.toFixed(1) ?? '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Amber marks wheel handlers sampling the bottom; scrolling may already be applied before the handler runs.
          Delta mode: 0 = pixels, 1 = lines, 2 = pages. Browser events do not identify trackpad finger release or
          inertia; trusted events alone do not prove physical input. This study observes native scrolling and does not
          prevent input or follow the bottom.
        </p>
      </div>
    </div>
  );
}
