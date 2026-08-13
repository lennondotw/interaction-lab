import type { SpacedScript } from '@monorepo/utils';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useArgs } from 'storybook/preview-api';

import { SPACING_GROUPS } from './junction-spacing-cases.js';
import { JunctionSpacingBoard, JunctionVerdicts, type JunctionSpacingOptions } from './junction-spacing.js';

/*
 * Both switches live in the args, and the buttons inside the board write back
 * through updateArgs, so the controls panel and the in-page buttons are one pair
 * of values rather than two that drift.
 *
 * useArgs is a Storybook hook, not a React one: its context is only live while
 * the story function itself runs, so it has to be called in `render` directly.
 * Moving it into a nested component throws "Rendered more hooks than during the
 * previous render", because by then Storybook has moved on.
 */
interface Args extends JunctionSpacingOptions {
  groupId?: string;
  isolateDynamic?: boolean;
  scripts?: readonly SpacedScript[];
}

const meta: Meta<Args> = {
  args: {
    disableJunctionSpacing: false,
    disableTextHighlight: false,
  },
  argTypes: {
    disableJunctionSpacing: { control: 'boolean' },
    disableTextHighlight: { control: 'boolean' },
    groupId: { control: false },
    isolateDynamic: { control: 'boolean' },
  },
  parameters: {
    layout: 'fullscreen',
  },
  title: 'Demos/JunctionSpacing',
};

export default meta;

type Story = StoryObj<Args>;

const groupsFor = (groupId: string | undefined) =>
  groupId === undefined ? undefined : SPACING_GROUPS.filter((group) => group.id === groupId);

const board = (args: Args, updateArgs: (patch: Partial<Args>) => void) => (
  <JunctionSpacingBoard
    disableJunctionSpacing={args.disableJunctionSpacing}
    disableTextHighlight={args.disableTextHighlight}
    groups={groupsFor(args.groupId)}
    isolateDynamic={args.isolateDynamic}
    onOptionsChange={updateArgs}
    scripts={args.scripts}
  />
);

const group = (groupId: string): Story => ({
  args: { groupId },
  render: (args) => {
    const [, updateArgs] = useArgs();

    return board(args, updateArgs);
  },
});

export const Basics = group('basics');

export const SpacesTheCopyHas = group('boundary-spaces');

export const WideScripts = group('wide-scripts');

export const WhichLocalesTakeTheSpace = group('locale-policy');

/**
 * The same rows with kana and Hangul added to the policy, which is what treating
 * "wide" as one category produces — and what the first version of this board
 * shipped. Every row that changes is wrong: `Macを` and `Mac으로` take a particle,
 * `お近くのApple Store` is flush on apple.com/jp, and Korean has already spaced
 * its word boundaries in the copy.
 */
export const WhichLocalesTakeTheSpaceIfEveryWideScriptCounted: Story = {
  args: { groupId: 'locale-policy', scripts: ['han', 'kana', 'hangul'] },
  render: (args) => {
    const [, updateArgs] = useArgs();

    return board(args, updateArgs);
  },
};

export const Punctuation = group('punctuation');

export const GraphemesAndEmoji = group('graphemes');

export const ScriptsAndBidi = group('scripts-and-bidi');

/**
 * The same cases with the dynamic run left un-isolated, which is what a caller
 * gets by default. The spacing decisions are identical — every difference here
 * is the bidi algorithm reordering runs the space sits between, and it is the
 * reason the RTL guidance is about the renderer rather than about this function.
 */
export const ScriptsAndBidiWithoutIsolate: Story = {
  args: { groupId: 'scripts-and-bidi', isolateDynamic: false },
  render: (args) => {
    const [, updateArgs] = useArgs();

    return board(args, updateArgs);
  },
};

/**
 * Junctions asked one at a time, including the four asymmetries: a bracket or
 * quote takes its space outside the pair, and halfwidth punctuation takes its
 * space on the far side of the run it binds to.
 */
export const SingleJunctions: Story = {
  render: (args) => {
    const [, updateArgs] = useArgs();

    return (
      <JunctionVerdicts
        disableJunctionSpacing={args.disableJunctionSpacing}
        disableTextHighlight={args.disableTextHighlight}
        onOptionsChange={updateArgs}
        pairs={[
          ['你好', 'world'],
          ['hello', '世界'],
          ['你好', '世界'],
          ['hello', 'world'],
          ['中文', '(hello)'],
          ['(', '中文'],
          ['(hello)', '中文'],
          ['中文', ')'],
          ['他说', '«سلام»'],
          ['版本 v1.2:', '中文说明'],
          ['中文', ',请稍候'],
          ['他说,', 'hello'],
          ['版本 1.', '2'],
          ['한국', 'word'],
          ['ＡＢＣ', '中文'],
          ['「引用」', 'quote'],
          ['李明', "'s profile"],
        ]}
      />
    );
  },
};

export const AllCases: Story = {
  render: (args) => {
    const [, updateArgs] = useArgs();

    return board(args, updateArgs);
  },
};
