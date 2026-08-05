import { createContext, ReactNode, useContext } from 'react';

const ThemeContext = createContext<'light' | 'dark' | null>(null);

export const ThemeProvider = ({ children, value }: { children: ReactNode; value: 'light' | 'dark' }) => {
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
