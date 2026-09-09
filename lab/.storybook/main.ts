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

  // Use the standalone lab.lennon.sh analytics site, independent of Pages.
  // This is the public beacon identifier, not the deployment API credential.
  const beacon = `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"df2afb915d614581a4c172bcde696094"}'></script>`;
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
