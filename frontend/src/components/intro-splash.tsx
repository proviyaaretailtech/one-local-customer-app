// First-launch intro: a short brand video (~6 s, muted, portrait 9:16) plays full screen, then
// dissolves into the app. Tap anywhere to skip.
// The video is served from Supabase Storage (public bucket onecity-catalog, path app/intro/), in two
// renditions: 720p for small or low-density screens, 1080p for the rest.
// Phones fill the screen (cover). Tablets, landscape and desktop web would crop too much of a portrait
// clip, so there the whole frame is shown (contain) over a blurred, full-bleed copy of its first frame.
// With Reduce Motion the video is not played; the first frame shows briefly and fades.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, PixelRatio, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Constants from 'expo-constants';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useMotionAllowed } from '../motion';
import { useTranslation } from '../i18n';

const launch = globalThis as unknown as { __onecityIntroPlayed?: boolean; __onecityIntroShowing?: boolean };
const INK = '#050605';
const POSTER = require('../../assets/videos/intro-poster.jpg');
const STORAGE = `${String(Constants.expoConfig?.extra?.supabaseUrl || '').replace(/\/$/, '')}/storage/v1/object/public/onecity-catalog/app/intro`;
const VIDEO_ASPECT = 9 / 16;

// Keep the native splash (same ink colour) up until the video can start, so there is no flash.
void SplashScreen.preventAutoHideAsync().catch(() => {});

export function IntroSplash() {
  const [visible, setVisible] = useState(!launch.__onecityIntroPlayed);
  const { t } = useTranslation(); // safe here: I18nProvider holds the first render until the saved language is loaded
  const motion = useMotionAllowed();
  const { width, height } = useWindowDimensions();
  // Wider than ~9:14.5 (tablets, landscape, desktop) → letterbox instead of cropping.
  const wide = width / Math.max(height, 1) > 0.62;
  // Pick the rendition from the pixels the video will actually cover; decided once per launch.
  const source = useMemo(() => {
    if (!STORAGE.startsWith('http')) return null;
    const px = (wide ? height * VIDEO_ASPECT : width) * PixelRatio.get();
    return `${STORAGE}/intro-${px > 800 ? 1080 : 720}.mp4`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const view = useRef<VideoView>(null);
  const exit = useSharedValue(0);
  const finishing = useRef(false);
  const player = useVideoPlayer(visible && motion ? source : null, p => { p.loop = false; p.muted = true; });

  const done = () => { launch.__onecityIntroShowing = false; setVisible(false); };
  const finish = () => {
    if (finishing.current) return;
    finishing.current = true;
    exit.value = withTiming(1, { duration: 420, easing: Easing.bezier(0.4, 0, 0.2, 1) }, f => { if (f) runOnJS(done)(); });
  };

  useEffect(() => {
    if (!visible) { void SplashScreen.hideAsync().catch(() => {}); return; }
    launch.__onecityIntroPlayed = true;
    // Read by the pop-up host so no pop-up opens over the intro.
    launch.__onecityIntroShowing = true;
    const reveal = () => { void SplashScreen.hideAsync().catch(() => {}); };
    if (!motion || !source) {
      reveal();
      const id = setTimeout(finish, 700);
      return () => clearTimeout(id);
    }
    const play = () => {
      reveal();
      // Web: play() through the element so a blocked autoplay is not reported as an error.
      const element = Platform.OS === 'web' ? (view.current as unknown as { nativeRef?: { current?: HTMLVideoElement } })?.nativeRef?.current : undefined;
      if (element) void element.play().catch(() => {}); else player.play();
    };
    if (player.status === 'readyToPlay') play();
    const ready = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') play();
      if (status === 'error') { reveal(); finish(); }
    });
    const ended = player.addListener('playToEnd', finish);
    // On a slow network show the poster rather than holding the native splash.
    const unblock = setTimeout(reveal, 1500);
    // Safety net: if the video stalls or never ends, remove the intro on a plain timer.
    const fallback = setTimeout(finish, 9000);
    return () => { ready.remove(); ended.remove(); clearTimeout(unblock); clearTimeout(fallback); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, motion, player, source]);

  const screen = useAnimatedStyle(() => ({ opacity: 1 - exit.value }));

  if (!visible) return null;
  return <Animated.View testID="intro-splash" accessibilityLabel={t('shell.introLoading')} style={[s.screen, screen]}>
    <StatusBar style="light" />
    {wide && <Image source={POSTER} style={s.fill} resizeMode="cover" blurRadius={28} />}
    {wide && <View style={[StyleSheet.absoluteFill, s.dim]} />}
    <Image source={POSTER} style={s.fill} resizeMode={wide ? 'contain' : 'cover'} />
    {motion && source && <View style={s.clip} pointerEvents="none"><VideoView ref={view} player={player} style={s.fill} contentFit={wide ? 'contain' : 'cover'} nativeControls={false} allowsPictureInPicture={false} /></View>}
    <Pressable style={StyleSheet.absoluteFill} onPress={finish} accessibilityRole="button" />
  </Animated.View>;
}

const s = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFill, zIndex: 1000, backgroundColor: INK },
  clip: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  // A web <video>/<img> ignores inset for sizing, so give it an explicit size.
  fill: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
  dim: { backgroundColor: 'rgba(5,6,5,0.45)' },
});
