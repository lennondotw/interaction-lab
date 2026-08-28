import { Pane } from 'tweakpane';

const container = document.createElement('div');
container.style.position = 'fixed';
container.style.bottom = '8px';
container.style.left = '8px';
document.body.appendChild(container);

export const pane = new Pane({ container });
