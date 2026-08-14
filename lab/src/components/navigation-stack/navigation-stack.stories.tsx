import { en, Faker } from '@faker-js/faker';
import { cn } from '@monorepo/utils';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChevronRight, Compass, Layers, Settings } from 'lucide-react';
import { useRef, useState, type FC, type ReactNode, type RefObject } from 'react';

import {
  NavigationCenteredContent,
  NavigationScrollArea,
  NavigationStack,
  NavigationStackShell,
  useNavigation,
  useNavigationStack,
  type NavigationPresentation,
  type NavigationStackResult,
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

// ---------------------------------------------------------------------------
// Tabs — a stack per tab, assembled from the building blocks
// ---------------------------------------------------------------------------

const TABS = [
  { id: 'browse', title: 'Browse', Icon: Compass },
  { id: 'library', title: 'Library', Icon: Layers },
  { id: 'settings', title: 'Settings', Icon: Settings },
] as const;

/**
 * One tab's stack.
 *
 * `NavigationStackShell` rather than `NavigationStack`, because the tab bar
 * outside has to call `popToRoot` on whichever stack is showing and read each
 * stack's depth for its badge — so the shell holds the stack and hands it
 * down. Wanting the state is not a reason to rebuild the chrome, and a copy
 * of the header here is a copy that drifts the first time the real one
 * changes.
 *
 * The panel is never unmounted. It is taken off the paint path with
 * `visibility: hidden` and out of the tab order with `inert`, the same pair
 * the stack uses for a parked view, and for the same reason: `display: none`
 * would destroy the layout box and take every scroll offset in the tab with
 * it, and preserving those is most of what "the tab kept its state" means.
 */
const TabPanel: FC<{
  nav: NavigationStackResult;
  isActive: boolean;
  tabId: string;
  scopeRef: RefObject<HTMLDivElement | null>;
}> = ({ nav, isActive, tabId, scopeRef }) => (
  <div
    data-testid={`tab-panel-${tabId}`}
    inert={!isActive}
    className={cn('absolute inset-0', !isActive && 'pointer-events-none')}
    style={{ visibility: isActive ? 'visible' : 'hidden' }}
  >
    <NavigationStackShell
      ref={scopeRef}
      nav={nav}
      // The outer shell owns the frame's radius; each tab fills it square.
      className="rounded-none"
      renderView={(view) => <TabContent tabId={tabId} view={view} />}
    />
  </div>
);

const TabContent: FC<{ tabId: string; view: NavigationView }> = ({ tabId, view }) => {
  const { push, depth } = useNavigation();

  return (
    <NavigationScrollArea>
      <p
        className={`
          px-4 py-3 text-xs/5 text-black/50
          dark:text-white/50
        `}
      >
        {view.title} · depth {depth}. Switch tabs and come back: the depth, the scroll position and the focused row are
        all still here.
      </p>
      {Array.from({ length: 12 }, (_, i) => (
        <ListItem
          key={i}
          label={`${view.title} item ${String(i + 1)}`}
          onPress={() =>
            push({
              id: `${tabId}-${String(depth)}-${String(i)}`,
              // The title carries the path, so a deep view reads as
              // `Settings 1 - 3 - 2`. A space before the first number and a
              // dash between the rest, so the tab's name stays a name.
              title: `${view.title}${depth === 1 ? ' ' : ' - '}${String(i + 1)}`,
            })
          }
        />
      ))}
    </NavigationScrollArea>
  );
};

/**
 * Three tabs, one stack each.
 *
 * Tapping the tab you are already on pops that stack to its root, which is
 * the one tab-bar behaviour people miss when it is absent — it is how you get
 * out of somewhere deep without pressing back five times. It has to be the
 * *second* tap: the first is a switch, and popping on a switch would throw
 * away the position the user is coming back to.
 */
const WithTabs: FC = () => {
  const [activeTab, setActiveTab] = useState<string>(TABS[0].id);

  // One stack per tab, all three alive for the life of the shell. Hooks
  // cannot be called in a loop, so they are named rather than mapped.
  const browseRef = useRef<HTMLDivElement>(null);
  const libraryRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const browse = useNavigationStack({ id: 'browse-root', title: 'Browse' }, { scopeRef: browseRef });
  const library = useNavigationStack({ id: 'library-root', title: 'Library' }, { scopeRef: libraryRef });
  const settings = useNavigationStack({ id: 'settings-root', title: 'Settings' }, { scopeRef: settingsRef });

  const stacks: Record<string, { nav: NavigationStackResult; scopeRef: RefObject<HTMLDivElement | null> }> = {
    browse: { nav: browse, scopeRef: browseRef },
    library: { nav: library, scopeRef: libraryRef },
    settings: { nav: settings, scopeRef: settingsRef },
  };

  const onTabPress = (tabId: string): void => {
    if (tabId === activeTab) stacks[tabId]?.nav.popToRoot();
    else setActiveTab(tabId);
  };

  return (
    <div
      className={cn(`
        flex h-full flex-col overflow-hidden rounded-2xl bg-neutral-200
        dark:bg-neutral-900
      `)}
    >
      {/* `relative` so the panels can stack; `min-h-0` so a tall tab is
          clipped here rather than pushing the tab bar off the frame. */}
      <div className="relative min-h-0 flex-1">
        {TABS.map(({ id }) => {
          const entry = stacks[id];
          if (!entry) return null;
          return <TabPanel key={id} tabId={id} nav={entry.nav} scopeRef={entry.scopeRef} isActive={id === activeTab} />;
        })}
      </div>

      <div
        data-testid="tab-bar"
        className={`
          flex shrink-0 border-t border-black/10
          dark:border-white/10
        `}
      >
        {TABS.map(({ id, title, Icon }) => {
          const isActive = id === activeTab;
          const depth = stacks[id]?.nav.depth ?? 1;

          return (
            <button
              key={id}
              type="button"
              data-testid={`tab-${id}`}
              data-active={isActive}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onTabPress(id)}
              // The hit target is the whole cell and does not move: no padding,
              // gap or flex change with state, and nothing paints a background.
              // `group` so hover reaches the icon, which is the only thing that
              // responds — both to hover and to being the active tab. The label
              // holds one colour throughout, so the icon carries the state on
              // its own. `aria-current` is what actually announces it, which
              // matters more than usual when the only visual cue is a colour.
              className={`
                group flex flex-1 cursor-pointer flex-col items-center gap-1 py-2 text-[10px] text-black/50
                dark:text-white/50
              `}
            >
              <span className="relative">
                <Icon
                  className={cn(
                    'size-5 transition-colors',
                    isActive
                      ? `
                        text-black
                        dark:text-white
                      `
                      : `
                        text-black/50
                        group-hover:text-black/80
                        dark:text-white/50
                        dark:group-hover:text-white/80
                      `
                  )}
                />
                {/* Depth is the visible proof that the tab kept its place. */}
                {depth > 1 && (
                  <span
                    className={`
                      absolute -end-2 -top-1 rounded-full bg-blue-500 px-1 text-[9px]/[14px] font-medium text-white
                    `}
                  >
                    {depth}
                  </span>
                )}
              </span>
              {title}
            </button>
          );
        })}
      </div>
    </div>
  );
};

/** One pane of the two-stack story: pushes numbered views, so depth is visible. */
const PaneContent: FC<{ side: string; view: NavigationView }> = ({ side, view }) => {
  const { push, depth } = useNavigation();

  return (
    <NavigationScrollArea>
      <p
        className={`
          px-3 py-2 text-[11px]/4 text-black/50
          dark:text-white/50
        `}
      >
        {view.title} · depth {depth}
      </p>
      <ListItem
        label="Push"
        onPress={() => push({ id: `${side}-${String(depth)}`, title: `${side} ${String(depth)}` })}
      />
    </NavigationScrollArea>
  );
};

/**
 * Two independent stacks on one page, which is the case that made the Escape
 * binding a problem: the listener is on the document, so both hear every
 * keystroke.
 */
const TwoStacks: FC = () => (
  <div className="flex h-full gap-3">
    {['Left', 'Right'].map((side) => (
      <div key={side} className="h-full min-w-0 flex-1" data-testid={`pane-${side.toLowerCase()}`}>
        <NavigationStack
          rootView={{ id: `${side}-root`, title: side }}
          renderView={(view) => <PaneContent side={side} view={view} />}
          showBreadcrumb={false}
        />
      </div>
    ))}
  </div>
);

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
    enableKeyboardNav: { control: 'boolean' },
    headerMode: { control: 'inline-radio', options: ['inset', 'overlay'] },
    rootView: { control: false },
    initialViews: { control: false },
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

export const DeepLinked: Story = {
  args: {
    rootView: { id: 'root', title: 'Root' },
    // The first branch of the tree, two levels in — what a URL would restore.
    initialViews: [
      { id: '0', title: 'Blood Oranges' },
      { id: '0.0', title: 'Pinto Beans' },
    ],
    renderView: (view: NavigationView) => <ListViewContent view={view} />,
  },
  parameters: {
    docs: {
      description: {
        story: [
          'Opens three levels deep, as a restored URL would. `initialViews` and `enableKeyboardNav` used to be reachable only by assembling the stack by hand — the preset called the hook with the root view and nothing else, so a deep link was impossible through it and Escape could not be turned off.',
          'Nothing animates in: every entry present at mount is in the entrance snapshot, so it is given `initial={false}` and arrives already at rest instead of three views sliding across each other. The back button and breadcrumb are populated from the start, so this is a real position in the history rather than a root that happens to look different — measured on load, depth 3 with `Root › Blood Oranges › Pinto Beans` and a back button.',
          '`initialViews` and `rootView` are both read once, when the stack is created. Changing either later does nothing: the stack owns its history from that point, and re-seeding it from a prop would throw away wherever the user had navigated to. Change the `key` on the component to start a new stack instead.',
        ].join('\n\n'),
      },
    },
  },
};

export const WithTabBar: Story = {
  args: {
    rootView: { id: 'unused', title: 'Unused' },
    renderView: () => null,
  },
  render: () => <WithTabs />,
  parameters: {
    docs: {
      description: {
        story: [
          'Three tabs, a stack each. Drill into one, switch away, come back: the depth, the scroll position and the focused row are all where you left them. The badge on each tab is its depth, so you can see the other stacks holding their place while you are not looking at them.',
          '**Tap the tab you are already on and that stack pops to its root.** It is the tab-bar behaviour people miss when it is absent — the way out of somewhere five levels deep without pressing back five times — and it has to be the *second* tap. The first is a switch, and popping on a switch would throw away the position the user is coming back to.',
          'Panels are never unmounted. They are taken off the paint path with `visibility: hidden` and out of the tab order with `inert` — the same pair a parked view uses, for the same reason. `display: none` would preserve React state just as well and destroy the layout box, taking every scroll offset in the tab with it, and those offsets are most of what "the tab kept its state" means.',
          "The shell holds all three stacks itself and renders each with `NavigationStackShell`, which is `NavigationStack` with the state lifted out. The second tap is the reason: the tab bar is outside the chrome and has to call `popToRoot` on whichever stack is showing, and the badges have to read each stack's depth — but wanting the state is not a reason to rebuild the header, and a copy of it here would be a copy that drifts the first time the real one changes. `useNavigationStack` was always headless; the shell is the other half of that.",
          'It is also the case `scopeRef` was built for. Each tab passes its own panel, so Escape pops the tab you are in and not the two you are not. Being `inert` keeps focus out of the hidden panels, so their stacks never see focus inside themselves and stay put.',
        ].join('\n\n'),
      },
    },
  },
};

export const TwoIndependentStacks: Story = {
  args: {
    rootView: { id: 'unused', title: 'Unused' },
    renderView: () => null,
  },
  render: () => <TwoStacks />,
  parameters: {
    docs: {
      description: {
        story: [
          'Two stacks, one page. Push a few levels in each, click into one of them, and press Escape: only that one goes back. Escape has to be bound on the document — a stack must answer it from anywhere inside itself, including from chrome that is a sibling of its views — so both stacks hear every keystroke and something has to decide which one it was meant for.',
          'That something is focus, not a nesting order or a mounting order: "which stack am I using" is a question about attention, and two sibling stacks have no meaningful order between them. `NavigationStack` wires its own frame in as the scope; a hand-assembled stack passes `scopeRef` itself, and one that will never share a page with another can leave it out and keep the global binding.',
          'It costs exactly one case. With focus outside both stacks — clicked onto the page background — Escape now does nothing, where before it popped whichever stack felt like answering. Focus rarely sits there, because each view wrapper is focusable and clicking inert content inside one lands on it.',
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
