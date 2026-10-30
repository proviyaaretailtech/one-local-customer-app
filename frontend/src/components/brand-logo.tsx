// The OneLocal wordmark, drawn as vector outlines (brand-wordmark-paths.ts) so it is sharp at every size and shows
// instantly, offline, with nothing to download.
// tone 'light' = on white/light screens (black "One", green "Local", the founder's green #76EC00, 2026-10-31);
// 'dark' = on photos and coloured headers: black "One", white "Local", no background (founder, 2026-10-29);
// 'ink' = on the app's near-black: white "One", green "Local".
// The box keeps the old PNG's proportions (900×188) so screens laid out around it do not move.
import { useEffect } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { WORDMARK_LOCAL, WORDMARK_ONE, WORDMARK_VIEWBOX } from './brand-wordmark-paths';

export const BRAND_INK = '#0B1A10';
export const BRAND_GREEN = '#76EC00';
const FILLS = {
  light: { one: BRAND_INK, local: BRAND_GREEN },
  dark: { one: BRAND_INK, local: '#FFFFFF' },
  ink: { one: '#FFFFFF', local: BRAND_GREEN },
} as const;
const RATIO = 900 / 188;

export function BrandLogo({ tone, height, testID, style, onLoad }: { tone: keyof typeof FILLS; height: number; testID?: string; style?: StyleProp<ViewStyle>; onLoad?: () => void }) {
  // Nothing to load any more; still tell callers that wait for the logo to be drawn.
  useEffect(() => { onLoad?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const fill = FILLS[tone];
  // i18n-ignore: the brand name, not UI copy
  return <View testID={testID} accessible accessibilityRole="image" accessibilityLabel="OneLocal" style={[{ height, width: Math.round(height * RATIO), justifyContent: 'center' }, style]}>
    <Svg width="100%" height="100%" viewBox={WORDMARK_VIEWBOX} preserveAspectRatio="xMidYMid meet">
      <Path d={WORDMARK_ONE} fill={fill.one} />
      <Path d={WORDMARK_LOCAL} fill={fill.local} />
    </Svg>
  </View>;
}
