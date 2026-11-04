// The launch intro, on every cold start: the town's shops, set round the OneLocal wordmark like the hours on a clock,
// power it up. It opens as an exact copy of the native splash (ink, the wordmark in the middle), so the hand-over cannot
// be seen; the brand green blooms out from the middle and the wordmark goes dark. From twelve o'clock round, each shop
// pops in, lights up and sends a spark into the wordmark, which charges a step at a time, left to right, until "One"
// glows white and "Local" green. A ripple runs round the shops and the intro fades into the app (about 3 s in all).
// Everything runs from one clock on the UI thread, so the app starting up behind it cannot make it stutter.
// Tap anywhere to skip. With Reduce Motion the lit-up frame shows briefly, then fades.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Image } from 'expo-image';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { BrandLogo } from './brand-logo';
import { colors } from '../theme';
import { useTranslation } from '../i18n';

const launch = globalThis as unknown as { __onecityIntroPlayed?: boolean; __onecityIntroShowing?: boolean };

// The shops, from twelve o'clock round.
const SHOPS = [
  require('../../assets/images/categories/vegetables.png'),
  require('../../assets/images/categories/dairy-bread.png'),
  require('../../assets/images/food/burgers.png'),
  require('../../assets/images/categories/health-pharma.png'),
  require('../../assets/images/categories/fruits.png'),
  require('../../assets/images/categories/fashion.png'),
  require('../../assets/images/categories/sweets-bakery.png'),
  require('../../assets/images/categories/electronics.png'),
  require('../../assets/images/categories/makeup.png'),
  require('../../assets/images/categories/gifts-pooja.png'),
  require('../../assets/images/categories/ice-cream.png'),
  require('../../assets/images/categories/stationery.png'),
];
const COUNT = SHOPS.length;

// The timeline, in milliseconds on the one clock.
const BLOOM = 520; // the green spreading out from the middle
const FIRST = 380; // the first shop pops in
const GAP = 115; // and each next one after this
const POP = 320;
const FIRE = 150; // a shop lights up and sends its spark this long after it pops in
const TRAVEL = 300; // the spark's flight into the wordmark
const STEP = 260; // the wordmark charging one step as a spark lands
const LIT = FIRST + 11 * GAP + FIRE + TRAVEL; // the last spark lands: fully charged
const WAVE = LIT + 80; // a ripple runs round the shops, one after the other
const RIPPLE = 26;
const EXIT = WAVE + 12 * RIPPLE + 300;
const FADE = 520;
const TOTAL = EXIT + FADE;
const HOLD = 900; // Reduce Motion: how long the lit frame stays

const LOGO = 220; // the native splash's wordmark width (app.json), so the hand-over lines up exactly
const RATIO = 900 / 188;
const SPLIT = 415 / 900; // where "One" ends and "Local" begins in the wordmark
const SPARK = { width: 14, height: 5 };

// How far (0 to 1) the clock is through a stretch of the timeline, and the curves the micro-interactions follow.
const phase = (t: number, start: number, length: number) => { 'worklet'; return Math.min(1, Math.max(0, (t - start) / length)); };
const easeOut = (p: number) => { 'worklet'; return 1 - (1 - p) ** 3; };
const easeInOut = (p: number) => { 'worklet'; return p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2; };
// Past the mark and back: the pop.
const pop = (p: number) => { 'worklet'; return 1 + 2.6 * (p - 1) ** 3 + 1.6 * (p - 1) ** 2; };
// Up and back down again: a tap of energy.
const bump = (p: number) => { 'worklet'; return Math.sin(Math.PI * p); };
const landing = (i: number) => { 'worklet'; return FIRST + i * GAP + FIRE + TRAVEL; };
// How charged the wordmark is: a twelfth more as each spark lands.
const charge = (t: number) => { 'worklet'; let c = 0; for (let i = 0; i < COUNT; i++) c += pop(phase(t, landing(i), STEP)); return Math.min(1, c / COUNT); };

const hideSplash = () => { void SplashScreen.hideAsync().catch(() => {}); };
// Keep the native splash up until the intro's first frame (the same picture) is ready to take over.
void SplashScreen.preventAutoHideAsync().catch(() => {});

export function IntroSplash() {
  const [visible, setVisible] = useState(!launch.__onecityIntroPlayed);
  const { t } = useTranslation(); // safe here: I18nProvider holds the first render until the saved language is loaded
  const { width, height } = useWindowDimensions();
  const clock = useSharedValue(0); const leave = useSharedValue(0);
  const loaded = useRef(0); const started = useRef(false);

  const done = useCallback(() => { launch.__onecityIntroShowing = false; setVisible(false); }, []);
  // Waits for the shops' pictures, so none pops in empty; asks the OS about Reduce Motion directly, as the app-wide answer
  // may not be in yet this early.
  const start = useCallback(() => {
    if (started.current) return;
    started.current = true;
    const end = (finished?: boolean) => { 'worklet'; if (finished) scheduleOnRN(done); };
    void AccessibilityInfo.isReduceMotionEnabled().catch(() => false).then(reduce => {
      if (!reduce) { clock.value = withTiming(TOTAL, { duration: TOTAL, easing: Easing.linear }, end); return; }
      clock.value = EXIT;
      clock.value = withDelay(HOLD, withTiming(TOTAL, { duration: FADE, easing: Easing.linear }, end));
    });
  }, [clock, done]);
  const shopLoaded = useCallback(() => { loaded.current += 1; if (loaded.current === COUNT) start(); }, [start]);
  const skip = () => {
    cancelAnimation(clock);
    leave.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }, finished => { if (finished) scheduleOnRN(done); });
  };

  useEffect(() => {
    if (!visible) { hideSplash(); return; }
    launch.__onecityIntroPlayed = true;
    // Read by the pop-up host so no pop-up opens over the intro.
    launch.__onecityIntroShowing = true;
    // Should a picture never report in, the native splash still goes and the intro still plays.
    const unblock = setTimeout(hideSplash, 1000); const go = setTimeout(start, 900);
    return () => { clearTimeout(unblock); clearTimeout(go); };
  }, [visible, start]);

  const screen = useAnimatedStyle(() => ({ opacity: (1 - easeInOut(phase(clock.value, EXIT, FADE))) * (1 - leave.value) }));
  const bloomStyle = useAnimatedStyle(() => ({ transform: [{ scale: Math.max(0.001, easeOut(phase(clock.value, 0, BLOOM))) }] }));
  // The light behind the wordmark: it comes with the green and brightens as the wordmark charges.
  const glowStyle = useAnimatedStyle(() => {
    const t = clock.value;
    return { opacity: easeOut(phase(t, 100, BLOOM)) * Math.min(1, 0.45 + 0.45 * charge(t) + 0.3 * bump(phase(t, LIT, 600))) };
  });
  // Fully charged: a thin ring of light runs out from the wordmark past the shops.
  const waveStyle = useAnimatedStyle(() => {
    const p = phase(clock.value, LIT, 650);
    return { opacity: p > 0 ? 0.6 * (1 - p) : 0, transform: [{ scale: 0.35 + 0.85 * easeOut(p) }] };
  });

  if (!visible) return null;
  // The clock face fits the screen with room to spare; the wordmark leaves the shops at three and nine room to breathe.
  const k = Math.min(1, (width - 40) / 352);
  const radius = 150 * k; const tile = 52 * k;
  const logoWidth = Math.min(LOGO, 2 * (radius - tile / 2) - 56 * k); const logoHeight = logoWidth / RATIO;
  const stage = 2 * radius + tile; const middle = stage / 2;
  const bloom = Math.hypot(width, height) * 1.05; const glow = stage * 1.3;
  return <Animated.View testID="intro-splash" accessibilityLabel={t('shell.introLoading')} style={[s.screen, screen]}>
    <StatusBar style="light" />
    <Animated.View style={[s.bloom, { width: bloom, height: bloom, borderRadius: bloom / 2, left: (width - bloom) / 2, top: (height - bloom) / 2 }, bloomStyle]} />
    <View style={{ width: stage, height: stage }}>
      <Animated.View style={[s.layer, { left: middle - glow / 2, top: middle - glow / 2 }, glowStyle]}>
        <Svg width={glow} height={glow}>
          <Defs><RadialGradient id="intro-glow" cx="50%" cy="50%" r="50%"><Stop offset="0" stopColor={colors.forestGlow} stopOpacity={1} /><Stop offset="1" stopColor={colors.forestGlow} stopOpacity={0} /></RadialGradient></Defs>
          <Circle cx={glow / 2} cy={glow / 2} r={glow / 2} fill="url(#intro-glow)" />
        </Svg>
      </Animated.View>
      <Animated.View style={[s.wave, { width: stage, height: stage, borderRadius: middle }, waveStyle]} />
      {SHOPS.map((_, i) => <Spark key={i} index={i} middle={middle} from={radius - tile / 2} logo={[logoWidth / 2 + 4, logoHeight / 2 + 4]} clock={clock} />)}
      {SHOPS.map((source, i) => <Shop key={i} index={i} source={source} middle={middle} radius={radius} size={tile} clock={clock} onLoad={shopLoaded} />)}
      <View style={[s.layer, { left: middle - logoWidth / 2, top: middle - logoHeight / 2 }]}>
        <Wordmark width={logoWidth} clock={clock} onLoad={hideSplash} />
      </View>
    </View>
    <Pressable style={StyleSheet.absoluteFill} onPress={skip} accessibilityRole="button" />
  </Animated.View>;
}

// One shop on the clock face: it pops in, lights up in a soft glow as it fires its spark, and hops outward as the ripple
// passes. The glow is a quiet aura that fades out from the disc's edge; it swells gently as the shop fires, then rests.
function Shop({ index, source, middle, radius, size, clock, onLoad }: { index: number; source: number; middle: number; radius: number; size: number; clock: SharedValue<number>; onLoad: () => void }) {
  const angle = index * Math.PI / 6; const x = Math.sin(angle); const y = -Math.cos(angle); const glow = `intro-shop-glow-${index}`;
  const style = useAnimatedStyle(() => {
    const t = clock.value; const begin = FIRST + index * GAP;
    const appear = phase(t, begin, POP); const fire = bump(phase(t, begin + FIRE, 240)); const ripple = bump(phase(t, WAVE + index * RIPPLE, 300));
    return { opacity: Math.min(1, appear * 3), transform: [{ translateX: x * 7 * ripple }, { translateY: y * 7 * ripple }, { scale: pop(appear) + 0.1 * fire + 0.06 * ripple }] };
  });
  const lit = useAnimatedStyle(() => {
    const t = clock.value; const begin = FIRST + index * GAP + FIRE;
    const on = easeOut(phase(t, begin, 420)); const swell = bump(phase(t, begin, 600)); const ripple = bump(phase(t, WAVE + index * RIPPLE, 300));
    return { opacity: Math.min(1, 0.75 * on + 0.25 * Math.max(swell, ripple)), transform: [{ scale: 0.85 + 0.15 * on + 0.06 * swell }] };
  });
  return <Animated.View style={[s.shop, { left: middle + x * radius - size / 2, top: middle + y * radius - size / 2, width: size, height: size }, style]}>
    <Animated.View style={[s.layer, { left: -size / 2, top: -size / 2 }, lit]}>
      <Svg width={size * 2} height={size * 2}>
        <Defs><RadialGradient id={glow} cx="50%" cy="50%" r="50%">
          <Stop offset="0.5" stopColor={colors.electricLime} stopOpacity={0.38} />
          <Stop offset="0.6" stopColor={colors.electricLime} stopOpacity={0.2} />
          <Stop offset="0.76" stopColor={colors.electricLime} stopOpacity={0.07} />
          <Stop offset="1" stopColor={colors.electricLime} stopOpacity={0} />
        </RadialGradient></Defs>
        <Circle cx={size} cy={size} r={size} fill={`url(#${glow})`} />
      </Svg>
    </Animated.View>
    <View style={[s.disc, { width: size, height: size, borderRadius: size / 2 }]}>
      <Image source={source} style={{ width: size * 0.7, height: size * 0.7 }} contentFit="contain" onLoad={onLoad} onError={onLoad} />
    </View>
  </Animated.View>;
}

// A shop's spark: a short streak of light that flies in along the clock's hand and is taken in at the wordmark's edge.
function Spark({ index, middle, from, logo: [rx, ry], clock }: { index: number; middle: number; from: number; logo: [number, number]; clock: SharedValue<number> }) {
  const angle = index * Math.PI / 6; const x = Math.sin(angle); const y = -Math.cos(angle);
  // Where this hand meets an oval just round the wordmark.
  const to = 1 / Math.sqrt((x / rx) ** 2 + (y / ry) ** 2);
  const style = useAnimatedStyle(() => {
    const p = phase(clock.value, FIRST + index * GAP + FIRE, TRAVEL); const d = from + (to - from) * easeInOut(p);
    return { opacity: Math.min(1, p * 6, (1 - p) * 6), transform: [{ translateX: x * d }, { translateY: y * d }, { rotate: `${angle - Math.PI / 2}rad` }, { scaleX: 1 + 1.4 * bump(p) }] };
  });
  return <Animated.View style={[s.spark, { left: middle - SPARK.width / 2, top: middle - SPARK.height / 2 }, style]} />;
}

// The wordmark: dark until charged, then "One" in white and "Local" in its own green, filling left to right. It starts
// as the native splash shows it (white "Local", at the splash's size) and settles as the green arrives.
function Wordmark({ width, clock, onLoad }: { width: number; clock: SharedValue<number>; onLoad: () => void }) {
  const height = width / RATIO; const split = width * SPLIT; const from = LOGO / width;
  const settle = useAnimatedStyle(() => {
    const t = clock.value; let kick = 0;
    for (let i = 0; i < COUNT; i++) kick += bump(phase(t, landing(i), 220));
    const arrive = easeOut(phase(t, 0, BLOOM));
    return { transform: [{ scale: (from + (1 - from) * arrive) * (1 + 0.025 * Math.min(1, kick) + 0.06 * bump(phase(t, LIT, 520))) }] };
  });
  const splash = useAnimatedStyle(() => ({ opacity: 1 - easeOut(phase(clock.value, 0, BLOOM)) }));
  const fill = useAnimatedStyle(() => ({ width: width * charge(clock.value) }));
  return <Animated.View style={[{ width, height }, settle]}>
    <BrandLogo tone="dark" height={height} tint={colors.splashInk} style={s.layer} />
    <Animated.View style={[s.layer, splash]}><BrandLogo tone="dark" height={height} onLoad={onLoad} /></Animated.View>
    <Animated.View style={[s.layer, s.clip, { height }, fill]}>
      <View style={[s.layer, s.clip, { width: split, height }]}><BrandLogo tone="dark" height={height} tint={colors.surface} /></View>
      <View style={[s.layer, s.clip, { left: split, width: width - split, height }]}><BrandLogo tone="dark" height={height} tint={colors.logoGreen} style={{ marginLeft: -split }} /></View>
    </Animated.View>
  </Animated.View>;
}

const s = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFill, zIndex: 1000, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: colors.splashInk },
  bloom: { position: 'absolute', backgroundColor: colors.forest },
  layer: { position: 'absolute', left: 0, top: 0 },
  clip: { overflow: 'hidden' },
  wave: { position: 'absolute', left: 0, top: 0, borderWidth: 2, borderColor: colors.electricLime },
  shop: { position: 'absolute' },
  disc: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 12, color: colors.popShade }] },
  spark: { position: 'absolute', width: SPARK.width, height: SPARK.height, borderRadius: SPARK.height / 2, backgroundColor: colors.electricLime, boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 8, color: colors.electricLime }] },
});
