import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { useColorScheme, Appearance } from "react-native";
import { storage } from "@/src/utils/storage";

export type ThemeMode = "system" | "light" | "dark";

export type Palette = {
  bg: string;
  surface: string;
  surfaceElevated: string;
  surfaceMuted: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  primaryDim: string;
  accent: string;
  danger: string;
  success: string;
  warning: string;
  gradient: readonly [string, string, string];
  gradientSoft: readonly [string, string];
  shadow: string;
  overlay: string;
};

const light: Palette = {
  bg: "#F5F5F7",
  surface: "#FFFFFF",
  surfaceElevated: "#FFFFFF",
  surfaceMuted: "#EDEDF2",
  border: "#E5E5EA",
  text: "#0B0B0F",
  textMuted: "#6E6E73",
  primary: "#5E5CE6",
  primaryDim: "#8987F0",
  accent: "#FF375F",
  danger: "#FF3B30",
  success: "#34C759",
  warning: "#FF9F0A",
  gradient: ["#6366F1", "#A855F7", "#EC4899"] as const,
  gradientSoft: ["#EEF2FF", "#FDF2F8"] as const,
  shadow: "rgba(15, 23, 42, 0.08)",
  overlay: "rgba(0,0,0,0.35)",
};

const dark: Palette = {
  bg: "#000000",
  surface: "#111114",
  surfaceElevated: "#1B1B20",
  surfaceMuted: "#141419",
  border: "#26262C",
  text: "#F6F6F8",
  textMuted: "#8E8E93",
  primary: "#7C7BFF",
  primaryDim: "#A5A4FF",
  accent: "#FF5C8A",
  danger: "#FF453A",
  success: "#30D158",
  warning: "#FFD60A",
  gradient: ["#7C3AED", "#EC4899", "#F97316"] as const,
  gradientSoft: ["#1E1B4B", "#3B0764"] as const,
  shadow: "rgba(0, 0, 0, 0.6)",
  overlay: "rgba(0,0,0,0.55)",
};

type Ctx = {
  mode: ThemeMode;
  isDark: boolean;
  colors: Palette;
  setMode: (m: ThemeMode) => void;
};

const ThemeContext = createContext<Ctx | null>(null);
const KEY = "wimp_theme_mode";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [systemScheme, setSystemScheme] = useState(system);

  useEffect(() => {
    (async () => {
      const stored = await storage.getItem<string>(KEY, "system");
      if (stored === "light" || stored === "dark" || stored === "system") {
        setModeState(stored);
      }
    })();
  }, []);

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => setSystemScheme(colorScheme));
    return () => sub.remove();
  }, []);

  const isDark = mode === "dark" || (mode === "system" && (systemScheme ?? system) === "dark");

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    storage.setItem(KEY, m);
  };

  const value = useMemo<Ctx>(
    () => ({ mode, isDark, colors: isDark ? dark : light, setMode }),
    [mode, isDark]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Ctx {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme outside ThemeProvider");
  return ctx;
}
