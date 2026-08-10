import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type FC, type ReactNode } from 'react';
import { toast } from 'sonner';

import { FileIcon, FileTree, FolderIcon, type FileTreeNode } from './index.js';

const basename = (path: string): string => path.split('/').at(-1) ?? path;

const file = (path: string): FileTreeNode => ({ id: path, name: basename(path) });

/** Called with no children it is an empty directory, which still discloses. */
const dir = (path: string, ...children: FileTreeNode[]): FileTreeNode => ({
  children,
  id: path,
  name: basename(path),
});

/**
 * The root of a macOS volume, roughly as `ls -a /` reports it — a homage, and a
 * fixture that happens to exercise everything: three levels of nesting, an empty
 * directory (`/cores`), a leaf at the root (`/mach_kernel`), a dotfile, and names
 * long enough to need truncating at a narrow width.
 *
 * Folders come before files at every level and both are alphabetical, which is the
 * caller's arrangement rather than the component's: `FileTree` renders rows in the
 * order it is given, because who sorts and how is a decision about data.
 */
const macOSRoot: FileTreeNode[] = [
  dir(
    '/Applications',
    dir(
      '/Applications/Utilities',
      file('/Applications/Utilities/Activity Monitor.app'),
      file('/Applications/Utilities/Disk Utility.app'),
      file('/Applications/Utilities/Terminal.app')
    ),
    file('/Applications/Safari.app'),
    file('/Applications/System Settings.app')
  ),
  dir(
    '/Library',
    dir('/Library/Application Support'),
    dir('/Library/Fonts'),
    dir('/Library/Keychains'),
    dir('/Library/Preferences')
  ),
  dir(
    '/System',
    dir(
      '/System/Library',
      dir(
        '/System/Library/CoreServices',
        dir('/System/Library/CoreServices/Finder.app'),
        file('/System/Library/CoreServices/SystemVersion.plist')
      ),
      dir('/System/Library/Extensions'),
      dir('/System/Library/Fonts')
    )
  ),
  dir(
    '/Users',
    dir('/Users/Guest'),
    dir('/Users/Shared'),
    dir('/Users/admin', dir('/Users/admin/Desktop'), dir('/Users/admin/Documents'), file('/Users/admin/.zshrc'))
  ),
  dir('/Volumes', dir('/Volumes/Macintosh HD')),
  dir('/bin', file('/bin/bash'), file('/bin/ls'), file('/bin/sh'), file('/bin/zsh')),
  dir('/cores'),
  dir('/dev'),
  dir('/etc', file('/etc/hosts'), file('/etc/paths'), file('/etc/shells')),
  dir('/private', dir('/private/etc'), dir('/private/tmp'), dir('/private/var')),
  dir('/sbin'),
  dir('/tmp'),
  dir('/usr', dir('/usr/bin'), dir('/usr/lib'), dir('/usr/local'), dir('/usr/share')),
  dir('/var'),
  file('/mach_kernel'),
];

const meta: Meta<typeof FileTree> = {
  title: 'Components/FileTree',
  // Naming the component is what makes the Controls panel exist: Storybook reads
  // the prop types off it to build the args table.
  component: FileTree,
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    label: { control: 'text', description: 'Accessible name for the tree as a whole.' },
    className: { control: 'text' },
  },
  args: {
    label: 'Macintosh HD',
    nodes: macOSRoot,
  },
  render: (args) => (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl items-start px-2 py-8">
      <FileTree {...args} />
    </div>
  ),
};

export default meta;
type Story = StoryObj<typeof FileTree>;

/**
 * The tree with nothing to open it: every folder closed, and no handlers, so
 * activation falls back to disclosing and a click on a folder's name opens it the
 * way Finder does.
 *
 * Worth driving from the keyboard rather than the pointer. Tab once to enter — the
 * whole tree is a single tab stop — then the arrows: Down and Up step across levels,
 * Right opens a folder and, pressed again, steps inside it, Left closes or climbs
 * out, and `*` opens every folder on the current level at once.
 */
export const Default: Story = {};

/**
 * Opened two levels deep on mount, which is the case the disclosure has to *not*
 * animate: `initial={false}` means an already-open folder paints open rather than
 * unfolding from zero on the first frame, so the tree is never seen assembling
 * itself.
 *
 * `defaultExpandedIds` seeds the uncontrolled state and is read exactly once. Try
 * closing `/Applications` and then editing `label` in Controls: the re-render does
 * not put it back. A default that re-applied itself would be a default that
 * overrides the user.
 */
export const DefaultExpanded: Story = {
  args: {
    defaultExpandedIds: ['/Applications', '/Applications/Utilities'],
  },
};

/**
 * With `onNodeAction`, and therefore with the `…` column.
 *
 * The button is *not* a fourth tab stop per row. The row it belongs to holds the
 * tree's tab stop, so pressing Tab from a focused row reaches that row's button and
 * a second Tab leaves the tree entirely — two stops for a tree of any size. Note
 * that its focus ring traces the 28px circle you can see rather than the 52px band
 * it actually occupies, which is the same thing the row's ring does.
 *
 * The tree does not own a menu. It reports the press and hands over the button
 * element to anchor one to, because a popover belongs to whoever knows what is
 * going in it.
 */
export const WithActions: Story = {
  args: {
    defaultExpandedIds: ['/etc'],
    onNodeAction: (node, trigger) => {
      toast(`Actions: ${node.name}`, { description: `anchored to ${trigger.getBoundingClientRect().width}px button` });
    },
  },
};

/**
 * With `onActivate`, the row's name stops disclosing and becomes the caller's.
 *
 * Which splits the row cleanly in two: the chevron is expansion and nothing else,
 * the name is activation and nothing else. Open `/etc` from its chevron, then click
 * `hosts` — and click `/etc`'s *name* to see that it no longer toggles.
 *
 * The keyboard follows the same split, on purpose: Enter and Space activate,
 * ArrowRight and ArrowLeft expand and collapse, and neither key ever does the
 * other's job.
 */
export const Activation: Story = {
  args: {
    defaultExpandedIds: ['/etc'],
    onActivate: (node) => {
      toast(node.id);
    },
  },
};

/**
 * Alt/Option, which reaches the whole subtree instead of one row.
 *
 * Option-click the chevron on `/System` and every folder inside it opens at once;
 * Option-click it again and the subtree closes flat, so reopening it shows one level
 * rather than the state it was left in. On the keyboard it is Option+ArrowRight and
 * Option+ArrowLeft, and neither one moves focus — including Option+ArrowRight on a
 * folder that is already open, which opens what is inside rather than stepping in.
 *
 * The modifier is read off each event's `altKey` and is never held in state. That is
 * not an implementation detail so much as the only version that survives real use: a
 * mirrored `keydown`/`keyup` pair gets stuck on whenever the release is delivered
 * elsewhere — Alt+Tab, a menu opening, devtools taking focus — and stuck off when the
 * key was already down before the tree was focused. Both leave the next click doing
 * the opposite of what the user's fingers say. `handleKeyDown` in `file-tree.tsx`
 * spells out when tracking *is* unavoidable and what it then owes you.
 */
export const RecursiveDisclosure: Story = {
  args: {
    defaultExpandedIds: [],
    onNodeAction: (node) => {
      toast(node.name);
    },
  },
  render: (args) => (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-start gap-4 px-2 py-8">
      <p className="m-0 font-mono text-xs text-neutral-500">
        Option-click a chevron, or Option+&larr;/&rarr; — try it on /System
      </p>
      <FileTree {...args} />
    </div>
  ),
};

/**
 * The caller owning `expandedIds`.
 *
 * Both directions of the contract are on show: the buttons drive the tree, and the
 * tree reports every change back through `onExpandedIdsChange`, so the count below
 * stays right whether a folder was opened by a click, by ArrowRight, or by `*`.
 *
 * Collapse-all is the interesting one — it removes the folder that focus is sitting
 * inside. The row that swallows it takes focus, rather than letting the browser drop
 * focus to the body when the subtree turns `inert`. Open `/usr`, focus `/usr/lib`
 * with the arrow keys, hit Collapse all, and Tab still resumes from inside the tree.
 */
export const Controlled: Story = {
  parameters: {
    // The story hard-codes the expansion it would otherwise take from args.
    controls: { disable: true },
  },
  render: (args) => {
    const [expandedIds, setExpandedIds] = useState<string[]>(['/usr']);

    return (
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-start gap-4 px-2 py-8">
        <div className="flex items-center gap-2">
          <button
            className={`
              cursor-pointer rounded-lg bg-black/5 px-3 py-1.5 text-sm
              hover:bg-black/10
              dark:bg-white/10 dark:hover:bg-white/16
            `}
            type="button"
            onClick={() => setExpandedIds(['/Applications', '/Applications/Utilities', '/etc', '/usr'])}
          >
            Open a few
          </button>
          <button
            className={`
              cursor-pointer rounded-lg bg-black/5 px-3 py-1.5 text-sm
              hover:bg-black/10
              dark:bg-white/10 dark:hover:bg-white/16
            `}
            type="button"
            onClick={() => setExpandedIds([])}
          >
            Collapse all
          </button>
          <span className="font-mono text-xs text-neutral-500">{expandedIds.length} open</span>
        </div>

        <FileTree
          {...args}
          expandedIds={expandedIds}
          onExpandedIdsChange={setExpandedIds}
          onNodeAction={(node) => {
            toast(node.name);
          }}
        />
      </div>
    );
  },
};

/**
 * A narrow column, which is the only place the row's layout can be judged.
 *
 * Everything except the name is a fixed width — 28px of chevron, a 38px icon, 36px
 * of actions — so the name is the only thing that can give, and it truncates rather
 * than wrapping or pushing the button off the end. `/Applications/Utilities` is
 * seeded open because its contents are the longest names in the fixture.
 */
export const Narrow: Story = {
  args: {
    defaultExpandedIds: ['/Applications', '/Applications/Utilities'],
    onNodeAction: (node) => {
      toast(node.name);
    },
  },
  render: (args) => (
    <div className="mx-auto flex min-h-screen w-full max-w-2xs items-start px-2 py-8">
      <FileTree {...args} />
    </div>
  ),
};

/**
 * The two icons, and the folder at both ends of its morph.
 *
 * A composed story because the flap is the one thing here that cannot be judged
 * from a single instance: the open and closed paths are drawn with an identical
 * sequence of commands so that every control point has a counterpart to travel to,
 * and whether that held is only visible with the endpoints side by side. Toggle the
 * middle one to watch the path interpolate; the chevron and the row height in the
 * other stories are on the same spring.
 *
 * Both of the awkward bits in this story are about the caption under the middle
 * folder, which is the only text on screen that changes:
 *
 * - The `key` is `id` and not `label`. Keying by a caption that changes is keying by
 *   state: React saw a new key, unmounted the folder and mounted a fresh one, and a
 *   fresh `motion.path` with `initial={false}` starts *at* its target. The morph this
 *   story exists to show was being replaced by an instant swap, and it looked exactly
 *   like a broken animation rather than like a remount.
 * - The caption sits in a zero-width box. See `Caption`.
 */
export const Icons: Story = {
  parameters: {
    controls: { disable: true },
  },
  render: () => {
    const [open, setOpen] = useState(false);

    const samples = [
      { icon: <FolderIcon size={76} />, id: 'closed', label: 'closed' },
      { icon: <FolderIcon open={open} size={76} />, id: 'morph', label: open ? 'morph → open' : 'morph → closed' },
      { icon: <FolderIcon open size={76} />, id: 'open', label: 'open' },
      { icon: <FileIcon size={76} />, id: 'file', label: 'file' },
    ];

    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center gap-8 px-2">
        <div className="flex items-end gap-10">
          {samples.map((sample) => (
            <div key={sample.id} className="flex flex-col items-center gap-3">
              {sample.icon}
              <Caption>{sample.label}</Caption>
            </div>
          ))}
        </div>

        <button
          className={`
            cursor-pointer rounded-lg bg-black/5 px-3 py-1.5 text-sm
            hover:bg-black/10
            dark:bg-white/10 dark:hover:bg-white/16
          `}
          type="button"
          onClick={() => setOpen((current) => !current)}
        >
          Toggle the middle folder
        </button>
      </div>
    );
  },
};

/**
 * A caption that cannot move anything.
 *
 * `w-0` on the wrapper takes it out of the inline axis entirely, so the column it
 * sits in is sized by the icon alone and a caption growing from `open` to
 * `morph → closed` cannot widen it. `justify-center` still centres the text on the
 * wrapper, and since the wrapper is a zero-width box at the centre of a column whose
 * items are centred, the text is centred on the icon: the *parent* is the layout
 * anchor and the caption is painted relative to it. `shrink-0` is what allows the
 * overflow — without it the text is a flex item in a zero-width container and duly
 * shrinks to nothing.
 *
 * The block axis is untouched, which is the half that has to stay in flow: the
 * caption is still a normal child vertically, so it contributes its line box to the
 * column's height and the `gap-3` above it is real. This is the inline mirror of the
 * zero-height wrapper used for a row's trailing control, and it trades the same
 * thing away — a zero-width box reserves no space, so a long enough caption will
 * overlap its neighbour's. That is the right trade only when the text is an
 * annotation and the icon is the thing being laid out, which is what a story like
 * this is.
 *
 * Worth doing even for four static captions: without it, toggling the middle folder
 * re-measures the row and every icon slides a few pixels, which is a layout shift
 * happening *underneath* an animation being studied. The shift and the morph become
 * impossible to tell apart.
 */
const Caption: FC<{ children: ReactNode }> = ({ children }) => (
  <div className="flex w-0 justify-center">
    <span className="shrink-0 font-mono text-xs whitespace-nowrap text-neutral-500">{children}</span>
  </div>
);
