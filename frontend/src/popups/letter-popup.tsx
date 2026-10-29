// The campaign card (format 'letter', specs/marketing-popups/plan.md §3), in the 2026 look: never full screen, the photo or video
// fills the top edge to edge with soft rounded corners, the message sits on a clean white panel below with one lime button,
// and a round frosted close button floats on the picture. No ornate border.
// Master Admin's "frame" picks the small label's tone (Classic = forest, Festive = deep red, Plain = no label) and the
// "seal" colour tints that label; the layout is the same for all, so every campaign looks like part of the app.
//  - 88% of the screen width, at most 360 pt; the picture shrinks on a short phone so the whole card always fits.
//  - Video plays muted on a loop with a sound button; with Reduce Motion it does not play (poster shown).
//  - Close is always visible; tapping outside and the back button close it too.
import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Icon from '@react-native-vector-icons/ionicons';
import { useTranslation } from '@/src/i18n';
import { colors } from '../theme';
import { contentFor, imageUrl } from './api';
import type { Popup } from './types';

const INK = '#0B1F16';
const SOFT = '#5E6B63';
const RADIUS = 28;

type Props = { popup: Popup; lang: string; motion: boolean; onClose: () => void; onOpen: () => void };

export function LetterPopup({ popup, lang, motion, onClose, onOpen }: Props) {
  const { t } = useTranslation();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const c = contentFor(popup, lang);
  const media = popup.media;
  const style = popup.frame?.style ?? 'royal_gold';
  const tag = style === 'plain' ? null : (popup.is_sponsored ? t('popups.ad') : c.greeting?.replace(/[,，]\s*$/, '') || null);
  const tagColor = popup.frame?.seal ?? (style === 'festive_red' ? '#9C2A2A' : colors.forest);

  const cardW = Math.min(screenW * 0.88, 360);
  const ratio = media ? media.width / media.height : 4 / 5;
  const picH = Math.min(cardW / ratio, screenH * 0.5);

  const progress = useSharedValue(motion ? 0 : 1);
  useEffect(() => { if (motion) progress.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) }); }, [motion, progress]);
  const entrance = useAnimatedStyle(() => ({ opacity: progress.value, transform: [{ translateY: (1 - progress.value) * 24 }, { scale: 0.97 + progress.value * 0.03 }] }));

  return <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
    <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel={t('popups.closeA11y')} />
    <View pointerEvents="box-none" style={s.center}>
      <Animated.View testID="popup-letter" accessibilityViewIsModal accessibilityLabel={c.title || t('popups.dialogA11y')} style={[s.card, { width: cardW }, entrance]}>
        {media && <View style={[s.pic, { height: picH }]}>
          {media.type === 'video'
            ? <CampaignVideo source={imageUrl(media.web_key ?? media.key)!} poster={imageUrl(media.poster_key)} play={motion} />
            : <Image testID="popup-letter-photo" source={{ uri: imageUrl(media.key)! }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />}
          {/* a soft fade into the white panel, so picture and text read as one piece */}
          <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.9)']} style={s.fade} />
        </View>}

        <View style={s.body}>
          {!!tag && <View style={[s.tag, { backgroundColor: `${tagColor}14` }]}><View style={[s.dot, { backgroundColor: tagColor }]} /><Text style={[s.tagText, { color: tagColor }]} numberOfLines={1}>{tag}</Text></View>}
          {!!c.title && <Text testID="popup-letter-title" style={s.title}>{c.title}</Text>}
          {!!c.body && <Text style={s.text} numberOfLines={4}>{c.body}</Text>}
          {!!c.cta_route && <Pressable testID="popup-cta" accessibilityRole="button" onPress={onOpen} style={({ pressed }) => [s.cta, pressed && s.pressed]}>
            <Text style={s.ctaText}>{c.cta_label || t('popups.open')}</Text>
            <Icon name="arrow-forward" size={16} color={INK} />
          </Pressable>}
        </View>

        <Pressable testID="popup-close" accessibilityRole="button" accessibilityLabel={t('popups.closeA11y')} hitSlop={12} onPress={onClose}
          style={({ pressed }) => [s.close, pressed && s.pressed]}>
          <Icon name="close" size={18} color={INK} />
        </Pressable>
      </Animated.View>
    </View>
  </Modal>;
}

// Muted loop with a sound button; with Reduce Motion (play=false) only the poster (or the first frame) is shown.
function CampaignVideo({ source, poster, play }: { source: string; poster: string | null; play: boolean }) {
  const { t } = useTranslation();
  const view = useRef<VideoView>(null);
  const [muted, setMuted] = useState(true); const [started, setStarted] = useState(false);
  const player = useVideoPlayer(source, p => { p.loop = true; p.muted = true; });
  useEffect(() => { player.muted = muted; }, [player, muted]);
  useEffect(() => {
    if (!play) return;
    const start = () => {
      const el = Platform.OS === 'web' ? (view.current as unknown as { nativeRef?: { current?: HTMLVideoElement } })?.nativeRef?.current : undefined;
      if (el) void el.play().catch(() => {}); else player.play();
    };
    start();
    const ready = player.addListener('statusChange', e => { if (e.status === 'readyToPlay') start(); });
    const tick = player.addListener('playingChange', e => { if (e.isPlaying) setStarted(true); });
    return () => { ready.remove(); tick.remove(); player.pause(); };
  }, [player, play]);
  return <>
    {/* a <video> on the web keeps its own size unless stretched (see Discover tiles) */}
    <VideoView ref={view} testID="popup-letter-video" player={player} nativeControls={false} contentFit="cover" style={[StyleSheet.absoluteFill, s.fill]} />
    {!!poster && !started && <Image source={{ uri: poster }} style={StyleSheet.absoluteFill} contentFit="cover" />}
    {play && <Pressable testID="popup-letter-sound" accessibilityRole="button" accessibilityLabel={muted ? t('popups.soundOn') : t('popups.soundOff')}
      hitSlop={10} onPress={() => setMuted(m => !m)} style={({ pressed }) => [s.sound, pressed && s.pressed]}>
      <Icon name={muted ? 'volume-mute' : 'volume-high'} size={16} color="#FFFFFF" />
    </Pressable>}
  </>;
}

const s = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8,16,11,0.55)' },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: RADIUS, backgroundColor: '#FFFFFF', overflow: 'hidden',
    boxShadow: [{ offsetX: 0, offsetY: 24, blurRadius: 48, color: 'rgba(5,20,10,0.32)' }, { offsetX: 0, offsetY: 2, blurRadius: 6, color: 'rgba(5,20,10,0.10)' }] },
  pic: { width: '100%', backgroundColor: colors.surfaceSecondary },
  fill: { width: '100%', height: '100%' },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 48 },
  body: { paddingHorizontal: 22, paddingTop: 10, paddingBottom: 22, gap: 8 },
  tag: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  tagText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.2 },
  title: { color: INK, fontSize: 24, lineHeight: 28, fontWeight: '800', letterSpacing: -0.6 },
  text: { color: SOFT, fontSize: 15, lineHeight: 21 },
  cta: { marginTop: 8, minHeight: 52, borderRadius: 26, backgroundColor: colors.electricLime, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  ctaText: { color: INK, fontSize: 16, fontWeight: '800' },
  close: { position: 'absolute', top: 12, right: 12, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.86)',
    boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(0,0,0,0.15)' }] },
  sound: { position: 'absolute', left: 12, bottom: 14, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  pressed: { opacity: 0.75 },
});
