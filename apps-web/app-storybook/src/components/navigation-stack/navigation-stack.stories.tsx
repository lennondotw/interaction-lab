import { en, Faker } from '@faker-js/faker';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChevronRight } from 'lucide-react';
import type { FC, ReactNode } from 'react';
import { NavigationStack, useNavigation, type NavigationView } from './index.js';

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

// ---------------------------------------------------------------------------
// Demo view
// ---------------------------------------------------------------------------

const ListItem: FC<{ label: string; onPress: () => void }> = ({ label, onPress }) => (
  <button
    type="button"
    onClick={onPress}
    className={`
      flex h-10 w-full cursor-pointer items-center justify-between border-b border-black/10 px-4 text-left text-sm
      hover:bg-black/5
      dark:border-white/10 dark:hover:bg-white/5
    `}
  >
    <span>{label}</span>
    <ChevronRight
      className={`
        size-4 text-black/30
        dark:text-white/30
      `}
    />
  </button>
);

const ListViewContent: FC<{ view: NavigationView }> = ({ view }) => {
  const { push } = useNavigation();
  const children = childrenOf(view.id);

  // Leaves have nothing to drill into — show the title so the deepest
  // level still reads as a destination rather than a blank panel.
  if (children.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <span
          className={`
            text-sm text-black/50
            dark:text-white/50
          `}
        >
          {view.title}
        </span>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      {children.map((node) => (
        <ListItem key={node.id} label={node.title} onPress={() => push({ id: node.id, title: node.title })} />
      ))}
    </div>
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
    headerHeight: { control: { type: 'range', min: 48, max: 140, step: 4 } },
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
        story:
          'Drill in by tapping a row; go back with the header button or the Escape key. Views stay mounted underneath, so returning to one preserves its scroll position rather than rebuilding it.',
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
        story: 'Title and back button only. The header keeps its height, so the content area does not shift.',
      },
    },
  },
};
