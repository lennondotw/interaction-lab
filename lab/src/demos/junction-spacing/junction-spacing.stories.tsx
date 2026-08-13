import type { Meta, StoryObj } from '@storybook/react-vite';

import { SPACING_GROUPS } from './junction-spacing-cases.js';
import { JunctionSpacingBoard, JunctionVerdicts } from './junction-spacing.js';

const meta: Meta = {
  parameters: {
    layout: 'fullscreen',
  },
  title: 'Demos/JunctionSpacing',
};

export default meta;

const group = (id: string) => SPACING_GROUPS.filter((candidate) => candidate.id === id);

export const Basics: StoryObj = {
  render: () => <JunctionSpacingBoard groups={group('basics')} />,
};

export const SpacesTheCopyHas: StoryObj = {
  render: () => <JunctionSpacingBoard groups={group('boundary-spaces')} />,
};

export const WideScripts: StoryObj = {
  render: () => <JunctionSpacingBoard groups={group('wide-scripts')} />,
};

export const Punctuation: StoryObj = {
  render: () => <JunctionSpacingBoard groups={group('punctuation')} />,
};

export const GraphemesAndEmoji: StoryObj = {
  render: () => <JunctionSpacingBoard groups={group('graphemes')} />,
};

export const ScriptsAndBidi: StoryObj = {
  render: () => <JunctionSpacingBoard groups={group('scripts-and-bidi')} />,
};

/**
 * The same cases with the dynamic run left un-isolated, which is what a caller
 * gets by default. The spacing decisions are identical — every difference here
 * is the bidi algorithm reordering runs the space sits between, and it is the
 * reason the RTL guidance is about the renderer rather than about this function.
 */
export const ScriptsAndBidiWithoutIsolate: StoryObj = {
  render: () => <JunctionSpacingBoard groups={group('scripts-and-bidi')} isolateDynamic={false} />,
};

/**
 * Junctions asked one at a time, including the four asymmetries: a bracket or
 * quote takes its space outside the pair, and halfwidth punctuation takes its
 * space on the far side of the run it binds to.
 */
export const SingleJunctions: StoryObj = {
  render: () => (
    <JunctionVerdicts
      pairs={[
        ['你好', 'world'],
        ['hello', '世界'],
        ['你好', '世界'],
        ['hello', 'world'],
        ['中文', '(hello)'],
        ['(', '中文'],
        ['(hello)', '中文'],
        ['中文', ')'],
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
  ),
};

export const AllCases: StoryObj = {
  render: () => <JunctionSpacingBoard />,
};
