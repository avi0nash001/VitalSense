import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  DEFAULT_THEME_ID,
  THEME_DEFINITIONS,
  THEME_LIST,
  THEME_STORAGE_KEY,
  type ThemeDefinition,
  type ThemeId,
  resolveThemeId,
} from '../theme/themes';

interface ThemeContextValue {
  themeId: ThemeId;
  theme: ThemeDefinition;
  themes: ThemeDefinition[];
  setTheme: (next: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyThemeToDocument(theme: ThemeDefinition) {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme.id);
  root.classList.toggle('dark', theme.isDark);

  for (const [token, value] of Object.entries(theme.tokens)) {
    root.style.setProperty(token, value);
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeId>(() => {
    try {
      const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
      return resolveThemeId(saved);
    } catch {
      return DEFAULT_THEME_ID;
    }
  });

  const theme = THEME_DEFINITIONS[themeId];

  useEffect(() => {
    applyThemeToDocument(theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, themeId);
    } catch {
      // Ignore storage quota / privacy mode issues
    }
  }, [themeId, theme]);

  const setTheme = (next: ThemeId) => {
    setThemeId(resolveThemeId(next));
  };

  return (
    <ThemeContext.Provider
      value={{
        themeId,
        theme,
        themes: THEME_LIST,
        setTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return ctx;
}
