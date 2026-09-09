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

const addCloudflareAnalytics: StorybookConfig['managerHead'] = (head, { configType }) => {
  if (configType !== 'PRODUCTION') return head;

  // Preserve the existing Pages analytics site when serving the build on Workers.
  // This is the public beacon identifier, not the deployment API credential.
  const beacon = `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"a508ed9b8e354a989f82710e4daef568"}'></script>`;
  return `${head ?? ''}\n${beacon}`;
};

const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/**/{,.}*.mdx', '../src/**/{,.}*.stories.{,c,m}{j,t}s{,x}'],
  addons: ['@storybook/addon-docs'],
  viteFinal,
  managerHead: addCloudflareAnalytics,
  previewHead: addCloudflareAnalytics,
  docs: {
    //👇 See the table below for the list of supported options
    defaultName: 'Documentation',
  },
};

export default config;
