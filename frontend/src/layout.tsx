// Responsive frame. Phones and portrait tablets use the whole screen. Wider screens (landscape iPad,
// laptop, desktop web) show the app as a centred column on a black/neon backdrop — with a brand
// panel on very wide screens — so every screen keeps its designed proportions.
// Components size themselves with useAppDimensions() (the column), never the raw window width.
import { createContext, useContext } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { colors } from './theme';
import { OneGlyph } from './components/one-button';

export const MAX_APP_WIDTH = 820;
const FRAME_FROM = MAX_APP_WIDTH + 40;
const PANEL_FROM = 1280;
const INK = '#050605';

const AppWidth = createContext<number | null>(null);

export function useAppDimensions() {
  const window = useWindowDimensions();
  const width = useContext(AppWidth);
  return { ...window, width: width ?? window.width };
}

// Columns for product grids: 3 on phones, 4 from small tablets up.
export const gridColumns = (width: number) => (width >= 600 ? 4 : 3);

export function AppFrame({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  if (width < FRAME_FROM) return <AppWidth.Provider value={width}>{children}</AppWidth.Provider>;
  const panel = width >= PANEL_FROM;
  return <AppWidth.Provider value={MAX_APP_WIDTH}>
    <View testID="app-frame" style={s.backdrop}>
      <View style={s.glowA} /><View style={s.glowB} />
      {panel && <View style={s.panel}>
        <View style={s.brand}><OneGlyph size={44} /><Text style={s.brandWord}>neCity</Text></View>
        <Text style={s.headline}>Latur,{'\n'}in minutes.</Text>
        <Text style={s.copy}>Groceries, food, shops, care and good times — one city, one app.</Text>
        <View style={s.chips}>{['Food', 'Groceries', 'Shops', 'Care', 'Book It'].map(c => <View key={c} style={s.chip}><Text style={s.chipText}>{c}</Text></View>)}</View>
      </View>}
      <View style={s.column}>{children}</View>
    </View>
  </AppWidth.Provider>;
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: INK, flexDirection: 'row', alignItems: 'stretch', justifyContent: 'center', overflow: 'hidden' },
  glowA: { position: 'absolute', left: -200, top: -160, width: 520, height: 520, borderRadius: 260, backgroundColor: colors.lime, opacity: 0.08 },
  glowB: { position: 'absolute', right: -220, bottom: -200, width: 560, height: 560, borderRadius: 280, backgroundColor: colors.electricLime, opacity: 0.06 },
  column: { width: MAX_APP_WIDTH, overflow: 'hidden', backgroundColor: colors.surface, boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 60, color: 'rgba(179,244,0,0.12)' }] },
  panel: { width: 360, justifyContent: 'center', paddingRight: 56 },
  brand: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  brandWord: { color: '#fff', fontSize: 30, fontWeight: '800', letterSpacing: -1, marginBottom: 2 },
  headline: { color: '#fff', fontSize: 48, lineHeight: 52, fontWeight: '800', letterSpacing: -1.8, marginTop: 28 },
  copy: { color: 'rgba(255,255,255,0.62)', fontSize: 15, lineHeight: 23, marginTop: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 24 },
  chip: { borderWidth: 1, borderColor: 'rgba(179,244,0,0.4)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { color: colors.electricLime, fontSize: 12, fontWeight: '700' },
});
