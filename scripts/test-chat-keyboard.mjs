/** Spring keyboard scrolling and controller ownership. Requires development Storybook. */
import assert from 'node:assert/strict';

import { chromium } from 'playwright';

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(
    `${process.env.STORYBOOK_URL ?? 'http://localhost:6009'}/iframe.html?id=components-chat-scroll-container--with-message-input&viewMode=story`
  );
  const viewport = page.locator('[data-slot="chat-scroll-viewport"]');
  const mode = () => page.locator('#storybook-root strong').textContent();
  const geometry = () =>
    viewport.evaluate((v) => ({ top: v.scrollTop, max: v.scrollHeight - v.clientHeight, height: v.clientHeight }));
  async function waitIdle() {
    await page.waitForFunction(() =>
      ['following', 'detached'].includes(document.querySelector('#storybook-root strong')?.textContent)
    );
  }
  async function press(key) {
    await viewport.press(key);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await waitIdle();
    return geometry();
  }
  await page.waitForFunction(() => document.querySelector('#storybook-root strong')?.textContent === 'following');
  const initial = await geometry();
  await viewport.press('Home');
  await page.waitForFunction(() => document.querySelector('#storybook-root strong')?.textContent === 'animating');
  const intermediate = await geometry();
  assert.ok(intermediate.top > 0 && intermediate.top < initial.top, 'Home exposes intermediate spring progress');
  await waitIdle();
  assert.equal((await geometry()).top, 0);
  assert.equal(await mode(), 'detached');
  const steps = [];
  for (const [key, direction] of [
    ['ArrowDown', 1],
    ['Space', 1],
    ['Shift+Space', -1],
    ['PageDown', 1],
    ['PageUp', -1],
    ['ArrowUp', -1],
    ['Alt+ArrowDown', 1],
    ['Alt+ArrowUp', -1],
  ]) {
    const before = await geometry();
    const after = await press(key);
    const expected = key.includes('Arrow') && !key.includes('Alt') ? 40 : Math.max(40, before.height - 40);
    assert.ok(Math.abs(after.top - before.top - direction * expected) <= 1, `${key} reaches its spring target`);
    assert.equal(await mode(), 'detached');
    steps.push({ key, delta: after.top - before.top });
  }
  const end = await press('Meta+ArrowDown');
  assert.equal(end.top, end.max);
  assert.equal(await mode(), 'following');
  for (const key of ['ArrowDown', 'PageDown', 'Space', 'End']) {
    await press(key);
    assert.equal(await mode(), 'following', `${key} at bottom preserves follow`);
  }
  assert.equal((await press('Meta+ArrowUp')).top, 0);
  await press('End');
  await press('Shift+Space');
  await page.getByRole('button', { name: 'Scroll to bottom', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#storybook-root strong')?.textContent === 'animating');
  await press('PageUp');
  assert.equal(await mode(), 'detached', 'Keyboard replaces bottom catch-up with a reading target');

  const samples = await page.evaluate(async () => {
    const { createScrollAnchorController } = await import('/src/components/scroll-anchor/scroll-anchor-controller.ts');
    const v = document.createElement('div');
    v.style.cssText = 'position:fixed;inset:0 auto auto 0;width:200px;height:100px;overflow:auto';
    v.tabIndex = 0;
    const content = document.createElement('div');
    content.style.cssText = 'height:2000px;padding-bottom:0';
    content.innerHTML = '<textarea aria-label="Nested editor"></textarea><button>Nested action</button>';
    v.append(content);
    document.body.append(v);
    let state;
    const options = {
      threshold: 2,
      reducedMotion: false,
      animationSpeed: 0.25,
      onStateChange: (next) => {
        state = next;
      },
    };
    const controller = createScrollAnchorController(v, content, options);
    const flush = async (count = 3) => {
      for (let f = 0; f < count; f++) await new Promise(requestAnimationFrame);
    };
    const check = (ok, message) => {
      if (!ok) throw new Error(message);
    };
    const key = (name, init = {}) => {
      const e = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init });
      v.dispatchEvent(e);
      check(e.defaultPrevented, `${name} default is owned`);
    };
    try {
      await flush();
      for (const target of content.children)
        for (const name of [' ', 'ArrowUp', 'Home', 'PageDown']) {
          const e = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
          target.dispatchEvent(e);
          await flush();
          check(state.mode === 'following' && !e.defaultPrevented, `${target.tagName} retains ${name}`);
        }
      for (const init of [{ isComposing: true }, { ctrlKey: true }]) {
        v.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', ...init }));
        await flush();
        check(state.mode === 'following', 'Composition/control key retains ownership');
      }
      const consumed = new KeyboardEvent('keydown', { key: 'ArrowUp', cancelable: true });
      consumed.preventDefault();
      v.dispatchEvent(consumed);
      await flush();
      check(state.mode === 'following', 'Consumed key retains ownership');
      key('ArrowUp');
      await flush(8);
      const first = { ...state };
      check(
        first.mode === 'animating' && !first.following && first.velocity < 0 && first.target === 1860,
        'Arrow starts our spring at slow playback'
      );
      const top = v.scrollTop;
      key('ArrowUp');
      key('ArrowUp');
      check(v.scrollTop === top, 'Retargets do not synchronously jump the viewport');
      await flush(5);
      const repeated = { ...state };
      check(
        repeated.target === 1780 && repeated.velocity < 0,
        `Same-frame repeat accumulates targets and keeps momentum: ${JSON.stringify({ first, repeated, top: v.scrollTop })}`
      );
      key('ArrowDown');
      await flush(2);
      const reversed = { ...state };
      check(
        reversed.target === 1820 && reversed.velocity < 0,
        'Reversal preserves incoming velocity before decelerating'
      );
      content.style.height = '2400px';
      controller.layoutChanged();
      await flush(2);
      check(state.target === 1820, 'Incoming growth cannot turn keyboard reading into bottom catch-up');
      const anchor = {
        element: content.lastElementChild,
        bottom: content.lastElementChild.getBoundingClientRect().bottom - v.getBoundingClientRect().top,
      };
      const spacer = document.createElement('div');
      spacer.style.height = '100px';
      content.prepend(spacer);
      content.style.height = '2500px';
      controller.layoutChanged({ anchor });
      await flush(3);
      check(state.target === 1920, 'Reading anchor shifts the keyboard destination with content above it');
      v.dispatchEvent(new WheelEvent('wheel', { deltaY: 10, cancelable: true }));
      await flush();
      check(state.mode === 'detached', 'Wheel takes over keyboard animation');
      const stopped = v.scrollTop;
      await flush(8);
      check(v.scrollTop === stopped, 'Cancelled spring has no future writes');
      v.scrollTop = v.scrollHeight - v.clientHeight;
      v.dispatchEvent(new Event('scroll'));
      await flush();
      check(state.mode === 'following', 'Native return to bottom restores follow after keyboard reading');
      content.style.height = '2600px';
      controller.layoutChanged();
      await flush();
      check(v.scrollTop === 2500 && state.mode === 'following', 'Restored follow discards the old keyboard target');
      controller.updateOptions({ ...options, reducedMotion: true });
      key('Home');
      await flush();
      check(v.scrollTop === 0 && state.mode === 'detached', 'Reduced motion reaches reading target directly');
      key('End');
      await flush();
      check(v.scrollTop === 2500 && state.mode === 'following', 'Reduced motion End follows bottom');
      return { first, repeated, reversed };
    } finally {
      controller.dispose();
      v.remove();
    }
  });
  assert.deepEqual(errors, []);
  console.log('Chat keyboard spring contracts passed', { steps, samples });
} finally {
  await browser.close();
}
