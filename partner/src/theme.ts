import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#FFFFFF",
  onSurface: "#1A1A1A",
  surfaceSecondary: "#F5F6F8",
  onSurfaceSecondary: "#1A1A1A",
  surfaceTertiary: "#EAECEF",
  onSurfaceTertiary: "#4A4D52",
  surfaceInverse: "#1A1A1A",
  onSurfaceInverse: "#FFFFFF",
  muted: "#6B7280",

  brand: "#1A1A1A",
  onBrand: "#FFFFFF",
  brandPrimary: "#1A1A1A",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#76EC00",
  onBrandSecondary: "#1A1A1A",
  brandTertiary: "#F1FFD9",
  onBrandTertiary: "#1A1A1A",

  partnerAccent: "#76EC00",
  partnerAccentSoft: "#F1FFD9",
  partnerOnAccent: "#1A1A1A",

  success: "#E6F4EA",
  onSuccess: "#0C831F",
  warning: "#FFF7D6",
  onWarning: "#997300",
  error: "#FFE6E6",
  onError: "#CC0000",
  info: "#F5F6F8",
  onInfo: "#1A1A1A",

  border: "#EAECEF",
  borderStrong: "#D1D5DB",
  divider: "#F5F6F8",

  pastelRed: "#FFE6E6",
  pastelYellow: "#FFF7D6",
  pastelGreen: "#E6F4EA",
  pastelBlue: "#E6F0FF",
  pastelPurple: "#F0E6FF",
  pastelPink: "#FFE6F0",
  pastelOrange: "#FFEDD6",
  pastelMint: "#DDF5EA",
  lime: "#76EC00",
  electricLime: '#B3F400',
  limeSoft: "#F0FFD7",
  forest: "#174D37",
  forestDeep: "#103B2B",

  cream: "#F8F9F5",
  transparent: "transparent",
  overlay: "rgba(0,0,0,0.45)",
  overlayDeep: "rgba(0,0,0,0.85)",
  glass: 'rgba(255,255,255,0.6)',
  glassBright: 'rgba(255,255,255,0.88)',
  shadow: 'rgba(30,64,30,0.07)',
};

export type ThemeColors = typeof light;

export const defaultScheme = "light" satisfies ColorScheme;

export const themes: { light: ThemeColors; dark?: ThemeColors } = { light };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? 'unspecified');
}

setColorScheme?.(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = (system === 'light' || system === 'dark') && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}

export const colors = light;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
  "3xl": 48,
};

export const radius = {
  sm: 14,
  md: 22,
  lg: 28,
  pill: 999,
};
