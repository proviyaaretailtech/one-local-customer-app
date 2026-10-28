// The "royal letter" pop-up (specs/marketing-popups/plan.md §3): a framed card, never full screen, with one photo or video
// at the top and the message written inside the letter. Master Admin picks the frame style and seal colour; the frame,
// flourishes, paper and wax seal are drawn here (SVG), so they are crisp at any size and need no download.
//  - 86% of the screen width, at most 360 pt; the picture shrinks if the phone is short, so the whole letter always fits.
//  - Video plays muted on a loop; a speaker button turns the sound on. With Reduce Motion it does not play (poster shown).
//  - Close is always visible; tapping outside and the back button close it too.
import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Path, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Icon from '@react-native-vector-icons/ionicons';
import { useTranslation } from '@/src/i18n';
import { colors } from '../theme';
import { contentFor, imageUrl } from './api';
import type { Popup } from './types';

type Style = 'royal_gold' | 'festive_red' | 'plain';
// paper top / bottom, border, accent (flourishes, button text), ink (text)
const LOOK: Record<Style, { paper: [string, string]; line: string; accent: string; ink: string; soft: string }> = {
  royal_gold:  { paper: ['#FFFBF0', '#F5EAD0'], line: '#B8892B', accent: '#C9A04A', ink: '#2B2116', soft: '#6B5A43' },
  festive_red: { paper: ['#FFF8EE', '#FBE7D3'], line: '#9C2A2A', accent: '#C9A04A', ink: '#2E1712', soft: '#6E4A3E' },
  plain:       { paper: ['#FFFFFF', '#FAF8F3'], line: '#D9CBA6', accent: '#B8A57A', ink: '#1F1F1F', soft: '#6B6B6B' },
};
const PAD = 22;        // paper edge to the inner frame line
const SEAL = 46;       // wax seal diameter

type Props = { popup: Popup; lang: string; motion: boolean; onClose: () => void; onOpen: () => void };

export function LetterPopup({ popup, lang, motion, onClose, onOpen }: Props) {
  const { t } = useTranslation();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const c = contentFor(popup, lang);
  const style: Style = (popup.frame?.style as Style) ?? 'royal_gold';
  const look = LOOK[style] ?? LOOK.royal_gold;
  const seal = popup.frame?.seal ?? '#9C2A2A';
  const media = popup.media;

  // Card width, then a picture that keeps its shape (4:5 or 1:1) but never pushes the letter off a short screen.
  const cardW = Math.min(screenW * 0.86, 360);
  const innerW = cardW - PAD * 2 - 8;
  const ratio = media ? media.width / media.height : 4 / 5;
  const maxPicH = screenH * 0.42;
  const picH = Math.min(innerW / ratio, maxPicH);
  const picW = picH * ratio;

  const [cardH, setCardH] = useState(0);
  const progress = useSharedValue(motion ? 0 : 1);
  useEffect(() => { if (motion) progress.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }); }, [motion, progress]);
  const entrance = useAnimatedStyle(() => ({ opacity: progress.value, transform: [{ translateY: (1 - progress.value) * 18 }, { scale: 0.96 + progress.value * 0.04 }] }));

  return <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
    <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel={t('popups.closeA11y')} />
    <View pointerEvents="box-none" style={s.center}>
      <Animated.View testID="popup-letter" accessibilityViewIsModal accessibilityLabel={c.title || t('popups.dialogA11y')}
        onLayout={e => setCardH(e.nativeEvent.layout.height)} style={[s.card, { width: cardW }, entrance]}>
        {cardH > 0 && <Paper w={cardW} h={cardH} look={look} style={style} />}

        <View style={[s.inner, { paddingHorizontal: PAD + 4, paddingTop: PAD + 12, paddingBottom: PAD + SEAL / 2 + 10 }]}>
          {media && <View style={[s.pic, { width: picW, height: picH, borderColor: look.accent }]}>
            {media.type === 'video'
              ? <LetterVideo source={imageUrl(media.web_key ?? media.key)!} poster={imageUrl(media.poster_key)} play={motion} />
              : <Image testID="popup-letter-photo" source={{ uri: imageUrl(media.key)! }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />}
          </View>}
          {popup.is_sponsored && <Text style={[s.ad, { color: look.soft }]}>{t('popups.ad')}</Text>}
          {!!c.greeting && <Text style={[s.greeting, { color: look.soft }]}>{c.greeting}</Text>}
          {!!c.title && <Text testID="popup-letter-title" style={[s.title, { color: look.ink }]}>{c.title}</Text>}
          {!!c.body && <Text style={[s.body, { color: look.soft }]} numberOfLines={5}>{c.body}</Text>}
          {!!c.cta_route && <Pressable testID="popup-cta" accessibilityRole="button" onPress={onOpen}
            style={({ pressed }) => [s.cta, { backgroundColor: look.ink, borderColor: look.accent }, pressed && s.pressed]}>
            <Text style={[s.ctaText, { color: '#F7E7B4' }]}>{c.cta_label || t('popups.open')}</Text>
            <Icon name="arrow-forward" size={15} color="#F7E7B4" />
          </Pressable>}
        </View>

        <View pointerEvents="none" style={[s.seal, { left: cardW / 2 - SEAL / 2, bottom: PAD - SEAL / 2 + 4 }]}><WaxSeal color={seal} /></View>
        <Pressable testID="popup-close" accessibilityRole="button" accessibilityLabel={t('popups.closeA11y')} hitSlop={12} onPress={onClose}
          style={({ pressed }) => [s.close, { borderColor: look.line }, pressed && s.pressed]}>
          <Icon name="close" size={18} color={look.ink} />
        </Pressable>
      </Animated.View>
    </View>
  </Modal>;
}

// Paper, double rule, corner flourishes and the ornament at the top, drawn to the card's measured size.
function Paper({ w, h, look, style }: { w: number; h: number; look: (typeof LOOK)[Style]; style: Style }) {
  const o = 8, i = 13;   // outer and inner rule insets
  const corner = (x: number, y: number, sx: number, sy: number) =>
    `M ${x} ${y + sy * 22} C ${x} ${y + sy * 8} ${x + sx * 8} ${y} ${x + sx * 22} ${y} M ${x + sx * 6} ${y + sy * 16} C ${x + sx * 6} ${y + sy * 9} ${x + sx * 9} ${y + sy * 6} ${x + sx * 16} ${y + sy * 6}`;
  return <Svg pointerEvents="none" width={w} height={h} style={StyleSheet.absoluteFill}>
    <Defs>
      <SvgGradient id="paper" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={look.paper[0]} /><Stop offset="1" stopColor={look.paper[1]} /></SvgGradient>
    </Defs>
    <Rect x={0} y={0} width={w} height={h} rx={18} fill="url(#paper)" />
    <Rect x={o} y={o} width={w - o * 2} height={h - o * 2} rx={12} fill="none" stroke={look.line} strokeWidth={style === 'plain' ? 1 : 1.6} />
    {style !== 'plain' && <>
      <Rect x={i} y={i} width={w - i * 2} height={h - i * 2} rx={8} fill="none" stroke={look.accent} strokeWidth={0.8} />
      <Path d={[corner(i + 4, i + 4, 1, 1), corner(w - i - 4, i + 4, -1, 1), corner(i + 4, h - i - 4, 1, -1), corner(w - i - 4, h - i - 4, -1, -1)].join(' ')}
        stroke={look.accent} strokeWidth={1.3} fill="none" strokeLinecap="round" />
      {/* top ornament: a small diamond between two short rules */}
      <Path d={`M ${w / 2 - 34} ${o} H ${w / 2 - 10} M ${w / 2 + 10} ${o} H ${w / 2 + 34}`} stroke={look.paper[0]} strokeWidth={4} />
      <Path d={`M ${w / 2} ${o - 6} L ${w / 2 + 6} ${o} L ${w / 2} ${o + 6} L ${w / 2 - 6} ${o} Z`} fill={look.accent} />
    </>}
  </Svg>;
}

// A wax seal pressed with the OneLocal "1".
function WaxSeal({ color }: { color: string }) {
  const r = SEAL / 2;
  return <Svg width={SEAL} height={SEAL}>
    <Defs>
      <RadialGradient id="wax" cx="40%" cy="35%" r="70%"><Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.28} /><Stop offset="0.45" stopColor={color} /><Stop offset="1" stopColor={color} stopOpacity={0.9} /></RadialGradient>
    </Defs>
    {/* the uneven wax edge: twelve soft bumps */}
    <Path fill={color} d={Array.from({ length: 12 }, (_, k) => {
      const a = (k / 12) * Math.PI * 2, b = ((k + 0.5) / 12) * Math.PI * 2;
      const p = (ang: number, rad: number) => `${r + Math.cos(ang) * rad} ${r + Math.sin(ang) * rad}`;
      return `${k === 0 ? 'M' : 'L'} ${p(a, r - 1)} Q ${p(b, r + 0.5)} ${p(((k + 1) / 12) * Math.PI * 2, r - 1)}`;
    }).join(' ') + ' Z'} />
    <Circle cx={r} cy={r} r={r - 6} fill="url(#wax)" stroke="#FFFFFF" strokeOpacity={0.25} strokeWidth={1.2} />
    <SvgText x={r} y={r + 7} fontSize={20} fontWeight="900" fill="#F7E7B4" textAnchor="middle">1</SvgText>
  </Svg>;
}

// Muted loop with a speaker button; with Reduce Motion (play=false) only the poster (or the first frame) is shown.
function LetterVideo({ source, poster, play }: { source: string; poster: string | null; play: boolean }) {
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
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(20,14,6,0.55)' },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 18, boxShadow: [{ offsetX: 0, offsetY: 18, blurRadius: 40, color: 'rgba(30,20,5,0.35)' }] },
  inner: { alignItems: 'center', gap: 8 },
  pic: { borderRadius: 10, overflow: 'hidden', borderWidth: 1, marginBottom: 6, backgroundColor: colors.surfaceSecondary },
  fill: { width: '100%', height: '100%' },
  ad: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  greeting: { fontSize: 14, fontStyle: 'italic', fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, "Times New Roman", serif' }) },
  title: { fontSize: 21, lineHeight: 26, fontWeight: '700', textAlign: 'center', letterSpacing: -0.2,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, "Times New Roman", serif' }) },
  body: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  cta: { marginTop: 6, minHeight: 46, paddingHorizontal: 22, borderRadius: 23, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  ctaText: { fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
  seal: { position: 'absolute' },
  close: { position: 'absolute', top: 16, right: 16, width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.85)' },
  sound: { position: 'absolute', right: 8, bottom: 8, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  pressed: { opacity: 0.75 },
});
