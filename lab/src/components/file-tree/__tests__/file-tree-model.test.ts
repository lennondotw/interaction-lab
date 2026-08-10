/**
 * Tests for the tree's data layer and its keyboard contract. Both are exported as
 * pure functions precisely so this can be checked without mounting anything — which
 * is also the only kind of test this workspace can run.
 */

import { describe, expect, it } from 'vitest';

import {
  collectDefaultExpandedIds,
  collectSubtreeFolderIds,
  flattenVisibleRows,
  resolveKeyIntent,
  siblingRows,
  type FileTreeNode,
} from '../file-tree-model.js';

/** A trimmed macOS root, deep enough to have a grandchild and a leaf at depth 0. */
const nodes: FileTreeNode[] = [
  {
    children: [
      {
        children: [{ id: '/Applications/Utilities/Terminal.app', name: 'Terminal.app' }],
        id: '/Applications/Utilities',
        name: 'Utilities',
      },
      { id: '/Applications/Safari.app', name: 'Safari.app' },
    ],
    id: '/Applications',
    name: 'Applications',
  },
  { children: [{ id: '/etc/hosts', name: 'hosts' }], id: '/etc', name: 'etc' },
  { id: '/.VolumeIcon.icns', name: '.VolumeIcon.icns' },
];

const expanded = (...ids: string[]): ReadonlySet<string> => new Set(ids);

const idsOf = (rows: readonly { node: FileTreeNode }[]): string[] => rows.map((row) => row.node.id);

const rowsWith = (...ids: string[]) => flattenVisibleRows(nodes, expanded(...ids));

describe('isFolderNode, through siblingRows', () => {
  it('treats a node with children as a folder and one without as a file', () => {
    const [applications, , volumeIcon] = siblingRows(nodes, [], expanded());

    expect(applications?.isFolder).toBe(true);
    expect(volumeIcon?.isFolder).toBe(false);
  });

  it('honours an explicit kind, so a folder whose children have not loaded still discloses', () => {
    const [row] = siblingRows([{ id: '/Volumes', kind: 'folder', name: 'Volumes' }], [], expanded());

    expect(row?.isFolder).toBe(true);
  });

  it('treats an empty children array as a folder, the way an empty directory is one', () => {
    const [row] = siblingRows([{ children: [], id: '/cores', name: 'cores' }], [], expanded());

    expect(row?.isFolder).toBe(true);
  });
});

describe('collectDefaultExpandedIds', () => {
  it('collects marked ids at every depth', () => {
    const marked: FileTreeNode[] = [
      {
        children: [{ children: [{ id: 'c', name: 'c' }], defaultExpanded: true, id: 'b', name: 'b' }],
        defaultExpanded: true,
        id: 'a',
        name: 'a',
      },
      { children: [{ id: 'e', name: 'e' }], id: 'd', name: 'd' },
    ];

    expect(collectDefaultExpandedIds(marked)).toEqual(['a', 'b']);
  });

  it('descends into collapsed folders, so a marked grandchild is not missed', () => {
    const marked: FileTreeNode[] = [
      { children: [{ children: [], defaultExpanded: true, id: 'inner', name: 'inner' }], id: 'outer', name: 'outer' },
    ];

    expect(collectDefaultExpandedIds(marked)).toEqual(['inner']);
  });
});

describe('collectSubtreeFolderIds', () => {
  const applications = nodes[0] as FileTreeNode;

  it('collects the folder and every folder below it, skipping files', () => {
    expect(collectSubtreeFolderIds(applications)).toEqual(['/Applications', '/Applications/Utilities']);
  });

  it('reaches folders that no expansion state can make visible', () => {
    // The whole point of walking the nodes rather than the rows: with nothing
    // expanded, `/Applications/Utilities` is not a row at all, and a recursive expand
    // that could only see rows would open one level per press.
    const visibleIds = flattenVisibleRows(nodes, expanded()).map((row) => row.node.id);

    expect(visibleIds).not.toContain('/Applications/Utilities');
    expect(collectSubtreeFolderIds(applications)).toContain('/Applications/Utilities');
  });

  it('is empty for a file, so recursing on a leaf is a no-op rather than a special case', () => {
    expect(collectSubtreeFolderIds({ id: '/mach_kernel', name: 'mach_kernel' })).toEqual([]);
  });
});

describe('flattenVisibleRows', () => {
  it('lists only what is on screen, in visual order', () => {
    expect(idsOf(rowsWith())).toEqual(['/Applications', '/etc', '/.VolumeIcon.icns']);
  });

  it('splices children in directly below their parent rather than after its siblings', () => {
    expect(idsOf(rowsWith('/Applications'))).toEqual([
      '/Applications',
      '/Applications/Utilities',
      '/Applications/Safari.app',
      '/etc',
      '/.VolumeIcon.icns',
    ]);
  });

  it('ignores an expanded id whose ancestor is collapsed', () => {
    // The grandchild is expanded and its parent is not, so neither may appear.
    expect(idsOf(rowsWith('/Applications/Utilities'))).toEqual(['/Applications', '/etc', '/.VolumeIcon.icns']);
  });

  it('ignores an expanded id belonging to a file', () => {
    const rows = rowsWith('/.VolumeIcon.icns');

    expect(rows.at(-1)?.isExpanded).toBe(false);
  });

  it('records depth and the full ancestor chain', () => {
    const rows = rowsWith('/Applications', '/Applications/Utilities');
    const terminal = rows.find((row) => row.node.id === '/Applications/Utilities/Terminal.app');

    expect(terminal?.depth).toBe(2);
    expect(terminal?.parentIds).toEqual(['/Applications', '/Applications/Utilities']);
  });

  it('counts position and set size within siblings, not within the flattened list', () => {
    const rows = rowsWith('/Applications');
    const safari = rows.find((row) => row.node.id === '/Applications/Safari.app');
    const etc = rows.find((row) => row.node.id === '/etc');

    // Safari is the second of two children, even though it is the third row.
    expect([safari?.positionInSet, safari?.setSize]).toEqual([2, 2]);
    expect([etc?.positionInSet, etc?.setSize]).toEqual([2, 3]);
  });
});

describe('resolveKeyIntent', () => {
  it('returns nothing when no row is focused, or the focused row is gone', () => {
    expect(resolveKeyIntent(rowsWith(), null, 'ArrowDown')).toBeNull();
    expect(resolveKeyIntent(rowsWith(), '/nonexistent', 'ArrowDown')).toBeNull();
  });

  it('returns nothing for a key it does not own', () => {
    expect(resolveKeyIntent(rowsWith(), '/etc', 'a')).toBeNull();
  });

  describe('ArrowDown and ArrowUp', () => {
    it('step through visible rows across levels', () => {
      const rows = rowsWith('/Applications');

      expect(resolveKeyIntent(rows, '/Applications', 'ArrowDown')).toEqual({
        id: '/Applications/Utilities',
        type: 'focus',
      });
      expect(resolveKeyIntent(rows, '/etc', 'ArrowUp')).toEqual({
        id: '/Applications/Safari.app',
        type: 'focus',
      });
    });

    it('stop at the ends rather than wrapping', () => {
      expect(resolveKeyIntent(rowsWith(), '/.VolumeIcon.icns', 'ArrowDown')).toBeNull();
      expect(resolveKeyIntent(rowsWith(), '/Applications', 'ArrowUp')).toBeNull();
    });
  });

  describe('ArrowRight', () => {
    it('opens a closed folder without moving', () => {
      expect(resolveKeyIntent(rowsWith(), '/Applications', 'ArrowRight')).toEqual({
        ids: ['/Applications'],
        type: 'expand',
      });
    });

    it('steps into an open folder', () => {
      expect(resolveKeyIntent(rowsWith('/Applications'), '/Applications', 'ArrowRight')).toEqual({
        id: '/Applications/Utilities',
        type: 'focus',
      });
    });

    it('does nothing on a file', () => {
      expect(resolveKeyIntent(rowsWith(), '/.VolumeIcon.icns', 'ArrowRight')).toBeNull();
    });

    it('does not step onto an ancestor from an open but empty folder', () => {
      // The row after an empty open folder belongs to a shallower level, so
      // following it blindly would read as ArrowRight jumping backwards out of the
      // subtree it was supposed to enter.
      const withEmpty: FileTreeNode[] = [
        { children: [], id: '/cores', name: 'cores' },
        { id: '/mach_kernel', name: 'mach_kernel' },
      ];
      const rows = flattenVisibleRows(withEmpty, expanded('/cores'));

      expect(resolveKeyIntent(rows, '/cores', 'ArrowRight')).toBeNull();
    });
  });

  describe('ArrowLeft', () => {
    it('closes an open folder without moving', () => {
      expect(resolveKeyIntent(rowsWith('/etc'), '/etc', 'ArrowLeft')).toEqual({ ids: ['/etc'], type: 'collapse' });
    });

    it('climbs to the parent from a closed folder', () => {
      const rows = rowsWith('/Applications');

      expect(resolveKeyIntent(rows, '/Applications/Utilities', 'ArrowLeft')).toEqual({
        id: '/Applications',
        type: 'focus',
      });
    });

    it('climbs to the parent from a file', () => {
      const rows = rowsWith('/Applications');

      expect(resolveKeyIntent(rows, '/Applications/Safari.app', 'ArrowLeft')).toEqual({
        id: '/Applications',
        type: 'focus',
      });
    });

    it('does nothing at the root level', () => {
      expect(resolveKeyIntent(rowsWith(), '/etc', 'ArrowLeft')).toBeNull();
    });
  });

  describe('with the Alt modifier', () => {
    const recursive = { recursive: true };

    it('opens the focused folder and everything inside it', () => {
      expect(resolveKeyIntent(rowsWith(), '/Applications', 'ArrowRight', recursive)).toEqual({
        ids: ['/Applications', '/Applications/Utilities'],
        type: 'expand',
      });
    });

    it('closes the focused folder and everything inside it', () => {
      const rows = rowsWith('/Applications', '/Applications/Utilities');

      expect(resolveKeyIntent(rows, '/Applications', 'ArrowLeft', recursive)).toEqual({
        ids: ['/Applications', '/Applications/Utilities'],
        type: 'collapse',
      });
    });

    it('never moves focus, not even on an already-open folder', () => {
      // Plain ArrowRight would step into the first child here. With Alt it stays put
      // and opens what is inside instead, so the modifier only ever means "more of
      // the same thing", never "a different thing".
      const rows = rowsWith('/Applications');

      expect(resolveKeyIntent(rows, '/Applications', 'ArrowRight', recursive)?.type).toBe('expand');
    });

    it('collapses a folder that is already closed, clearing state under it', () => {
      // Visually a no-op, and deliberately still a collapse: it is what makes
      // reopening the folder show one level rather than however deep it was left.
      const rows = rowsWith('/Applications/Utilities');

      expect(resolveKeyIntent(rows, '/Applications', 'ArrowLeft', recursive)).toEqual({
        ids: ['/Applications', '/Applications/Utilities'],
        type: 'collapse',
      });
    });

    it('leaves a file to the unmodified behaviour', () => {
      const rows = rowsWith('/Applications');

      expect(resolveKeyIntent(rows, '/Applications/Safari.app', 'ArrowRight', recursive)).toBeNull();
      expect(resolveKeyIntent(rows, '/Applications/Safari.app', 'ArrowLeft', recursive)).toEqual({
        id: '/Applications',
        type: 'focus',
      });
    });
  });

  describe('Home and End', () => {
    it('jump to the first and last visible row', () => {
      const rows = rowsWith('/etc');

      expect(resolveKeyIntent(rows, '/etc', 'Home')).toEqual({ id: '/Applications', type: 'focus' });
      expect(resolveKeyIntent(rows, '/Applications', 'End')).toEqual({ id: '/.VolumeIcon.icns', type: 'focus' });
    });
  });

  describe('Enter and Space', () => {
    it('activate, whatever the row is — expansion is never decided here', () => {
      for (const key of ['Enter', ' ']) {
        expect(resolveKeyIntent(rowsWith(), '/.VolumeIcon.icns', key)).toEqual({
          id: '/.VolumeIcon.icns',
          type: 'activate',
        });
        expect(resolveKeyIntent(rowsWith('/etc'), '/etc', key)).toEqual({ id: '/etc', type: 'activate' });
      }
    });
  });

  describe('the asterisk', () => {
    it('opens every folder beside the focused row, and no file', () => {
      expect(resolveKeyIntent(rowsWith(), '/etc', '*')).toEqual({
        ids: ['/Applications', '/etc'],
        type: 'expand',
      });
    });

    it('is scoped to the level the focused row is on', () => {
      const rows = rowsWith('/Applications');

      expect(resolveKeyIntent(rows, '/Applications/Utilities', '*')).toEqual({
        ids: ['/Applications/Utilities'],
        type: 'expand',
      });
    });

    it('does nothing where there is no folder to open', () => {
      const rows = flattenVisibleRows([{ id: '/mach_kernel', name: 'mach_kernel' }], expanded());

      expect(resolveKeyIntent(rows, '/mach_kernel', '*')).toBeNull();
    });
  });
});
