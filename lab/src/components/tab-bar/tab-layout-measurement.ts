export function readTabLayoutConstraints(layout: HTMLDivElement) {
  const gap = parseFloat(getComputedStyle(layout).columnGap);
  const basis = parseFloat(getComputedStyle(layout.firstElementChild!).flexBasis);
  return { gap, basis };
}

export function readTabTargets(layout: HTMLDivElement) {
  const gap = parseFloat(getComputedStyle(layout).columnGap);
  // This independent flex row already contains the FINAL tab count. Read every
  // target before starting any spring; animated widths cannot feed back into sizing.
  const add = layout.querySelector<HTMLElement>('[data-tab-add-target]')!;
  const close = layout.querySelector<HTMLElement>('[data-tab-close-basis]')!;
  const targets = Array.from(layout.querySelectorAll('[data-tab-target]')).map((element, index) => ({
    element,
    id: element.getAttribute('data-tab-target')!,
    width: parseFloat(getComputedStyle(element).width),
    gap: index === 0 ? 0 : gap,
  }));
  return {
    width: layout.getBoundingClientRect().width,
    gap,
    targets,
    addWidth: parseFloat(getComputedStyle(add).width),
    closeBasis: parseFloat(getComputedStyle(close).flexBasis),
  };
}
