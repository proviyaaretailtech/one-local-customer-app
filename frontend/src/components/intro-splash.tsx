// First-launch intro (founder, 2026-10-31): on the app's dark green, Indian monuments and everyday icons sketch
// themselves in like a pencil drawing (intro-art.ts; three layers drifting at different speeds for depth), while a
// lime ball drops in, bounces with squash & stretch, lands as the "O" of One and "OneLocal" wipes out of it.
// The phone taps on every bounce and gives one success buzz when the logo locks in.
// Runs on the UI thread (Reanimated), so the app loading behind it can't make it stutter. Tap anywhere to skip.
// Only once per install (founder, 2026-10-29): when it ends or is skipped a flag is saved, and every later launch
// shows just the native splash (the same icon tile) and goes straight into the app.
// With Reduce Motion the finished picture shows briefly and fades, with no haptics.
// A plain timer always removes the intro, whatever the animation does: an intro that never left kept a frozen
// picture over the app and held back every pop-up (tester report, 2026-10-31).
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import Svg, { Circle, Defs, G, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTranslation } from '../i18n';
import { haptic } from '../haptics';
import { BRAND_GREEN } from './brand-logo';
import { WORDMARK_LOCAL, WORDMARK_ONE, WORDMARK_VIEWBOX } from './brand-wordmark-paths';
import { SKETCHES, type Sketch } from './intro-art';

const TILE = require('../../assets/images/splash-icon.png');   // the native launch screen's image
const TILE_SIZE = 140;                                           // = imageWidth of the native splash
const launch = globalThis as unknown as { __onecityIntroPlayed?: boolean; __onecityIntroShowing?: boolean };
const BG = '#0B1A10';                                            // same as the native launch screen background
const PEN = '#E9FFD0';
// v2 (2026-11-01): phones that "saw" the intro while it was stuck on its last frame (below) get it once more.
const SEEN_KEY = 'onelocal.intro.seen.v2';

// Timeline, in seconds.
const END = 3.25;                        // last frame before the fade
const DRAW = 1.2;                        // how long each sketch takes to draw
const T0 = 0.45;                         // the ball starts falling
const BOUNCES: [number, number][] = [[1.0, 900], [1.4, 360], [1.67, 140], [1.85, 40]];   // [touch-down, height of the arc ending there (design px)]
const LANDED = 1.85;
const BEATS: [number, () => void][] = [[1.0, haptic.commit], [1.4, haptic.add], [1.67, haptic.add], [1.85, haptic.tick], [2.2, haptic.success]];

// The canvas is laid out on a 1080×1920 design frame (intro-art.ts).
const FRAME_W = 1080, FRAME_H = 1920;
const LAYERS = [
  { opacity: 0.3, width: 2.2, drift: -18 },    // far skyline
  { opacity: 0.22, width: 2.0, drift: -34 },   // mid band
  { opacity: 0.42, width: 2.6, drift: -60 },   // near icons
];
const BIRDS: [number, number, number, number][] = [[1180, 250, 1.0, 0.6], [1260, 300, 0.8, 0.75], [1330, 230, 0.7, 0.9], [1120, 680, 0.9, 1.3], [1210, 720, 0.7, 1.45]];  // x, y, size, start
const STARS: [number, number][] = [[760, 210], [980, 180], [640, 470], [1010, 470], [120, 330], [330, 230]];

// The wordmark split into its "O" (where the ball lands) and the rest.
const [VB_X, VB_Y, VB_W, VB_H] = WORDMARK_VIEWBOX.split(' ').map(Number);
const ONE_PARTS = WORDMARK_ONE.split('M').filter(Boolean).map(p => `M${p}`);
const O_PATH = ONE_PARTS.slice(0, 2).join('');
const NE_PATH = ONE_PARTS.slice(2).join('');
const O_BOX = [33, -712, 753, 7];        // the O's bounds in WORDMARK_VIEWBOX units

const clamp = (x: number, a = 0, b = 1) => { 'worklet'; return Math.min(b, Math.max(a, x)); };
const prog = (t: number, a: number, b: number) => { 'worklet'; return clamp((t - a) / (b - a)); };
const lerp = (a: number, b: number, x: number) => { 'worklet'; return a + (b - a) * x; };
const outCubic = (x: number) => { 'worklet'; return 1 - (1 - x) ** 3; };
const outExpo = (x: number) => { 'worklet'; return x >= 1 ? 1 : 1 - 2 ** (-10 * x); };
const inOut = (x: number) => { 'worklet'; return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2; };

// Design frame → screen. Tall phones: the frame fills the width, top things hang from the top, the skyline stands on
// the bottom and the extra height opens up around the logo. Wide screens: it fills the height, centred.
function layoutFor(w: number, h: number) {
  const s = Math.min(w / FRAME_W, h / FRAME_H);
  const vw = w / s, vh = h / s, xOff = (vw - FRAME_W) / 2;
  const wmW = 860 * s, wmH = wmW * VB_H / VB_W, u = wmW / VB_W;
  const wmLeft = (w - wmW) / 2, wmTop = h / 2 - 59 * s - wmH / 2;
  return {
    w, h, s, xOff, viewBox: `${-xOff} 0 ${vw} ${vh}`, lift: vh - FRAME_H, wmW, wmH, wmLeft, wmTop,
    oX: wmLeft + ((O_BOX[0] + O_BOX[2]) / 2 - VB_X) * u, oY: wmTop + ((O_BOX[1] + O_BOX[3]) / 2 - VB_Y) * u, r: (O_BOX[3] - O_BOX[1]) * u / 2,
  };
}
type Layout = ReturnType<typeof layoutFor>;

// Where the ball is at time t (screen px): centre, and its squash / stretch.
function ballAt(t: number, oX: number, oY: number, r: number, s: number) {
  'worklet';
  let y = oY, sx = 1, sy = 1, prev = T0;
  for (let i = 0; i < BOUNCES.length; i++) {
    const [land, height] = BOUNCES[i];
    if (t <= land) {
      const x = Math.max(0, (t - prev) / (land - prev));
      const v = i === 0 ? x : Math.abs(2 * x - 1);                 // fast near the ground: stretch
      y = i === 0 ? lerp(-r * 2, oY, x * x) : oY - height * s * (1 - (2 * x - 1) ** 2);
      sy = 1 + 0.2 * v; sx = 1 - 0.12 * v;
      break;
    }
    prev = land;
  }
  for (const [land, height] of BOUNCES) {                          // a moment of squash on every touch-down
    const d = t - land;
    if (d >= 0 && d < 0.07) { const q = (1 - d / 0.07) * (height / 900 + 0.3); sx = 1 + 0.34 * q; sy = 1 - 0.28 * q; y = oY + r * (1 - sy); }
  }
  return { x: lerp(oX - 320 * s, oX, outExpo(prog(t, T0, LANDED))), y, sx, sy };
}

// Keep the native splash up until the intro's first frame, so there is no flash.
void SplashScreen.preventAutoHideAsync().catch(() => {});

export function IntroSplash() {
  // null while the saved flag is read; the native splash stays up meanwhile.
  const [visible, setVisible] = useState<boolean | null>(() => {
    if (launch.__onecityIntroPlayed) return false;
    launch.__onecityIntroShowing = true; // no pop-up during the read either
    return null;
  });
  const { t: tr } = useTranslation(); // safe here: I18nProvider holds the first render until the saved language is loaded
  // null until the phone answers "Remove animations?". The app-wide motion flag starts at "no" and, on a cold start,
  // Android reports the app as not yet in front, so reading that flag here made the intro jump to its last frame:
  // on phones it never played (founder, 2026-11-01). If the answer never comes, the intro plays.
  const [motion, setMotion] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then(reduced => { if (live) setMotion(m => m ?? !reduced); }, () => { if (live) setMotion(m => m ?? true); });
    const fallback = setTimeout(() => { if (live) setMotion(m => m ?? true); }, 500);
    return () => { live = false; clearTimeout(fallback); };
  }, []);
  const win = useWindowDimensions();
  const [box, setBox] = useState({ w: win.width, h: win.height });
  const L = useMemo(() => layoutFor(box.w, box.h), [box]);
  const t = useSharedValue(0);         // seconds since the intro started
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
    exit.value = withTiming(1, { duration: 300, easing: Easing.bezier(0.4, 0, 0.2, 1) });
    // Removed on a plain timer, not the animation's finish callback, so it always goes.
    setTimeout(() => { launch.__onecityIntroShowing = false; setVisible(false); }, 320);
  };

  useEffect(() => {
    // The native splash stays up until it is known whether to animate.
    if (visible === null || (visible && motion === null)) return;
    void SplashScreen.hideAsync().catch(() => {});
    if (!visible) { launch.__onecityIntroShowing = false; return; }
    launch.__onecityIntroPlayed = true;
    // Read by the pop-up host so no pop-up opens over the intro.
    launch.__onecityIntroShowing = true;
    if (!motion) { t.value = END; const id = setTimeout(finish, 900); return () => clearTimeout(id); }
    t.value = withTiming(END, { duration: END * 1000, easing: Easing.linear });
    // No haptics on the web: there is no motor, and browsers refuse vibration before the first tap anyway.
    const timers = Platform.OS === 'web' ? [] : BEATS.map(([at, buzz]) => setTimeout(() => { if (!ended.current) buzz(); }, at * 1000));
    timers.push(setTimeout(finish, END * 1000));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, motion]);

  const { oX, oY, r, s } = L;
  const coverW = L.wmLeft + L.wmW - oX + 12;
  const screen = useAnimatedStyle(() => ({ opacity: 1 - exit.value }));
  const tile = useAnimatedStyle(() => {
    const k = prog(t.value, 0.12, 0.35);
    return { opacity: 1 - k, transform: [{ translateY: -24 * s * k }, { scale: 1 - 0.1 * k }] };
  });
  const ball = useAnimatedStyle(() => {
    const b = ballAt(t.value, oX, oY, r, s);
    return { opacity: t.value < T0 ? 0 : 1 - prog(t.value, LANDED + 0.05, LANDED + 0.35), transform: [{ translateX: b.x - r }, { translateY: b.y - r }, { scaleX: b.sx }, { scaleY: b.sy }] };
  });
  const shadow = useAnimatedStyle(() => {
    const b = ballAt(t.value, oX, oY, r, s);
    return {
      opacity: t.value < T0 ? 0 : 0.35 * (1 - prog(t.value, LANDED + 0.05, LANDED + 0.35)),
      transform: [{ translateX: b.x - 1.1 * r }, { translateY: oY + r + 8 * s - 11 * s }, { scaleX: clamp(0.3 + 0.7 * (1 - (oY - b.y) / (1100 * s))) }],
    };
  });
  const letterO = useAnimatedStyle(() => ({ opacity: prog(t.value, LANDED + 0.05, LANDED + 0.35) }));
  const rest = useAnimatedStyle(() => {
    const k = inOut(prog(t.value, LANDED + 0.2, LANDED + 0.9));
    return { opacity: clamp(k * 3), transform: [{ translateX: lerp(-0.05 * L.wmW, 0, k) }] };
  });
  const cover = useAnimatedStyle(() => {
    const k = inOut(prog(t.value, LANDED + 0.2, LANDED + 0.9));
    return { opacity: k >= 1 ? 0 : 1, transform: [{ translateX: k * coverW }] };
  });

  // While the saved flag is read, cover the app in the launch colour so the screen behind never flashes through
  // (on Android the first-run language screen showed for a moment before the intro).
  if (visible === null) return <View testID="intro-splash" style={s_.screen} />;
  if (!visible) return null;
  const wordmark ={ left: L.wmLeft, top: L.wmTop, width: L.wmW, height: L.wmH };
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0 && (Math.abs(width - box.w) > 1 || Math.abs(height - box.h) > 1)) setBox({ w: width, h: height });
  };
  // Until the screen has a size there is nothing to lay out: show just the background (the native splash's colour).
  if (!(box.w > 0 && box.h > 0)) return <View testID="intro-splash" style={s_.screen} onLayout={onLayout} />;
  return <Animated.View testID="intro-splash" accessibilityLabel={tr('shell.introLoading')} style={[s_.screen, screen]} onLayout={onLayout}>
    <StatusBar style="light" />
    {LAYERS.map((layer, i) => <SketchLayer key={i} index={i} L={L} t={t} />)}
    {BIRDS.map((b, i) => <Bird key={i} bird={b} L={L} t={t} />)}
    {STARS.map((st, i) => <Star key={i} star={st} i={i} L={L} t={t} />)}
    {/* keeps the sketches from fighting the logo */}
    <Svg width={L.w} height={L.h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs><RadialGradient id="introVignette" cx={L.w / 2} cy={oY} r={640 * s} gradientUnits="userSpaceOnUse">
        <Stop offset="0" stopColor={BG} stopOpacity={0.95} /><Stop offset="1" stopColor={BG} stopOpacity={0} />
      </RadialGradient></Defs>
      <Rect width={L.w} height={L.h} fill="url(#introVignette)" />
    </Svg>
    {/* the word: the rest of it under a cover that wipes away to the right, then the O, then the ball on top */}
    <Animated.View pointerEvents="none" style={[s_.abs, wordmark, rest]}>
      <Svg width={L.wmW} height={L.wmH} viewBox={WORDMARK_VIEWBOX}><Path d={NE_PATH} fill="#FFFFFF" /><Path d={WORDMARK_LOCAL} fill={BRAND_GREEN} /></Svg>
    </Animated.View>
    <Animated.View pointerEvents="none" style={[s_.abs, { left: oX, top: L.wmTop - 6, width: coverW, height: L.wmH + 12, backgroundColor: BG }, cover]} />
    <Animated.View pointerEvents="none" style={[s_.abs, wordmark, letterO]}>
      <Svg width={L.wmW} height={L.wmH} viewBox={WORDMARK_VIEWBOX}><Path d={O_PATH} fill="#FFFFFF" /></Svg>
    </Animated.View>
    <Animated.View pointerEvents="none" style={[s_.abs, { width: 2.2 * r, height: 22 * s, borderRadius: 11 * s, backgroundColor: '#000' }, shadow]} />
    <Animated.View pointerEvents="none" style={[s_.abs, { width: 2 * r, height: 2 * r, borderRadius: r, backgroundColor: BRAND_GREEN }, ball]} />
    {/* the native launch screen's tile, in the same place, handing over to the scene */}
    <Animated.Image source={TILE} style={[s_.abs, { width: TILE_SIZE, height: TILE_SIZE, left: (L.w - TILE_SIZE) / 2, top: (L.h - TILE_SIZE) / 2 }, tile]} />
    <Pressable style={StyleSheet.absoluteFill} onPress={finish} accessibilityRole="button" />
  </Animated.View>;
}

const APath = Animated.createAnimatedComponent(Path);
const ACircle = Animated.createAnimatedComponent(Circle);

// One layer of the canvas: its sketches, drifting sideways a little over the intro (parallax).
function SketchLayer({ index, L, t }: { index: number; L: Layout; t: SharedValue<number> }) {
  const layer = LAYERS[index];
  const drift = useAnimatedStyle(() => ({ transform: [{ translateX: layer.drift * L.s * clamp(t.value / END) }] }));
  const mine = SKETCHES.filter(k => k.layer === index && !k.part);
  const band = (b: 0 | 1) => mine.filter(k => k.band === b);
  const lift = `translate(0 ${L.lift})`;
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, drift]}>
    <Svg width={L.w} height={L.h} viewBox={L.viewBox}>
      <G opacity={layer.opacity}>
        <G>{band(0).map((k, i) => <Strokes key={i} sketch={k} t={t} width={layer.width} />)}</G>
        <G transform={lift}>{band(1).map((k, i) => <Strokes key={i} sketch={k} t={t} width={layer.width} />)}</G>
      </G>
      <G>{band(0).filter(k => k.tip).map((k, i) => <PenTip key={i} sketch={k} t={t} />)}</G>
      <G transform={lift}>{band(1).filter(k => k.tip).map((k, i) => <PenTip key={i} sketch={k} t={t} />)}</G>
    </Svg>
    {index === 2 && SKETCHES.filter(k => k.part).map((k, i) => <Part key={i} sketch={k} L={L} t={t} />)}
  </Animated.View>;
}

// One sketch drawing itself. One dash as long as the longest stroke; dashes restart on every subpath, so each stroke
// shows the first (dash × progress) of its length and every stroke draws at the same pen speed.
function Strokes({ sketch, t, width }: { sketch: Sketch; t: SharedValue<number>; width: number }) {
  const { start, len } = sketch;
  const dash = len + 2;
  const props = useAnimatedProps(() => ({ strokeDashoffset: 1 + dash * (1 - outCubic(prog(t.value, start, start + DRAW))) }));
  return <APath d={sketch.d} fill="none" stroke={BRAND_GREEN} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={[dash, dash]} animatedProps={props} />;
}

// The bright pencil point leading a sketch's longest stroke while it is being drawn.
function PenTip({ sketch, t }: { sketch: Sketch; t: SharedValue<number> }) {
  const { start, len, tip = [], tipLen = 1 } = sketch;
  const props = useAnimatedProps(() => {
    const p = outCubic(prog(t.value, start, start + DRAW));
    const at = (len + 2) * p - 1, n = tip.length / 2 - 1;
    if (p <= 0 || at >= tipLen) return { cx: 0, cy: 0, opacity: 0 };
    const f = clamp(at / tipLen) * n, i = Math.min(Math.floor(f), n - 1), k = f - i;
    return { cx: lerp(tip[2 * i], tip[2 * i + 2], k), cy: lerp(tip[2 * i + 1], tip[2 * i + 3], k), opacity: 0.9 };
  });
  return <ACircle r={3.2} fill={PEN} animatedProps={props} />;
}

// The kite sways on its string; the chai steam keeps rising.
function Part({ sketch, L, t }: { sketch: Sketch; L: Layout; t: SharedValue<number> }) {
  const kite = sketch.part === 'kite';
  const [px, py] = sketch.pivot ?? [0, 0];
  const move = useAnimatedStyle(() => {
    if (kite) return { transform: [{ rotate: `${Math.sin(t.value * 2.6) * 6}deg` }] };
    const k = (t.value * 0.9) % 1;
    return { opacity: Math.sin(Math.PI * k), transform: [{ translateY: -16 * L.s * k }] };
  });
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, kite && { transformOrigin: [(px + L.xOff) * L.s, py * L.s, 0] }, move]}>
    <Svg width={L.w} height={L.h} viewBox={L.viewBox}>
      <G opacity={LAYERS[2].opacity}><Strokes sketch={sketch} t={t} width={LAYERS[2].width} /></G>
      {sketch.tip && <PenTip sketch={sketch} t={t} />}
    </Svg>
  </Animated.View>;
}

// A bird flying in from the right, wings flapping.
function Bird({ bird: [x0, y0, size, start], L, t }: { bird: [number, number, number, number]; L: Layout; t: SharedValue<number> }) {
  const w = 40 * size * L.s, h = 24 * size * L.s;
  const fly = useAnimatedStyle(() => {
    const p = t.value - start;
    if (p < 0) return { opacity: 0 };
    const x = (x0 + 2 * L.xOff - p * 260) * L.s, y = (y0 - p * 18 + Math.sin(p * 3) * 6) * L.s;
    return { opacity: 0.5, transform: [{ translateX: x - w / 2 }, { translateY: y - h / 2 }, { scaleY: Math.sin(p * 14) }] };
  });
  return <Animated.View pointerEvents="none" style={[s_.abs, { width: w, height: h }, fly]}>
    <Svg width={w} height={h} viewBox="-20 -12 40 24"><Path d="M-18 -9L-8 -3L0 2L8 -3L18 -9" fill="none" stroke={BRAND_GREEN} strokeWidth={2.6 / size} strokeLinecap="round" strokeLinejoin="round" /></Svg>
  </Animated.View>;
}

// A star near the moon, twinkling.
function Star({ star: [x, y], i, L, t }: { star: [number, number]; i: number; L: Layout; t: SharedValue<number> }) {
  const size = 14 * L.s, bar = 2 * L.s;
  const twinkle = useAnimatedStyle(() => ({ opacity: clamp((t.value - 0.3 - i * 0.12) * 3) * (0.45 + 0.35 * Math.sin(t.value * 6 + i * 1.7)) }));
  return <Animated.View pointerEvents="none" style={[s_.abs, { left: (x + L.xOff) * L.s - size / 2, top: y * L.s - size / 2, width: size, height: size }, twinkle]}>
    <View style={[s_.abs, s_.star, { top: (size - bar) / 2, width: size, height: bar }]} />
    <View style={[s_.abs, s_.star, { left: (size - bar) / 2, width: bar, height: size }]} />
  </Animated.View>;
}

const s_ = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFill, zIndex: 1000, backgroundColor: BG, overflow: 'hidden' },
  abs: { position: 'absolute', left: 0, top: 0 },
  star: { backgroundColor: PEN, borderRadius: 1 },
});
