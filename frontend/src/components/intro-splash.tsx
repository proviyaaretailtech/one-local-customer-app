// First-launch intro, drawn in code (no video, nothing to download, works offline), ~2.3 s:
//   1. the app-icon tile sits exactly where the native launch screen put it, then lifts away,
//   2. a light city skyline rises building by building from the horizon, a soft lime sun behind it,
//   3. a green road unrolls towards the viewer,
//   4. the OneLocal wordmark settles in once above the skyline, then everything fades into the app.
// Runs on the UI thread (Reanimated), so the app loading behind it can't make it stutter. Tap anywhere to skip.
// Only once per install (founder, 2026-10-29): when it ends or is skipped a flag is saved, and every later launch
// shows just the native splash (the same icon tile) and goes straight into the app.
// With Reduce Motion the finished picture shows briefly and fades.
// A plain timer always removes the intro, whatever the animation does: an intro that never left kept a frozen
// picture over the app and held back every pop-up (tester report, 2026-10-31).
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, interpolate, Extrapolation, useAnimatedStyle, useSharedValue, withDelay, withTiming, type SharedValue } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import Svg, { Defs, LinearGradient, Polygon, Rect, Stop } from 'react-native-svg';
import { useMotionAllowed } from '../motion';
import { useTranslation } from '../i18n';
import { BrandLogo, BRAND_GREEN } from './brand-logo';

const TILE = require('../../assets/images/splash-icon.png');   // the native launch screen's image
const launch = globalThis as unknown as { __onecityIntroPlayed?: boolean; __onecityIntroShowing?: boolean };
const SKY = '#F6F8F3';            // same as the native launch screen background
const SEEN_KEY = 'onelocal.intro.seen';
const TOTAL_MS = 2300;
const outExpo = Easing.bezier(0.16, 1, 0.3, 1);

// Skyline, left to right: x and width as a share of the screen width, height as a share of the skyline band,
// tone 0 = far (paler), 1 = near; lime = a strip of lit windows.
const BUILDINGS: { x: number; w: number; h: number; tone: 0 | 1; lime?: boolean }[] = [
  { x: -0.02, w: 0.13, h: 0.55, tone: 1 }, { x: 0.09, w: 0.09, h: 0.78, tone: 0, lime: true }, { x: 0.17, w: 0.12, h: 0.48, tone: 1 },
  { x: 0.27, w: 0.08, h: 0.92, tone: 0 }, { x: 0.34, w: 0.11, h: 0.66, tone: 1, lime: true }, { x: 0.44, w: 0.07, h: 1.0, tone: 0 },
  { x: 0.5, w: 0.12, h: 0.58, tone: 1 }, { x: 0.61, w: 0.08, h: 0.84, tone: 0, lime: true }, { x: 0.68, w: 0.12, h: 0.52, tone: 1 },
  { x: 0.79, w: 0.09, h: 0.74, tone: 0 }, { x: 0.87, w: 0.15, h: 0.6, tone: 1, lime: true },
];

// Keep the native splash up until the intro's first frame, so there is no flash.
void SplashScreen.preventAutoHideAsync().catch(() => {});

export function IntroSplash() {
  // null while the saved flag is read; the native splash stays up meanwhile.
  const [visible, setVisible] = useState<boolean | null>(() => {
    if (launch.__onecityIntroPlayed) return false;
    launch.__onecityIntroShowing = true; // no pop-up during the read either
    return null;
  });
  const { t } = useTranslation(); // safe here: I18nProvider holds the first render until the saved language is loaded
  const motion = useMotionAllowed();
  const { width: W, height: H } = useWindowDimensions();
  const p = useSharedValue(0);     // 0 → 1 over the whole intro
  const exit = useSharedValue(0);
  const ended = useRef(false);

  useEffect(() => {
    if (visible !== null) return;
    let live = true;
    AsyncStorage.getItem(SEEN_KEY)
      .then(seen => { if (live) setVisible(!seen); })
      .catch(() => { if (live) setVisible(true); });
    return () => { live = false; };
  }, [visible]);

  const finish = () => {
    if (ended.current) return;
    ended.current = true;
    AsyncStorage.setItem(SEEN_KEY, '1').catch(() => {});
    exit.value = withTiming(1, { duration: 320, easing: Easing.bezier(0.4, 0, 0.2, 1) });
    // Removed on a plain timer, not the animation's finish callback, so it always goes.
    setTimeout(() => { launch.__onecityIntroShowing = false; setVisible(false); }, 340);
  };

  useEffect(() => {
    if (visible === null) return;
    void SplashScreen.hideAsync().catch(() => {});
    if (!visible) { launch.__onecityIntroShowing = false; return; }
    launch.__onecityIntroPlayed = true;
    // Read by the pop-up host so no pop-up opens over the intro.
    launch.__onecityIntroShowing = true;
    if (!motion) { p.value = 1; const id = setTimeout(finish, 900); return () => clearTimeout(id); }
    p.value = withTiming(1, { duration: TOTAL_MS - 300, easing: Easing.linear });
    const id = setTimeout(finish, TOTAL_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, motion]);

  // Scene geometry. Tablets and landscape: keep the city a phone-like proportion, centred.
  const sceneW = Math.min(W, H * 0.62);
  const horizon = H * 0.6;
  const bandH = Math.min(H * 0.3, sceneW * 0.7);
  const logoH = Math.round(Math.min(sceneW * 0.15, 64));
  const tile = 140;               // = imageWidth of the native splash

  const screen = useAnimatedStyle(() => ({ opacity: 1 - exit.value }));
  const tileStyle = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.12, 0.3], [1, 1, 0], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(p.value, [0.12, 0.3], [0, -24], Extrapolation.CLAMP) }, { scale: interpolate(p.value, [0.12, 0.3], [1, 0.9], Extrapolation.CLAMP) }],
  }));
  const sun = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0.15, 0.5], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(p.value, [0.15, 0.6], [30, 0], Extrapolation.CLAMP) }],
  }));
  const road = useAnimatedStyle(() => ({ transform: [{ scaleY: interpolate(p.value, [0.3, 0.7], [0, 1], Extrapolation.CLAMP) }] }));
  const logo = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0.5, 0.72], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(p.value, [0.5, 0.8], [18, 0], Extrapolation.CLAMP) }, { scale: interpolate(p.value, [0.5, 0.8], [0.96, 1], Extrapolation.CLAMP) }],
  }));
  const tagline = useAnimatedStyle(() => ({ opacity: interpolate(p.value, [0.68, 0.85], [0, 1], Extrapolation.CLAMP) }));

  if (!visible) return null;
  const left = (W - sceneW) / 2;
  return <Animated.View testID="intro-splash" accessibilityLabel={t('shell.introLoading')} style={[s.screen, screen]}>
    <StatusBar style="dark" />
    <Animated.View style={[s.sun, { width: sceneW * 0.34, height: sceneW * 0.34, left: left + sceneW * 0.6, top: horizon - bandH * 0.95 }, sun]} />
    {/* skyline band, buildings rise out of the horizon */}
    <View style={[s.band, { left, width: sceneW, top: horizon - bandH, height: bandH }]}>
      {BUILDINGS.map((b, i) => <Building key={i} b={b} i={i} p={p} sceneW={sceneW} bandH={bandH} />)}
    </View>
    {/* road unrolls from the horizon towards the viewer */}
    <Animated.View style={[s.road, { top: horizon, height: H - horizon }, road]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs><LinearGradient id="introRoad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#DCEFC7" /><Stop offset="1" stopColor={BRAND_GREEN} stopOpacity={0.85} />
        </LinearGradient></Defs>
        <Rect x="0" y="0" width="100" height="100" fill="#EEF4E8" />
        <Polygon points="44,0 56,0 100,100 0,100" fill="url(#introRoad)" />
        {[8, 26, 50, 80].map((y, i) => <Polygon key={i} points={`${49.6 - y * 0.012},${y} ${50.4 + y * 0.012},${y} ${50.6 + (y + 6 + i * 3) * 0.014},${y + 6 + i * 3} ${49.4 - (y + 6 + i * 3) * 0.014},${y + 6 + i * 3}`} fill="#FFFFFF" opacity={0.9} />)}
      </Svg>
    </Animated.View>
    <Animated.View style={[s.logo, { top: horizon - bandH - logoH * 2.4 }, logo]}>
      <BrandLogo tone="light" height={logoH} />
    </Animated.View>
    <Animated.Text style={[s.tagline, { top: horizon - bandH - logoH * 2.4 + logoH + 12 }, tagline]}>{t('shell.introTagline')}</Animated.Text>
    {/* the native launch screen's tile, in the same place, handing over to the scene */}
    <Animated.Image source={TILE} style={[s.tile, { width: tile, height: tile, left: (W - tile) / 2, top: (H - tile) / 2 }, tileStyle]} />
    <Pressable style={StyleSheet.absoluteFill} onPress={finish} accessibilityRole="button" />
  </Animated.View>;
}

function Building({ b, i, p, sceneW, bandH }: { b: (typeof BUILDINGS)[number]; i: number; p: SharedValue<number>; sceneW: number; bandH: number }) {
  const start = 0.18 + (i % 6) * 0.035 + (b.tone ? 0.04 : 0);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(p.value, [start, start + 0.28], [b.h * bandH, 0], Extrapolation.CLAMP) }] }));
  const h = b.h * bandH;
  return <Animated.View style={[s.building, { left: b.x * sceneW, width: b.w * sceneW, height: h, top: bandH - h, backgroundColor: b.tone ? '#E4E9E1' : '#EEF1EB' }, style]}>
    {b.lime && <View style={[s.windows, { top: h * 0.14, height: h * 0.6 }]} />}
  </Animated.View>;
}

const s = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFill, zIndex: 1000, backgroundColor: SKY, overflow: 'hidden' },
  sun: { position: 'absolute', borderRadius: 999, backgroundColor: '#E9F7C9' },
  band: { position: 'absolute', overflow: 'hidden' },
  building: { position: 'absolute', borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  windows: { position: 'absolute', left: '30%', width: '14%', backgroundColor: BRAND_GREEN, opacity: 0.55, borderRadius: 2 },
  road: { position: 'absolute', left: 0, right: 0, transformOrigin: 'top' },
  logo: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  tagline: { position: 'absolute', left: 0, right: 0, textAlign: 'center', color: '#5E6B5A', fontSize: 11, fontWeight: '700', letterSpacing: 2.6 },
  tile: { position: 'absolute' },
});
