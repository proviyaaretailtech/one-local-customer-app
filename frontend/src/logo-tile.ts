// One look for every brand/store logo in the app: a white tile, a hairline border, one soft shadow, and the logo
// fitted ("contain") inside a fixed square with padding, so round, square and wide logos all read at one size.
// Two sizes: small (lists, cart, product) and large (rails, page headers).
import type { ViewStyle } from 'react-native';

export const LOGO_TILE_BG = '#FFFFFF';
export const LOGO_TILE_BORDER = '#EEF2EF';
export const logoShadow: ViewStyle['boxShadow'] = [{ offsetX: 0, offsetY: 6, blurRadius: 14, color: 'rgba(11,31,22,0.10)' }];

const base: ViewStyle = { backgroundColor: LOGO_TILE_BG, borderWidth: 1, borderColor: LOGO_TILE_BORDER, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', boxShadow: logoShadow };

/** A logo tile `size` points square: radius scales with size (14 at 48, 20 at 72). The image inside is `logoSize(size)`. */
export function logoTile(size: number): ViewStyle {
  return { ...base, width: size, height: size, borderRadius: size <= 52 ? 14 : 20 };
}
/** The square the logo image is fitted into, about 72% of the tile. */
export const logoSize = (size: number) => Math.round(size * 0.72);
