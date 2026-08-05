import { useMediaQuery } from '@react-hookz/web';
import { DocsContainer } from '@storybook/addon-docs/blocks';
import { ComponentProps, FC } from 'react';
import { themes } from 'storybook/theming';

type DocsContainerProps = ComponentProps<typeof DocsContainer>;

export const CustomDocsContainer: FC<DocsContainerProps> = ({ children, context, ...props }) => {
  const selectedTheme =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    ((context as any)?.store?.userGlobals?.globals?.theme ?? 'system') as 'light' | 'dark' | 'system';

  const systemTheme = useMediaQuery('(prefers-color-scheme: dark)') ? 'dark' : 'light';
  const resolvedTheme = selectedTheme === 'system' ? systemTheme : selectedTheme;

  const theme = resolvedTheme === 'dark' ? themes.dark : themes.light;

  return (
    <DocsContainer {...props} context={context} theme={theme}>
      {children}
    </DocsContainer>
  );
};
