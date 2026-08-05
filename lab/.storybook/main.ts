import type { StorybookConfig } from '@storybook/react-vite';
import { UserConfig } from 'vite';

const viteFinal = (config: UserConfig): UserConfig => {
  return {
    ...config,
    build: {
      ...config.build,
      chunkSizeWarningLimit: 1500,
      sourcemap: process.env.ENABLE_SOURCE_MAP === 'true',
    },
  };
};

const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/**/{,.}*.mdx', '../src/**/{,.}*.stories.{,c,m}{j,t}s{,x}'],
  addons: ['@storybook/addon-docs'],
  viteFinal,
  docs: {
    //👇 See the table below for the list of supported options
    defaultName: 'Documentation',
  },
};

export default config;
