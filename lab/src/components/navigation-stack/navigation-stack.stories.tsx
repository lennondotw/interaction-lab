import { en, Faker } from '@faker-js/faker';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChevronRight } from 'lucide-react';
import type { FC, ReactNode } from 'react';

import {
  NavigationCenteredContent,
  NavigationScrollArea,
  NavigationStack,
  useNavigation,
  type NavigationPresentation,
  type NavigationView,
} from './index.js';

// ---------------------------------------------------------------------------
// Demo fixture — a deep tree to push through. Not part of the component.
// ---------------------------------------------------------------------------

const TREE_DEPTH = 5;
const CHILDREN_PER_NODE = 5;

/** Fixed seed so the tree is identical on every reload. */
const TREE_SEED = 20260729;

interface NavNode {
  id: string;
  title: string;
  children: NavNode[];
}

function toTitleCase(value: string): string {
  return value.replace(/\b\p{Ll}/gu, (c) => c.toUpperCase());
}

/**
 * Ids encode the path (`0`, `0.3`, `0.3.1`), which keeps them stable
 * across reloads and lets the lookup below be a flat map rather than a
 * recursive search of ~4k nodes on every render.
 */
function buildTree(faker: Faker, depth: number, parentId: string): NavNode[] {
  if (depth > TREE_DEPTH) return [];

  return Array.from({ length: CHILDREN_PER_NODE }, (_, i) => {
    const id = parentId === '' ? `${i}` : `${parentId}.${i}`;
    return { id, title: toTitleCase(faker.food.ingredient()), children: buildTree(faker, depth + 1, id) };
  });
}

const NAV_TREE = buildTree(new Faker({ locale: [en], seed: TREE_SEED }), 1, '');

/** Flat index of every node, so a view id resolves in one lookup. */
const NODES_BY_ID = new Map<string, NavNode>();
(function indexTree(nodes: readonly NavNode[]): void {
  for (const node of nodes) {
    NODES_BY_ID.set(node.id, node);
    indexTree(node.children);
  }
})(NAV_TREE);

function childrenOf(viewId: string): NavNode[] {
  if (viewId === 'root') return NAV_TREE;
  return NODES_BY_ID.get(viewId)?.children ?? [];
}

/** Ids encode the path, so depth is a string split rather than a walk. */
function depthOf(nodeId: string): number {
  return nodeId.split('.').length;
}

/** One presentation per level, cycling — so a single drill-down shows all four. */
const PRESENTATION_BY_DEPTH: NavigationPresentation[] = ['slide', 'cover', 'fade', 'instant'];

function presentationForDepth(nodeId: string): NavigationPresentation {
  return PRESENTATION_BY_DEPTH[(depthOf(nodeId) - 1) % PRESENTATION_BY_DEPTH.length] ?? 'slide';
}

// ---------------------------------------------------------------------------
// Demo view
// ---------------------------------------------------------------------------

const ListItem: FC<{ label: string; hint?: string; onPress: () => void }> = ({ label, hint, onPress }) => (
  <button
    type="button"
    onClick={onPress}
    className={`
      flex h-10 w-full cursor-pointer items-center gap-2 border-b border-black/10 px-4 text-left text-sm
      hover:bg-black/5
      dark:border-white/10
      dark:hover:bg-white/5
    `}
  >
    <span className="flex-1 truncate">{label}</span>
    {hint !== undefined && (
      <span
        className={`
          font-mono text-[10px] text-black/40
          dark:text-white/40
        `}
      >
        {hint}
      </span>
    )}
    <ChevronRight
      className={`
        size-4 shrink-0 text-black/30
        dark:text-white/30
      `}
    />
  </button>
);

interface ListViewContentProps {
  view: NavigationView;
  /** Omitted in the default story, so every push slides. */
  presentationFor?: (nodeId: string) => NavigationPresentation;
}

const ListViewContent: FC<ListViewContentProps> = ({ view, presentationFor }) => {
  const { push } = useNavigation();
  const children = childrenOf(view.id);

  // Leaves have nothing to drill into — show the title so the deepest
  // level still reads as a destination rather than a blank panel.
  if (children.length === 0) {
    return (
      <NavigationCenteredContent>
        <span
          className={`
            text-sm text-black/50
            dark:text-white/50
          `}
        >
          {view.title}
        </span>
      </NavigationCenteredContent>
    );
  }

  // `NavigationScrollArea` rather than a bare scroller, so the first row
  // clears a floating header in `overlay` mode and nothing is inset twice
  // in `inset` mode.
  return (
    <NavigationScrollArea>
      {children.map((node) => {
        const presentation = presentationFor?.(node.id);
        return (
          <ListItem
            key={node.id}
            label={node.title}
            hint={presentation}
            onPress={() => push({ id: node.id, title: node.title, presentation })}
          />
        );
      })}
    </NavigationScrollArea>
  );
};

/**
 * Content that deliberately reaches all four edges, for `overlay` mode.
 *
 * The gradient is the point: it runs behind the floating header, so you can
 * see what the blur is doing and see that the rows — which inset themselves
 * by `var(--nav-safe-top)` — start below it while the surface does not.
 */
const EdgeToEdgeContent: FC<{ view: NavigationView }> = ({ view }) => {
  const { push } = useNavigation();
  const children = childrenOf(view.id);

  // Hue from the id, so each level reads as its own surface passing under the
  // chrome rather than as the same flat panel. Indexed rather than spread:
  // code units are all this needs, and the ids are ASCII paths anyway.
  let hue = 0;
  for (let i = 0; i < view.id.length; i++) hue = (hue + view.id.charCodeAt(i) * 7) % 360;
  const surface = {
    background: `linear-gradient(160deg, oklch(0.68 0.17 ${hue}), oklch(0.4 0.13 ${(hue + 70) % 360}))`,
  };

  if (children.length === 0) {
    return (
      <div className="h-full" style={surface}>
        <NavigationCenteredContent>
          <span className="text-sm text-white/80">{view.title}</span>
        </NavigationCenteredContent>
      </div>
    );
  }

  return (
    <div className="h-full" style={surface}>
      <NavigationScrollArea>
        {children.map((node) => (
          <button
            key={node.id}
            type="button"
            onClick={() => push({ id: node.id, title: node.title })}
            className={`
              flex h-12 w-full cursor-pointer items-center justify-between border-b border-white/15 px-4 text-left
              text-sm text-white
              hover:bg-white/10
            `}
          >
            <span className="truncate">{node.title}</span>
            <ChevronRight className="size-4 shrink-0 text-white/50" />
          </button>
        ))}
        {/* Enough copy to make the scroller actually scroll, so the claim
            above it — that rows pass under the blur rather than stopping at
            it — is something you can check rather than take on trust. */}
        <p className="px-4 py-6 text-xs/6 text-white/70">
          The surface behind the bar reaches the top of the frame; these rows do not, because the scroller insets itself
          by <code className="font-mono">var(--nav-safe-top)</code>. Scroll and the rows travel up under the blur — the
          inset is padding inside the scroller, not a shorter scroller. Take the breadcrumb away and the bar gets
          shorter, the variable follows, and this list starts higher without anything here knowing why.
        </p>
      </NavigationScrollArea>
    </div>
  );
};

/**
 * A cycle rather than a tree, so the same view can be reached again from
 * deeper in the stack.
 *
 * Every other fixture here encodes the path into the id, which makes ids
 * accidentally unique and hides the question. These three nodes all link to
 * each other, so `Alpha → Beta → Alpha` is two occupancies of one view — the
 * case the stack has always claimed to support.
 */
const CYCLE: NavigationView[] = [
  { id: 'alpha', title: 'Alpha' },
  { id: 'beta', title: 'Beta', presentation: 'cover' },
  { id: 'gamma', title: 'Gamma', presentation: 'fade' },
];

const RevisitContent: FC<{ view: NavigationView }> = ({ view }) => {
  const { push, depth } = useNavigation();

  return (
    <NavigationScrollArea>
      <p
        className={`
          px-4 py-3 text-xs/5 text-black/50
          dark:text-white/50
        `}
      >
        You are at <strong className="font-medium">{view.title}</strong>, depth {depth}. Go somewhere you have already
        been and the breadcrumb repeats it — two entries, one view.
      </p>
      {CYCLE.map((node) => (
        <ListItem
          key={node.id}
          label={`Go to ${node.title}`}
          hint={node.id === view.id ? 'again' : node.presentation}
          onPress={() => push(node)}
        />
      ))}
    </NavigationScrollArea>
  );
};

// The stage has to sit apart from the card on both themes, otherwise the
// rounded frame dissolves into the page — in dark that means going
// LIGHTER than the views, which are near-black.
const Stage: FC<{ children: ReactNode }> = ({ children }) => (
  <div
    className={`
      flex min-h-screen w-full items-center justify-center bg-neutral-300 p-8
      dark:bg-neutral-800
    `}
  >
    <div className="size-100">{children}</div>
  </div>
);

const meta = {
  title: 'Components/NavigationStack',
  component: NavigationStack,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <Stage>
        <Story />
      </Stage>
    ),
  ],
  tags: ['autodocs'],
  argTypes: {
    showBreadcrumb: { control: 'boolean' },
    headerMode: { control: 'inline-radio', options: ['inset', 'overlay'] },
    rootView: { control: false },
    renderView: { control: false },
  },
} satisfies Meta<typeof NavigationStack>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    rootView: { id: 'root', title: 'Root' },
    renderView: (view: NavigationView) => <ListViewContent view={view} />,
  },
  parameters: {
    docs: {
      description: {
        story: [
          'Drill in by tapping a row; go back with the header button or the Escape key. Views stay mounted underneath, so returning to one preserves its scroll position rather than rebuilding it.',
          'Focus follows the same rule as the transition. Tab to a row and press Enter: focus lands in the view that just opened, and the one it covered stops taking part — it is inert from the first frame of the slide, not from the end of it, so Tab can never reach a view that is on its way out. Press Escape and focus goes back to the exact row you left, which is the focus half of keeping the view mounted. The back button is chrome rather than content, so it keeps focus when you use it — nothing is stolen from you while it is still yours.',
        ].join('\n\n'),
      },
    },
  },
};

export const PerLevelPresentation: Story = {
  args: {
    rootView: { id: 'root', title: 'Root' },
    renderView: (view: NavigationView) => <ListViewContent view={view} presentationFor={presentationForDepth} />,
  },
  parameters: {
    docs: {
      description: {
        story: [
          'One presentation per level, cycling `slide → cover → fade → instant`. Each row is labelled with what it will do, so a single drill-down shows all four and the back button retraces each of them in reverse.',
          'A presentation is a pair of poses, not an entrance. Watch the view *underneath*: it parks back and dims under a `slide`, holds still and dims under a `cover`, and neither moves nor dims under a `fade` — where it is visible through the arriving view for the whole dissolve, so parking it would read as a glitch and dimming it as the background going dark. Everything that moves because of a given navigation borrows that navigation’s curve, so the layer below can never be on a different clock from the layer above.',
          '`instant` is shortcut in both directions rather than animated over zero seconds: the view mounts already at rest, and on the way back it is dropped without ever being mounted as a leaving view. A zero-duration transition would still cost a frame at the wrong pose in each direction.',
          'Under `prefers-reduced-motion` every presentation that displaces a view becomes a `fade`, and `instant` is left alone — giving a view whose author asked for no transition a 200ms dissolve would be adding motion in the name of removing it. Each row still shows what it was *authored* as, while `data-view-presentation` on the view reports what is actually in play, so the two disagreeing is the feature. Measured with the query on: zero pixels of displacement on either axis at any point of a push or a pop, and the exits become an opacity ramp.',
        ].join('\n\n'),
      },
    },
  },
};

export const Fullscreen: Story = {
  args: {
    rootView: { id: 'root', title: 'Root' },
    renderView: (view: NavigationView) => <EdgeToEdgeContent view={view} />,
    headerMode: 'overlay',
  },
  parameters: {
    docs: {
      description: {
        story: [
          'The header is lifted out of the column and floats, so the content area is the whole frame and each view runs edge to edge. The gradient passing behind the bar is what the mode is for; the bar earns its legibility with a translucent blurred material rather than by taking space away from the content.',
          'The rows still start below the chrome because they inset themselves by `var(--nav-safe-top)` — the header’s measured height *plus a little*, because clearing a floating bar is not the same as sitting flush against its edge; with no rule under the bar, content that starts exactly at its underside reads as clipped by it. The raw height is published separately as `var(--nav-header-height)` for anything that wants to align *to* the bar instead. Scroll the list: the rows pass *under* the blur instead of stopping at it, which is only possible because the inset is padding inside the scroller rather than a shorter scroller. In `inset` mode both come to `0`, so the same content component is correct in both modes with no branch.',
          'The bar also overdraws itself by 1px along its top and sides, into the frame’s rounded clip. The container’s anti-aliased corner and the bar’s own edge do not land on the same subpixels, and the gap between them shows as a hairline of the page behind the frame — more so under a `backdrop-filter`, whose edge is resampled too. The overdrawn pixel is thrown away by the clip, which is the point. It is paint only: the material is out of flow, so the measured height and therefore the inset are untouched by it.',
          'This is also why the height is measured rather than declared. A floating header has no layout relationship to the content, so the number has to cross into CSS — the one case here where the engine genuinely cannot do it for us.',
        ].join('\n\n'),
      },
    },
  },
};

export const RevisitedView: Story = {
  args: {
    rootView: { id: 'alpha', title: 'Alpha' },
    renderView: (view: NavigationView) => <RevisitContent view={view} />,
  },
  parameters: {
    docs: {
      description: {
        story: [
          'A cycle, not a tree. Walk `Alpha → Beta → Alpha` and the stack holds one view twice — which is what a navigation stack is: a history, not a set. Every other fixture here encodes the path into the id, which makes ids accidentally unique and hides the question entirely.',
          'What makes it work is that nothing keys on `view.id`. Each occupancy gets an entry key when it is pushed, and the React element, the set of parked views, the set of leaving views and the map remembering where focus sat all key on that instead. Keying on the id would collapse the two into one element, and popping one of them would find nothing removed — so the departing view would simply vanish instead of animating out, because the id it would have been matched by is still on the stack.',
          'Keys are never reused, including after a pop. A popped entry can still be mid-exit when the next push lands, and handing the newcomer its key would hand it its identity as well.',
        ].join('\n\n'),
      },
    },
  },
};

export const NoBreadcrumb: Story = {
  args: {
    rootView: { id: 'root', title: 'Root' },
    renderView: (view: NavigationView) => <ListViewContent view={view} />,
    showBreadcrumb: false,
  },
  parameters: {
    docs: {
      description: {
        story: [
          'Title and back button only — and the header gives the space back rather than reserving it. The content area is sized by the column, not by a declared header height, so removing the breadcrumb line moves the first row up by exactly the line that left.',
          'Toggle `showBreadcrumb` against the `Default` story to see it: the header is 24px shorter here, and the content starts 24px higher.',
        ].join('\n\n'),
      },
    },
  },
};
