// Book It: the brand header on a wash of Book It's sky blue, then what can be booked, as tiles: dining and events on top,
// activities, play and stay below, then a "Book an appointment" button over breakdown help and a doctor. None is open yet,
// so every tile and the button answer with the app's coming-soon message.
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Icon from '@react-native-vector-icons/ionicons';
import { Text } from '@/src/ui/text';
import { IconTile } from '@/src/ui/icon-tile';
import { Tap } from '@/src/components/tap';
import { BrandHeader } from '@/src/components/brand-header';
import { colors, radius } from '@/src/theme';
import { CityScroll } from '@/src/motion';
import { useAppDimensions } from '@/src/layout';
import { useScreenPalette } from '@/src/use-screen-path';
import { announceComingSoon } from '@/src/coming-soon-mode';
import { useTranslation } from '@/src/i18n';

const SIDE = 16;
const GAP = 12;

const OUTINGS = [
  [{ id: 'dining', name: 'bookItPage.dining', icon: require('../../assets/images/book-it/dining.png') }, { id: 'events', name: 'bookItPage.events', icon: require('../../assets/images/book-it/events.png') }],
  [{ id: 'activities', name: 'bookItPage.activities', icon: require('../../assets/images/book-it/activities.png') }, { id: 'play', name: 'bookItPage.play', icon: require('../../assets/images/book-it/play.png') }, { id: 'stay', name: 'bookItPage.stay', icon: require('../../assets/images/book-it/stay.png') }],
] as const;
const APPOINTMENTS = [{ id: 'breakdown', name: 'bookItPage.breakdown', icon: require('../../assets/images/book-it/breakdown.png') }, { id: 'doctor', name: 'bookItPage.doctor', icon: require('../../assets/images/book-it/doctor.png') }] as const;
type Option = (typeof OUTINGS)[number][number] | (typeof APPOINTMENTS)[number];

export default function BookIt() {
  const { t } = useTranslation(); const palette = useScreenPalette(); const { width } = useAppDimensions();
  // Tiles share a row's width, two or three to a row.
  const across = (n: number, room: number) => (room - GAP * (n - 1)) / n;
  const option = ({ id, name, icon }: Option, size: number) => <Tap key={id} testID={`book-option-${id}`} accessibilityRole="button" accessibilityLabel={t(name)} onPress={announceComingSoon} style={[s.option, { width: size }]}>
    <IconTile source={icon} variant="sky" />
    <Text numberOfLines={2} style={s.optionName}>{t(name)}</Text>
  </Tap>;
  return <CityScroll testID="department-screen-book-it" bleed showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
    {/* A light wash of the page's own colour (the sky blue the dock picks Book It out in), fading to white. */}
    <LinearGradient pointerEvents="none" colors={[palette.top, palette.mid, colors.surface]} locations={[0, 0.5, 1]} style={s.wash} />
    <BrandHeader tone="light" />
    <View style={s.outings}>
      {OUTINGS.map(row => <View key={row[0].id} style={s.row}>{row.map(o => option(o, across(row.length, width - SIDE * 2)))}</View>)}
    </View>
    <View style={s.appointments}>
      <Tap testID="book-appointment" accessibilityRole="button" accessibilityLabel={t('bookItPage.appointment')} onPress={announceComingSoon} style={s.appointment}>
        <View style={s.appointmentIcon}><Icon name="calendar" size={20} color={colors.book} /></View>
        <View style={s.appointmentCopy}>
          <Text style={s.appointmentTitle}>{t('bookItPage.appointment')}</Text>
          <Text style={s.appointmentLine}>{t('bookItPage.appointmentLine')}</Text>
        </View>
        <Icon name="chevron-forward" size={20} color={colors.surface} />
      </Tap>
      <View style={s.row}>{APPOINTMENTS.map(o => option(o, across(APPOINTMENTS.length, width - SIDE * 2)))}</View>
    </View>
  </CityScroll>;
}

const s = StyleSheet.create({
  content: { backgroundColor: colors.surface, paddingBottom: 24 },
  wash: { position: 'absolute', top: 0, left: 0, right: 0, height: 480 },
  outings: { marginTop: 24, paddingHorizontal: SIDE, gap: 18 },
  row: { flexDirection: 'row', justifyContent: 'center', gap: GAP },
  option: { alignItems: 'center', gap: 8 },
  optionName: { fontSize: 13, lineHeight: 16, fontWeight: '700', textAlign: 'center', color: colors.onSurface },
  appointments: { marginTop: 30, paddingHorizontal: SIDE, gap: 18 },
  // A standalone deep sky-blue button: a lime calendar badge, the heading and its line, and an arrow.
  appointment: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, paddingLeft: 14, paddingRight: 16, borderRadius: radius.lg, backgroundColor: colors.book },
  appointmentIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.electricLime },
  appointmentCopy: { flex: 1, gap: 2 },
  appointmentTitle: { fontSize: 18, lineHeight: 23, fontWeight: '800', letterSpacing: -0.3, color: colors.surface },
  appointmentLine: { fontSize: 12, lineHeight: 17, color: colors.surface, opacity: 0.85 },
});
