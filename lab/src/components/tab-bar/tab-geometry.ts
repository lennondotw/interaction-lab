export interface TabRect {
  left: number;
  width: number;
}

export interface TabGeometryInput {
  id: string;
  width: number;
  gap: number;
  closeCapacity: number;
  present: boolean;
}

export interface TabGeometry extends TabGeometryInput {
  rect: TabRect;
  title: TabRect;
  close: TabRect;
}

export interface TabStripGeometry {
  tabs: readonly TabGeometry[];
  add: TabRect;
  width: number;
}

/** Capacity may overflow during presence; only its painted intersection can be hit. */
export function tabGeometry(input: TabGeometryInput, left: number): TabGeometry {
  const titleWidth = Math.max(0, input.width - input.closeCapacity);
  return {
    ...input,
    rect: { left, width: input.width },
    title: { left, width: titleWidth },
    close: { left: left + titleWidth, width: Math.min(input.width, input.closeCapacity) },
  };
}

export function tabStripGeometry(
  inputs: readonly TabGeometryInput[],
  addWidth: number,
  addGap: number
): TabStripGeometry {
  let right = 0;
  const tabs = inputs.map((input) => {
    const tab = tabGeometry(input, right + input.gap);
    right = tab.rect.left + tab.rect.width;
    return tab;
  });
  const add = { left: right + addGap, width: addWidth };
  return { tabs, add, width: add.left + add.width };
}

export function sameTabStrip(a: TabStripGeometry | null, b: TabStripGeometry): boolean {
  return (
    a !== null &&
    a.add.left === b.add.left &&
    a.add.width === b.add.width &&
    a.tabs.length === b.tabs.length &&
    a.tabs.every((tab, index) => {
      const next = b.tabs[index]!;
      return (
        tab.id === next.id &&
        tab.rect.left === next.rect.left &&
        tab.width === next.width &&
        tab.gap === next.gap &&
        tab.closeCapacity === next.closeCapacity &&
        tab.present === next.present
      );
    })
  );
}

export type TabHit = { control: 'select' | 'close'; id: string } | { control: 'add' };

export function sameTabHit(a: TabHit | null, b: TabHit | null): boolean {
  return (
    a === b ||
    (a !== null &&
      b !== null &&
      a.control === b.control &&
      (a.control === 'add' || (b.control !== 'add' && a.id === b.id)))
  );
}

export function rectContains(rect: TabRect, x: number): boolean {
  return rect.width > 0 && x >= rect.left && x < rect.left + rect.width;
}

/** Final X wins cross-ID overlap; visible X wins over any title. Exits never own input. */
export function hitTabStrip(target: TabStripGeometry, presentation: TabStripGeometry, x: number): TabHit | null {
  const presentIds = new Set(target.tabs.map((tab) => tab.id));
  for (const strip of [target, presentation]) {
    const close = strip.tabs.find((tab) => tab.present && presentIds.has(tab.id) && rectContains(tab.close, x));
    if (close) return { control: 'close', id: close.id };
  }
  for (const strip of [target, presentation]) {
    if (rectContains(strip.add, x)) return { control: 'add' };
  }
  for (const strip of [target, presentation]) {
    const title = strip.tabs.find((tab) => tab.present && presentIds.has(tab.id) && rectContains(tab.title, x));
    if (title) return { control: 'select', id: title.id };
  }
  return null;
}

/** Visual feedback follows only the painted surface, independently of action priority. */
export function hitTabPresentation(target: TabStripGeometry, presentation: TabStripGeometry, x: number): TabHit | null {
  const presentIds = new Set(target.tabs.map((tab) => tab.id));
  const eligible = (tab: TabGeometry) => tab.present && presentIds.has(tab.id);
  const close = presentation.tabs.find((tab) => eligible(tab) && rectContains(tab.close, x));
  if (close) return { control: 'close', id: close.id };
  if (rectContains(presentation.add, x)) return { control: 'add' };
  const title = presentation.tabs.find((tab) => eligible(tab) && rectContains(tab.title, x));
  return title ? { control: 'select', id: title.id } : null;
}
