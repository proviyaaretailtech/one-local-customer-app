// The privacy notice (DPDP Act s.5, Rule 3): itemised, in plain English, standing on its own. Every
// fact comes from constants/privacy.ts, so the company, the grievance officer and the Board's link
// are filled in once. Placeholders still to be filled show highlighted, with a "draft" banner.
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Icon from '@react-native-vector-icons/ionicons';
import { AccountLayout, accountStyles as s } from '@/src/components/account-layout';
import { colors } from '@/src/theme';
import { isPlaceholder, KEPT_BY_LAW, NOTICE_ITEMS, OPTIONAL_PURPOSES, PRIVACY, PURPOSES, SHARED_WITH } from '@/constants/privacy';

const g = PRIVACY.grievanceOfficer;
const FACTS = [PRIVACY.legalEntity, PRIVACY.registeredAddress, g.name, g.email, g.phone, PRIVACY.board.complaintLink, ...SHARED_WITH.map(x => x.where)];
const draft = FACTS.some(isPlaceholder);

// A fact that is still a placeholder is shown highlighted, so it cannot be missed before launch.
function Fact({ value, id }: { value: string; id?: string }) {
  return <Text testID={id} style={isPlaceholder(value) ? st.todo : st.fact}>{value}</Text>;
}

function Section({ title, icon, children, id }: { title: string; icon: string; children: React.ReactNode; id: string }) {
  return <View testID={`notice-${id}`} style={s.card}>
    <View style={s.row}><View style={st.icon}><Icon name={icon as never} size={18} color={colors.forest} /></View><Text style={[s.title, s.flex]}>{title}</Text></View>
    {children}
  </View>;
}

export default function PrivacyNotice() {
  const router = useRouter();
  return <AccountLayout id="privacy-notice" title="Privacy notice" subtitle={`How ${PRIVACY.brand} uses your personal data, why, and how you stay in control. Written to be read in two minutes.`}>
    <View style={st.version}><Icon name="document-text-outline" size={16} color={colors.forest} /><Text testID="privacy-notice-version" style={st.versionText}>Version {PRIVACY.noticeVersion} · {PRIVACY.noticeDate}</Text></View>
    {draft && <View testID="privacy-notice-draft" style={st.draft}><Icon name="construct-outline" size={16} color={colors.onWarning} /><Text style={st.draftText}>Draft: highlighted details are still being filled in.</Text></View>}

    <Section id="who" title="Who we are" icon="business-outline">
      <Text style={s.hint}>{PRIVACY.brand} is run by <Fact id="privacy-notice-entity" value={PRIVACY.legalEntity} />, <Fact value={PRIVACY.registeredAddress} />. We decide why and how your data is used, so under India’s Digital Personal Data Protection Act, 2023 we are the “Data Fiduciary” and you are the “Data Principal”.</Text>
    </Section>

    <Section id="collect" title="What we collect, and why" icon="list-outline">
      {NOTICE_ITEMS.map((item, i) => <View key={item.data} testID={`notice-item-${i}`} style={st.item}>
        <View style={st.itemTop}><Text style={[st.itemTitle, s.flex]}>{item.data}</Text><Text style={item.basis === 'needed' ? st.needed : st.optional}>{item.basis === 'needed' ? 'Needed for orders' : 'Optional'}</Text></View>
        <Text style={s.hint}>{item.why}</Text>
        <Text style={st.kept}>Kept: {item.kept}</Text>
      </View>)}
      <Text style={s.hint}>We collect only what these purposes need, and use it only for them.</Text>
    </Section>

    <Section id="share" title="Who we share it with" icon="people-outline">
      {SHARED_WITH.map(x => <View key={x.who} style={st.item}>
        <Text style={st.itemTitle}>{x.who}</Text><Text style={s.hint}>{x.what}</Text><Text style={st.kept}>Where: <Fact value={x.where} /></Text>
      </View>)}
      <Text style={s.hint}>We never sell your data. Anyone who handles it for us may use it only on our instructions, and must keep it safe.</Text>
    </Section>

    <Section id="consent" title="Your choices, and taking them back" icon="toggle-outline">
      <Text style={s.hint}>What is needed to deliver an order does not need a separate yes. Everything else is off until you switch it on:</Text>
      {OPTIONAL_PURPOSES.map(p => <Text key={p} style={st.bullet}>•  <Text style={st.strong}>{PURPOSES[p].title}.</Text> {PURPOSES[p].body}</Text>)}
      <Text style={s.hint}>To withdraw a consent, go to You → Privacy & your data and switch it off: one tap, as easy as giving it. We stop within a reasonable time and tell anyone handling it for us to stop too. Withdrawing does not undo what was lawfully done before, and never affects your orders.</Text>
      <Link id="privacy-notice-open-choices" label="Open Privacy & your data" onPress={() => router.push('/privacy' as never)} />
    </Section>

    <Section id="rights" title="Your rights" icon="shield-checkmark-outline">
      {[
        ['See your data', 'Download everything we hold about you, with who we shared it with.'],
        ['Correct it', 'Edit your profile any time, or ask us to fix anything else.'],
        ['Delete it', 'Delete your account. We erase what we can at once and tell you what the law makes us keep.'],
        ['Nominate someone', 'Name a person who can use these rights for you if you die or cannot act.'],
        ['Complain', `Raise a grievance with us; we answer within ${PRIVACY.responseDays} days.`],
      ].map(([title, body]) => <Text key={title} style={st.bullet}>•  <Text style={st.strong}>{title}.</Text> {body}</Text>)}
      <Text style={s.hint}>All of these are in You → Privacy & your data. We may ask you to sign in first, so we know it is you.</Text>
    </Section>

    <Section id="kept" title="What we must keep" icon="archive-outline">
      {KEPT_BY_LAW.map(line => <Text key={line} style={st.bullet}>•  {line}</Text>)}
      <Text style={s.hint}>Everything else is erased once it is no longer needed for the purpose you gave it for, or when you withdraw consent.</Text>
    </Section>

    <Section id="children" title="Children" icon="happy-outline">
      <Text style={s.hint}>Accounts are for people aged {PRIVACY.minimumAge} or older. A child can use One Local only through a parent’s or guardian’s own account. We do not track children’s behaviour or show them targeted advertising.</Text>
    </Section>

    <Section id="security" title="Keeping it safe" icon="lock-closed-outline">
      <Text style={s.hint}>Your data travels encrypted, is stored with {PRIVACY.hosting}, and only our servers can read the database; the app on your phone cannot. Access is logged and the logs are kept for a year. If a breach ever affects your data, we will tell you and the Data Protection Board of India without delay, with what happened and what you can do.</Text>
    </Section>

    <Section id="complain" title="Questions and complaints" icon="chatbubbles-outline">
      <Text style={s.hint}>Our grievance officer answers questions about your personal data:</Text>
      <View style={st.contact}>
        <Fact id="privacy-notice-officer" value={g.name} />
        <Fact id="privacy-notice-email" value={g.email} />
        <Fact value={g.phone} />
        <Text style={s.hint}>{g.hours}</Text>
      </View>
      <Text style={s.hint}>We reply within {PRIVACY.responseDays} days. If you are not satisfied, you can complain to the {PRIVACY.board.name}: <Fact id="privacy-notice-board" value={PRIVACY.board.complaintLink} />. Please use our grievance process first; the Act asks for that.</Text>
      <Link id="privacy-notice-raise" label="Raise a privacy grievance" onPress={() => router.push('/privacy?open=grievance' as never)} />
      {!isPlaceholder(g.email) && <Link id="privacy-notice-mail" label={`Email ${g.email}`} onPress={() => void Linking.openURL(`mailto:${g.email}`)} />}
    </Section>

    <Section id="changes" title="Changes and languages" icon="language-outline">
      <Text style={s.hint}>When this notice changes, the version above changes, and we ask again wherever your consent is needed. You can ask us for this notice in Marathi, Hindi or any language in the Eighth Schedule to the Constitution.</Text>
    </Section>
  </AccountLayout>;
}

function Link({ id, label, onPress }: { id: string; label: string; onPress: () => void }) {
  return <Pressable testID={id} accessibilityRole="link" onPress={onPress} style={st.link}><Text style={st.linkText}>{label}</Text><Icon name="chevron-forward" size={16} color={colors.forest} /></Pressable>;
}

const st = StyleSheet.create({
  version: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: colors.limeSoft, marginBottom: 12 },
  versionText: { color: colors.forest, fontSize: 12, fontWeight: '700' },
  draft: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 14, backgroundColor: colors.warning, marginBottom: 16 },
  draftText: { flex: 1, color: colors.onWarning, fontSize: 12, fontWeight: '600', lineHeight: 18 },
  icon: { width: 34, height: 34, borderRadius: 12, backgroundColor: colors.limeSoft, alignItems: 'center', justifyContent: 'center' },
  item: { gap: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.divider },
  itemTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  itemTitle: { color: colors.onSurface, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  needed: { fontSize: 10, fontWeight: '800', color: colors.forest, backgroundColor: colors.limeSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' },
  optional: { fontSize: 10, fontWeight: '800', color: colors.book, backgroundColor: colors.bookSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' },
  kept: { color: colors.onSurfaceTertiary, fontSize: 11, lineHeight: 17 },
  bullet: { color: colors.muted, fontSize: 12, lineHeight: 19 },
  strong: { color: colors.onSurface, fontWeight: '700' },
  fact: { color: colors.onSurface, fontWeight: '700' },
  todo: { color: colors.onWarning, backgroundColor: colors.warning, fontWeight: '700' },
  contact: { gap: 4, padding: 14, borderRadius: 16, backgroundColor: colors.surfaceSecondary },
  link: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  linkText: { color: colors.forest, fontSize: 14, fontWeight: '700' },
});
