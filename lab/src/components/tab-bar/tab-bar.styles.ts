// The same 15 / 20 / 40 alpha hierarchy as the time wheel picker's wireframe.
export const WIREFRAME_FRAME = 'outline-1 -outline-offset-1 outline-neutral-500/20';
export const WIREFRAME_ITEM = 'outline-1 -outline-offset-1 outline-neutral-500/15';
export const WIREFRAME_SELECTED = 'outline-1 -outline-offset-1 outline-neutral-500/40 outline-dashed';
export const WIREFRAME_CONTROL = 'outline-1 -outline-offset-1 outline-transparent';
// Keep strokes, separators and focus rings outside the content opacity layer.
export const WIREFRAME_FEEDBACK = 'group/tab-control data-focus-visible:outline-neutral-500/70';
// Pressed feedback currently matches hover; color itself stays fully opaque.
export const WIREFRAME_CONTENT = `opacity-70 group-data-hovered/tab-control:opacity-100
  group-data-pressed/tab-control:opacity-100`;
