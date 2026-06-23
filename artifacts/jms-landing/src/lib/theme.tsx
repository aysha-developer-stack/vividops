import React, { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useGetUserSettings, getGetUserSettingsQueryKey } from "@workspace/api-client-react";
import { useAuth } from "./auth";

export type Theme = "light" | "dark" | "system";

export interface ThemeContextType {
  theme: Theme;
  accentColor: string;
  compactMode: boolean;
  dateFormat: string;
  currency: string;
  timezone: string;
  language: string;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const { data: settings } = useGetUserSettings({
    query: {
      queryKey: getGetUserSettingsQueryKey(),
      enabled: !!user,
      staleTime: Infinity,
    },
  });

  const [currentTheme, setCurrentTheme] = useState<Theme>("light");
  const [currentAccent, setCurrentAccent] = useState("#0B7EB9");
  const [currentCompact, setCurrentCompact] = useState(false);
  const [currentDateFormat, setCurrentDateFormat] = useState("MM/DD/YYYY");
  const [currentCurrency, setCurrentCurrency] = useState("USD ($)");
  const [currentTimezone, setCurrentTimezone] = useState("UTC");
  const [currentLanguage, setCurrentLanguage] = useState("English (US)");

  useEffect(() => {
    if (settings) {
      if (settings.theme) setCurrentTheme(settings.theme as Theme);
      if (settings.accentColor) setCurrentAccent(settings.accentColor);
      if (settings.compactMode !== undefined) setCurrentCompact(settings.compactMode);
      if (settings.dateFormat) setCurrentDateFormat(settings.dateFormat);
      if (settings.currency) setCurrentCurrency(settings.currency);
      if (settings.timezone) setCurrentTimezone(settings.timezone);
      if (settings.language) setCurrentLanguage(settings.language);
    }
  }, [settings]);

  useEffect(() => {
    const applyTheme = () => {
      const root = window.document.documentElement;
      
      // Apply theme
      root.classList.remove("light", "dark");
      if (currentTheme === "system") {
        const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        root.classList.add(systemTheme);
      } else {
        root.classList.add(currentTheme);
      }

      // Apply accent color
      if (currentAccent && currentAccent.startsWith("#")) {
        const hsl = hexToHSL(currentAccent);
        if (hsl) root.style.setProperty("--primary", hsl);
      }
      
      // Apply compact mode
      if (currentCompact) {
        root.classList.add("compact-mode");
      } else {
        root.classList.remove("compact-mode");
      }
    };

    applyTheme();

    // Listen for system theme changes
    if (currentTheme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => applyTheme();
      mediaQuery.addEventListener("change", handler);
      return () => mediaQuery.removeEventListener("change", handler);
    }
    return undefined;
  }, [currentTheme, currentAccent, currentCompact]);

  return (
    <ThemeContext.Provider value={{ 
      theme: currentTheme, 
      accentColor: currentAccent, 
      compactMode: currentCompact,
      dateFormat: currentDateFormat,
      currency: currentCurrency,
      timezone: currentTimezone,
      language: currentLanguage
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};

// Helper to convert Hex to HSL for Tailwind variables
function hexToHSL(hex: string): string | null {
  let r = 0, g = 0, b = 0;
  
  // Clean hex string
  const cleanHex = hex.replace("#", "");
  
  if (cleanHex.length === 3) {
    r = parseInt(cleanHex[0] + cleanHex[0], 16);
    g = parseInt(cleanHex[1] + cleanHex[1], 16);
    b = parseInt(cleanHex[2] + cleanHex[2], 16);
  } else if (cleanHex.length === 6) {
    r = parseInt(cleanHex.substring(0, 2), 16);
    g = parseInt(cleanHex.substring(2, 4), 16);
    b = parseInt(cleanHex.substring(4, 6), 16);
  } else {
    return null;
  }

  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;

  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

