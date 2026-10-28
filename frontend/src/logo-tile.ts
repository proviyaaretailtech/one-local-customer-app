// One look for every brand/store logo in the app: no outline and no shadow, just the logo itself, fitted
// ("contain") into a fixed square that it nearly fills, so round, square and wide logos all read at one size.
// The rounded clip stays, so logos drawn on a white square still look finished on tinted backgrounds.
// Two sizes: small (lists, cart, product) and large (rails, page headers).
import type { ViewStyle } from 'react-native';

export const LOGO_TILE_BG = 'transparent';
export const logoShadow: ViewStyle['boxShadow'] = [{ offsetX: 0, offsetY: 6, blurRadius: 14, color: 'rgba(11,31,22,0.10)' }];

const base: ViewStyle = { backgroundColor: LOGO_TILE_BG, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' };

/** A logo tile `size` points square: radius scales with size (14 at 48, 20 at 72). The image inside is `logoSize(size)`. */
export function logoTile(size: number): ViewStyle {
  return { ...base, width: size, height: size, borderRadius: size <= 52 ? 14 : 20 };
}
/** The square the logo image is fitted into, about 94% of the tile (tight, no padding ring). */
export const logoSize = (size: number) => Math.round(size * 0.94);
