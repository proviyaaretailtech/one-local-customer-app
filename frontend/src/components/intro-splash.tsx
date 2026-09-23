// First-launch intro: the neon "1" drops in on black, lime speed-streaks race past, the wordmark
// slides in beside it, and then the "1" zooms through the screen to reveal the app.
// Plays once per app launch (~2 s). With Reduce Motion it is a short, still fade.
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { nativeDriver, useMotionAllowed } from '../motion';
import { OneGlyph } from './one-button';
import { colors } from '../theme';

const launch = globalThis as unknown as { __onecityIntroPlayed?: boolean };
const INK = '#050605';
const STREAKS = [0.18, 0.31, 0.42, 0.58, 0.69, 0.82];

export function IntroSplash() {
  const [visible, setVisible] = useState(!launch.__onecityIntroPlayed);
  const motion = useMotionAllowed();
  const { width, height } = useWindowDimensions();
  const drop = useRef(new Animated.Value(0)).current;      // glyph falls in and settles
  const streak = useRef(new Animated.Value(0)).current;    // speed lines race across
  const word = useRef(new Animated.Value(0)).current;      // wordmark + tagline
  const bar = useRef(new Animated.Value(0)).current;       // progress line
  const exit = useRef(new Animated.Value(0)).current;      // zoom-through reveal

  useEffect(() => {
    if (!visible) return;
    launch.__onecityIntroPlayed = true;
    if (!motion) {
      drop.setValue(1); word.setValue(1); bar.setValue(1);
      const t = setTimeout(() => Animated.timing(exit, { toValue: 1, duration: 260, useNativeDriver: nativeDriver }).start(() => setVisible(false)), 700);
      return () => clearTimeout(t);
    }
    const run = Animated.sequence([
      Animated.parallel([
        Animated.spring(drop, { toValue: 1, friction: 5, tension: 70, useNativeDriver: nativeDriver }),
        Animated.timing(streak, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: nativeDriver }),
        Animated.timing(bar, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
        Animated.sequence([Animated.delay(320), Animated.spring(word, { toValue: 1, friction: 8, tension: 60, useNativeDriver: nativeDriver })]),
      ]),
      Animated.delay(150),
      Animated.timing(exit, { toValue: 1, duration: 480, easing: Easing.in(Easing.cubic), useNativeDriver: nativeDriver }),
    ]);
    run.start(() => setVisible(false));
    return () => run.stop();
  }, [visible, motion, drop, streak, word, bar, exit]);

  if (!visible) return null;
  const glyphScale = exit.interpolate({ inputRange: [0, 1], outputRange: [1, 14] });
  // Wordmark, tagline and progress clear out first, so the zoom-through is just the "1".
  const textOut = exit.interpolate({ inputRange: [0, 0.25], outputRange: [1, 0], extrapolate: 'clamp' });
  const wordIn = Animated.multiply(word, textOut);
  return <Animated.View testID="intro-splash" accessibilityLabel="OneCity is loading" style={[s.screen, { opacity: exit.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 1, 0] }) }]} pointerEvents="none">
    <StatusBar style="light" />
    {STREAKS.map((y, i) => <Animated.View key={y} style={[s.streak, {
      top: height * y, width: width * (0.35 + (i % 3) * 0.15), opacity: streak.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 0.9, 0.5, 0] }),
      transform: [{ translateX: streak.interpolate({ inputRange: [0, 1], outputRange: [-width, width * (1.1 + (i % 2) * 0.3)] }) }],
    }]} />)}
    <View style={s.center}>
      <Animated.View style={[s.halo, { opacity: drop.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] }), transform: [{ scale: drop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }]} />
      <View style={s.lockup}>
        <Animated.View style={{ transform: [
          { translateY: drop.interpolate({ inputRange: [0, 1], outputRange: [-height * 0.45, 0] }) },
          { rotate: drop.interpolate({ inputRange: [0, 1], outputRange: ['-18deg', '0deg'] }) },
          { scale: glyphScale },
        ] }}><OneGlyph size={96} /></Animated.View>
        <Animated.Text style={[s.word, { opacity: wordIn, transform: [{ translateX: word.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }] }]}>neCity</Animated.Text>
      </View>
      <Animated.Text style={[s.tagline, { opacity: wordIn, transform: [{ translateY: word.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>YOUR CITY · AT YOUR DOORSTEP</Animated.Text>
    </View>
    <Animated.View style={[s.track, { opacity: textOut }]}><Animated.View style={[s.fill, { width: bar.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} /></Animated.View>
    <Animated.Text style={[s.made, { opacity: textOut }]}>Made in Latur</Animated.Text>
  </Animated.View>;
}

const s = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFill, zIndex: 1000, backgroundColor: INK, alignItems: 'center', justifyContent: 'center' },
  streak: { position: 'absolute', left: 0, height: 2, borderRadius: 2, backgroundColor: colors.electricLime },
  center: { alignItems: 'center' },
  halo: { position: 'absolute', top: -40, width: 200, height: 200, borderRadius: 100, backgroundColor: colors.lime, boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 80, color: colors.lime }] },
  lockup: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  word: { color: '#FFFFFF', fontSize: 46, fontWeight: '800', letterSpacing: -1.5, marginBottom: 6 },
  tagline: { color: colors.electricLime, fontSize: 11, fontWeight: '700', letterSpacing: 3, marginTop: 22 },
  track: { position: 'absolute', bottom: 92, width: 120, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' },
  fill: { height: 3, backgroundColor: colors.electricLime },
  made: { position: 'absolute', bottom: 58, color: 'rgba(255,255,255,0.45)', fontSize: 10, letterSpacing: 1.5 },
});
