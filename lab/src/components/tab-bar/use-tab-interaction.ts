import { cancelFrame, frame, type MotionValue } from 'motion/react';
import { useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent } from 'react';

import type { TabBarProps, TabFootprint } from './tab-bar.types.js';
import {
  hitTabPresentation,
  hitTabStrip,
  sameTabHit,
  tabStripGeometry,
  type TabHit,
  type TabStripGeometry,
} from './tab-geometry.js';
import type { createTabHoverHold } from './tab-hover-hold.js';
import type { TabInteractionState } from './tab-interaction-context.js';

interface TabInteractionOptions extends Pick<TabBarProps, 'tabs' | 'onSelect' | 'onAdd'> {
  target: TabStripGeometry | null;
  footprints: Map<string, TabFootprint>;
  addGap: MotionValue<number>;
  hoverHold: ReturnType<typeof createTabHoverHold>;
  onClose: (id: string) => void;
}

function buttonHit(button: HTMLButtonElement): TabHit {
  const control = button.dataset.tabAction! as TabHit['control'];
  return control === 'add' ? { control } : { control, id: button.dataset.tabOwner! };
}

export function useTabInteraction({
  tabs,
  target,
  footprints,
  addGap,
  hoverHold,
  onSelect,
  onClose,
  onAdd,
}: TabInteractionOptions) {
  const regionRef = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const inside = useRef(false);
  const press = useRef<{
    hit: TabHit;
    feedback: TabHit | null;
    point: { x: number; y: number };
    pointerId: number;
  } | null>(null);
  const pointerFocus = useRef(false);
  const [state, setState] = useState<TabInteractionState>({ hovered: null, pressed: null, focused: null });

  const presentation = () => {
    const ids = Array.from(regionRef.current!.querySelectorAll<HTMLElement>('[data-tab-id]')).map(
      (element) => element.dataset.tabId!
    );
    return tabStripGeometry(
      ids.map((id) => footprints.get(id)!.read()),
      target!.add.width,
      addGap.get()
    );
  };
  const eligible = (hit: TabHit) => hit.control === 'add' || tabs.some((tab) => tab.id === hit.id);
  const activate = (hit: TabHit) => {
    if (!eligible(hit)) return; // An exit still paints, but no longer owns an action.
    if (hit.control === 'add') onAdd();
    else if (hit.control === 'close') onClose(hit.id);
    else onSelect(hit.id);
  };
  const hitAt = (x: number, y: number) => {
    if (target === null) return null;
    const rect = regionRef.current!.getBoundingClientRect();
    if (y < rect.top || y >= rect.bottom) return null;
    return hitTabStrip(target, presentation(), x - rect.left);
  };
  const visualHitAt = (visual: TabStripGeometry, x: number, y: number) => {
    const rect = regionRef.current!.getBoundingClientRect();
    return y >= rect.top && y < rect.bottom ? hitTabPresentation(target!, visual, x - rect.left) : null;
  };
  const refresh = () => {
    if (target === null) return;
    const visual = presentation();
    const width = Math.max(target.width, visual.width);
    // Before-paint layout and Motion's frame sample share the same numeric envelope.
    regionRef.current!.style.width = `${width}px`;
    let hovered: TabHit | null = null;
    if (pointer.current !== null) {
      const rect = regionRef.current!.getBoundingClientRect();
      const x = pointer.current.x - rect.left;
      const nextInside = x >= 0 && x < width && pointer.current.y >= rect.top && pointer.current.y < rect.bottom;
      if (nextInside !== inside.current) {
        inside.current = nextInside;
        if (nextInside) hoverHold.enter();
        else hoverHold.leave();
      }
      if (nextInside) hovered = hitTabPresentation(target, visual, x);
    }
    const pending = press.current;
    const visualPress =
      pending !== null && sameTabHit(pending.feedback, visualHitAt(visual, pending.point.x, pending.point.y))
        ? pending.feedback
        : null;
    setState((previous) => {
      const pressed =
        pending !== null
          ? visualPress
          : previous.pressed !== null && eligible(previous.pressed)
            ? previous.pressed
            : null;
      const focused = previous.focused !== null && eligible(previous.focused.hit) ? previous.focused : null;
      return sameTabHit(previous.hovered, hovered) &&
        sameTabHit(previous.pressed, pressed) &&
        previous.focused === focused
        ? previous
        : { hovered, pressed, focused };
    });
  };

  useLayoutEffect(() => {
    const schedule = () => frame.preRender(refresh);
    const subscriptions = [...footprints.values()].map((footprint) => footprint.subscribe(schedule));
    subscriptions.push(addGap.on('change', schedule));
    const move = (event: globalThis.PointerEvent) => {
      if (press.current?.pointerId === event.pointerId) {
        press.current.point = { x: event.clientX, y: event.clientY };
      }
      if (event.pointerType !== 'touch') pointer.current = { x: event.clientX, y: event.clientY };
      else if (press.current === null) return;
      refresh();
    };
    const leaveWindow = (event: globalThis.PointerEvent) => {
      if (event.relatedTarget !== null || event.pointerType === 'touch') return;
      pointer.current = null;
      if (inside.current) {
        inside.current = false;
        hoverHold.leave();
      }
      setState((previous) => (previous.hovered === null ? previous : { ...previous, hovered: null }));
    };
    const blur = () => {
      press.current = null;
      setState((previous) => ({ ...previous, pressed: null, focused: null }));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerout', leaveWindow);
    window.addEventListener('blur', blur);
    refresh();
    return () => {
      subscriptions.forEach((unsubscribe) => unsubscribe());
      cancelFrame(refresh);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerout', leaveWindow);
      window.removeEventListener('blur', blur);
    };
  });

  const focusButton = (hit: TabHit) => {
    const buttons = Array.from(regionRef.current!.querySelectorAll<HTMLButtonElement>('[data-tab-action]'));
    const button = buttons.find((candidate) => sameTabHit(buttonHit(candidate), hit))!;
    pointerFocus.current = true;
    button.focus({ preventScroll: true });
    pointerFocus.current = false;
    setState((previous) => ({ ...previous, focused: { hit, visible: false } }));
  };
  const cancelPress = () => {
    press.current = null;
    setState((previous) => (previous.pressed === null ? previous : { ...previous, pressed: null }));
  };

  return {
    regionRef,
    state,
    activate,
    handlers: {
      onPointerEnter(event: PointerEvent<HTMLDivElement>) {
        if (event.pointerType === 'touch') return;
        pointer.current = { x: event.clientX, y: event.clientY };
        refresh();
      },
      onPointerDownCapture(event: PointerEvent<HTMLDivElement>) {
        if (event.button !== 0 || !event.isPrimary || press.current !== null) return;
        const hit = hitAt(event.clientX, event.clientY);
        if (hit === null) return;
        event.preventDefault();
        focusButton(hit);
        const feedback = visualHitAt(presentation(), event.clientX, event.clientY);
        press.current = { hit, feedback, point: { x: event.clientX, y: event.clientY }, pointerId: event.pointerId };
        setState((previous) => ({ ...previous, pressed: feedback }));
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerUp(event: PointerEvent<HTMLDivElement>) {
        const pending = press.current;
        if (pending === null || pending.pointerId !== event.pointerId) return;
        const hit = hitAt(event.clientX, event.clientY);
        cancelPress();
        if (sameTabHit(pending.hit, hit)) activate(pending.hit);
      },
      onPointerCancel: cancelPress,
      onLostPointerCapture: cancelPress,
      onFocusCapture(event: FocusEvent<HTMLDivElement>) {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-tab-action]');
        if (button === null) return;
        setState((previous) => ({
          ...previous,
          focused: { hit: buttonHit(button), visible: !pointerFocus.current && button.matches(':focus-visible') },
        }));
      },
      onBlurCapture() {
        setState((previous) => (previous.focused === null ? previous : { ...previous, focused: null }));
      },
      onKeyDownCapture(event: KeyboardEvent<HTMLDivElement>) {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-tab-action]');
        if (button === null) return;
        const hit = buttonHit(button);
        setState((previous) => ({
          ...previous,
          focused: { hit, visible: true },
          pressed: event.key === ' ' || event.key === 'Enter' ? hit : previous.pressed,
        }));
      },
      onKeyUpCapture(event: KeyboardEvent<HTMLDivElement>) {
        if (event.key === ' ' || event.key === 'Enter') cancelPress();
      },
    },
  };
}
