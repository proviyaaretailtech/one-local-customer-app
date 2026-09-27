// Privacy & your data (DPDP Act; docs/DPDP.md). One place to: switch optional consents on and off
// (each change recorded with the time and notice version), download your data, correct it, delete
// your account, nominate someone, raise a grievance, and read the notice. Guests see what is kept
// on this phone and can clear it; the account-level rights need sign-in, so we know it is you.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Icon from '@react-native-vector-icons/ionicons';
import * as Haptics from 'expo-haptics';
import { AccountLayout, ActionButton, Message, accountStyles as s } from '@/src/components/account-layout';
import { colors } from '@/src/theme';
import { useAuth } from '@/src/auth';
import { useCustomer } from '@/src/customer';
import { useCart } from '@/src/cart';
import { apiPost } from '@/src/api';
import { buildDownload, clearPhone, deliverDownload, PhoneEntry, phoneSummary, pullConsents, usePrivacyChoices } from '@/src/privacy';
import { isPlaceholder, KEPT_BY_LAW, OPTIONAL_PURPOSES, PRIVACY, PURPOSES } from '@/constants/privacy';

type Panel = '' | 'grievance' | 'correction' | 'nominee';
type Receipt = { reference: string; due_at: string | null; respond_within_days: number };
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
const size = (bytes: number) => (bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`);
const tap = () => void Haptics.selectionAsync().catch(() => {});

export default function PrivacyScreen() {
  const router = useRouter();
  const { open } = useLocalSearchParams<{ open?: string }>();
  const auth = useAuth(); const user = auth.session?.user;
  const customer = useCustomer(); const cart = useCart();
  const choices = usePrivacyChoices();
  const who = user?.email || (user?.phone ? `+${user.phone.replace(/^\+/, '')}` : '');

  const [panel, setPanel] = useState<Panel>(open === 'grievance' || open === 'nominee' || open === 'correction' ? open : '');
  const [phone, setPhone] = useState<PhoneEntry[] | null>(null);
  const [busy, setBusy] = useState<'' | 'download' | 'clear' | 'delete'>('');
  const [note, setNote] = useState(''); const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<'' | 'clear' | 'delete'>('');
  const [erased, setErased] = useState<{ reference: string; message: string } | null>(null);

  const refreshPhone = () => { void phoneSummary().then(setPhone).catch(() => setPhone([])); };
  // Again whenever a choice is saved (it is stored on the phone too).
  useEffect(refreshPhone, [choices.history.length]);
  useEffect(() => { if (user?.id) void pullConsents(); }, [user?.id]);
  const signIn = () => router.push('/sign-in?next=/privacy' as never);

  const toggle = (purpose: (typeof OPTIONAL_PURPOSES)[number], value: boolean) => {
    tap(); void choices.set(purpose, value);
    // "Offers near me" on the You tab is a marketing message too: withdrawing here switches it off.
    if (purpose === 'marketing' && !value && customer.profile.notifications.offers) {
      void customer.update({ profile: { ...customer.profile, notifications: { ...customer.profile.notifications, offers: false } } }).catch(() => {});
    }
  };
  const lastChange = (purpose: string) => [...choices.history].reverse().find(c => c.purpose === purpose);

  const download = async () => {
    setError(''); setNote(''); setBusy('download');
    try {
      const { file, reference } = await buildDownload(!!user);
      const name = await deliverDownload(file);
      setNote(reference ? `Your data is ready: ${name}. Reference ${reference}.` : `What this phone keeps is ready: ${name}.`);
    } catch (e) { setError((e as Error).message || 'Couldn’t prepare your data. Please try again.'); }
    finally { setBusy(''); refreshPhone(); }
  };

  const clearThisPhone = async () => {
    setBusy('clear'); setError('');
    try {
      await clearPhone(); await customer.reset(); cart.clear();
      setConfirm(''); setNote('Cleared. Everything One Local kept on this phone is gone; the place you shop for resets when you reopen the app.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch { setError('Couldn’t clear everything. Please try again.'); }
    // The emptied cart saves itself a moment later (an empty cart, nothing personal); list after that.
    finally { setBusy(''); setTimeout(refreshPhone, 600); }
  };

  const deleteAccount = async () => {
    setBusy('delete'); setError('');
    try {
      const result = await apiPost<{ reference: string; message: string }>('/privacy/erasure', { confirm: 'DELETE' });
      await auth.signOut(false).catch(() => {});
      await clearPhone().catch(() => {}); await customer.reset().catch(() => {}); cart.clear();
      setConfirm(''); setErased(result); setPanel('');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) { setError((e as Error).message || 'Couldn’t delete your account right now. Please try again.'); }
    finally { setBusy(''); refreshPhone(); }
  };

  return <AccountLayout id="privacy" title="Privacy & your data" subtitle="Your choices, your data, and your rights under India’s data protection law. Changes save as you tap.">
    {erased && <View testID="privacy-erased" style={[s.card, st.done]}>
      <Icon name="checkmark-circle" size={28} color={colors.forest} />
      <Text style={s.title}>Your account is deleted</Text>
      <Text selectable style={s.hint}>{erased.message}</Text>
      <Text selectable testID="privacy-erased-reference" style={st.reference}>Reference {erased.reference}</Text>
    </View>}

    <View testID="privacy-who" style={[s.card, st.whoCard]}>
      <View style={s.row}>
        <View style={st.icon}><Icon name={user ? 'person-outline' : 'phone-portrait-outline'} size={18} color={colors.forest} /></View>
        <View style={s.flex}>
          <Text style={st.itemTitle}>{user ? 'Signed in' : 'Browsing as a guest'}</Text>
          {user
            ? <Text style={s.hint} numberOfLines={2}>{who}. Your choices and requests are kept with your account.</Text>
            : <Text style={s.hint}>What this phone keeps is listed below. Orders placed without an account are on our servers under this phone’s private key: sign in on this phone to download or delete them too.</Text>}
        </View>
      </View>
      {!user && <Pressable testID="privacy-sign-in" accessibilityRole="button" onPress={signIn} style={st.secondary}><Text style={st.secondaryText}>Sign in to download, correct or delete account data</Text></Pressable>}
    </View>

    <Text style={st.group}>Your choices</Text>
    <View testID="privacy-choices" style={s.card}>
      {OPTIONAL_PURPOSES.map((p, i) => {
        const last = lastChange(p);
        return <View key={p} style={[st.toggleRow, i > 0 && st.divided]}>
          <View style={s.flex}>
            <Text style={st.itemTitle}>{PURPOSES[p].title}</Text>
            <Text style={s.hint}>{PURPOSES[p].body}</Text>
            {last && <Text testID={`consent-${p}-changed`} style={st.meta}>{last.granted ? 'Switched on' : 'Switched off'} {when(last.at)} · notice {last.notice_version}</Text>}
          </View>
          <Switch testID={`consent-${p}`} accessibilityLabel={PURPOSES[p].title} disabled={!choices.ready} value={choices.current[p]} onValueChange={v => toggle(p, v)}
            trackColor={{ true: colors.forest, false: colors.borderStrong }} thumbColor={colors.surface} />
        </View>;
      })}
      <Text testID="privacy-choices-note" style={st.meta}>
        {user ? (choices.unsent ? `Saved on this phone; ${choices.unsent} change${choices.unsent === 1 ? '' : 's'} will reach your account when you are online.` : 'Saved on this phone and with your account.') : 'Saved on this phone. Sign in to keep them with your account.'}
        {' '}Everything needed to deliver your orders works whatever you choose here.
      </Text>
    </View>

    <Text style={st.group}>Your data</Text>
    <View testID="privacy-actions" style={[s.card, st.rows]}>
      <Row id="privacy-download" icon="download-outline" title="Download my data" sub={user ? 'Everything we hold about you, plus what is on this phone, as one file.' : 'What this phone keeps, as one file.'} busy={busy === 'download'} onPress={download} />
      <Row id="privacy-correct" icon="create-outline" title="Correct my details" sub="Edit your name, phone, email, photo and birthday." onPress={() => router.push('/profile-edit')} />
      <Row id="privacy-correct-ask" icon="construct-outline" title="Ask us to correct something else" sub="For example an old order or your sign-in email." locked={!user} onPress={() => (user ? setPanel(panel === 'correction' ? '' : 'correction') : signIn())} />
      <Row id="privacy-nominee" icon="people-outline" title="Nominate someone" sub="Who can use these rights for you if you die or cannot act." locked={!user} onPress={() => (user ? setPanel(panel === 'nominee' ? '' : 'nominee') : signIn())} />
      <Row id="privacy-grievance" icon="chatbubble-ellipses-outline" title="Raise a privacy grievance" sub={`We answer within ${PRIVACY.responseDays} days, with a reference number.`} locked={!user} onPress={() => (user ? setPanel(panel === 'grievance' ? '' : 'grievance') : signIn())} />
      <Row id="privacy-notice-link" icon="document-text-outline" title="Read the privacy notice" sub={`Version ${PRIVACY.noticeVersion} · ${PRIVACY.noticeDate}`} last onPress={() => router.push('/privacy-notice' as never)} />
    </View>
    <Message id="privacy-note" text={note} />
    <Message id="privacy-error" text={error} error />

    {user && panel === 'grievance' && <RequestForm key="grievance" kind="grievance" onClose={() => setPanel('')} />}
    {user && panel === 'correction' && <RequestForm key="correction" kind="correction" onClose={() => setPanel('')} />}
    {user && panel === 'nominee' && <NomineeForm onClose={() => setPanel('')} />}

    <Text style={st.group}>Stored on this phone</Text>
    <View testID="privacy-phone" style={s.card}>
      {phone === null ? <ActivityIndicator color={colors.forest} /> : phone.length === 0
        ? <Text testID="privacy-phone-empty" style={s.hint}>Nothing from One Local is stored on this phone.</Text>
        : phone.map(e => <View key={e.label} style={st.phoneRow}>
            <Icon name={e.secret ? 'key-outline' : 'document-outline'} size={16} color={colors.muted} />
            <Text style={[s.hint, s.flex]}>{e.label}</Text>
            <Text style={st.meta}>{e.secret ? 'private' : size(e.bytes)}</Text>
          </View>)}
      {!user && !!phone?.length && <Pressable testID="privacy-clear-phone" accessibilityRole="button" onPress={() => { setError(''); setConfirm('clear'); }} style={st.outlineDanger}>
        <Icon name="trash-outline" size={17} color={colors.onError} /><Text style={st.outlineDangerText}>Clear everything on this phone</Text>
      </Pressable>}
      {!!user && <Text style={st.meta}>Signing out keeps these on this phone; deleting your account below removes them too.</Text>}
    </View>

    {!!user && <>
      <Text style={st.group}>Delete my account</Text>
      <View testID="privacy-delete-card" style={s.card}>
        <Text style={s.hint}>Removes your personal details from One Local and signs you out everywhere. Some records must be kept by law; they stop pointing to you.</Text>
        <Pressable testID="privacy-delete" accessibilityRole="button" onPress={() => { setError(''); setConfirm('delete'); }} style={st.outlineDanger}>
          <Icon name="person-remove-outline" size={17} color={colors.onError} /><Text style={st.outlineDangerText}>Delete my account</Text>
        </Pressable>
      </View>
    </>}

    <View testID="privacy-contact" style={[s.card, st.contact]}>
      <Text style={st.itemTitle}>Questions about your data?</Text>
      <Text style={s.hint}>Grievance officer: <Text style={isPlaceholder(PRIVACY.grievanceOfficer.name) ? st.todo : st.strong}>{PRIVACY.grievanceOfficer.name}</Text></Text>
      <Text style={s.hint}>Email: <Text style={isPlaceholder(PRIVACY.grievanceOfficer.email) ? st.todo : st.strong}>{PRIVACY.grievanceOfficer.email}</Text></Text>
      <Text style={s.hint}>Phone: <Text style={isPlaceholder(PRIVACY.grievanceOfficer.phone) ? st.todo : st.strong}>{PRIVACY.grievanceOfficer.phone}</Text> · {PRIVACY.grievanceOfficer.hours}</Text>
      <Text style={s.hint}>Not satisfied with our answer? You can complain to the {PRIVACY.board.name}.</Text>
    </View>

    <Modal transparent visible={confirm === 'delete'} animationType="fade" onRequestClose={() => !busy && setConfirm('')}>
      <Pressable style={st.overlay} onPress={() => !busy && setConfirm('')}>
        <Pressable testID="privacy-delete-sheet" style={st.sheet} onPress={() => {}}><ScrollView contentContainerStyle={st.sheetScroll}>
          <Text style={st.sheetTitle}>Delete your account?</Text>
          <Text style={st.sheetBody}>This cannot be undone.{who ? ` You are signed in as ${who}.` : ''}</Text>
          <Text style={st.sheetHead}>Deleted now</Text>
          {['Delivery addresses and notes on your orders', 'Your help messages and booking requests', 'Your profile, saved addresses, wishlist and cart on this phone', 'Your optional consents (switched off)', 'Your login: closed by our team, and you are signed out everywhere at once'].map(line =>
            <Text key={line} style={st.sheetLine}>•  {line}</Text>)}
          <Text style={st.sheetHead}>Kept because the law requires it (no longer linked to you)</Text>
          {KEPT_BY_LAW.map(line => <Text key={line} style={st.sheetLine}>•  {line}</Text>)}
          {!!error && <Text testID="privacy-delete-error" style={st.sheetError}>{error}</Text>}
          <Pressable testID="privacy-delete-confirm" disabled={!!busy} onPress={deleteAccount} style={st.sheetDanger}>
            {busy === 'delete' ? <ActivityIndicator color="#fff" /> : <Text style={st.sheetDangerText}>Delete my account</Text>}
          </Pressable>
          <Pressable testID="privacy-delete-cancel" disabled={!!busy} onPress={() => setConfirm('')} style={st.sheetCancel}><Text style={st.sheetCancelText}>Keep my account</Text></Pressable>
        </ScrollView></Pressable>
      </Pressable>
    </Modal>

    <Modal transparent visible={confirm === 'clear'} animationType="fade" onRequestClose={() => !busy && setConfirm('')}>
      <Pressable style={st.overlay} onPress={() => !busy && setConfirm('')}>
        <Pressable testID="privacy-clear-sheet" style={st.sheet} onPress={() => {}}>
          <Text style={st.sheetTitle}>Clear this phone?</Text>
          <Text style={st.sheetBody}>Removes your profile, saved addresses, wishlist, cart, recent places and privacy choices from this phone. Orders you placed without an account will no longer show here.</Text>
          {!!error && <Text style={st.sheetError}>{error}</Text>}
          <Pressable testID="privacy-clear-confirm" disabled={!!busy} onPress={clearThisPhone} style={st.sheetDanger}>
            {busy === 'clear' ? <ActivityIndicator color="#fff" /> : <Text style={st.sheetDangerText}>Clear everything</Text>}
          </Pressable>
          <Pressable testID="privacy-clear-cancel" disabled={!!busy} onPress={() => setConfirm('')} style={st.sheetCancel}><Text style={st.sheetCancelText}>Cancel</Text></Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  </AccountLayout>;
}

function Row({ id, icon, title, sub, onPress, busy, locked, last }: { id: string; icon: string; title: string; sub: string; onPress: () => void; busy?: boolean; locked?: boolean; last?: boolean }) {
  return <Pressable testID={id} accessibilityRole="button" accessibilityHint={locked ? 'Sign in first' : undefined} disabled={busy} onPress={onPress}
    style={({ pressed }) => [st.row, !last && st.divided, pressed && { opacity: 0.6 }]}>
    <View style={st.icon}><Icon name={icon as never} size={18} color={colors.forest} /></View>
    <View style={s.flex}><Text style={st.itemTitle}>{title}</Text><Text style={s.hint}>{sub}</Text></View>
    {busy ? <ActivityIndicator color={colors.forest} /> : locked ? <View style={st.lock}><Icon name="lock-closed" size={11} color={colors.muted} /><Text style={st.lockText}>Sign in</Text></View> : <Icon name="chevron-forward" size={18} color={colors.muted} />}
  </Pressable>;
}

// A grievance, or a request to correct something the person cannot edit in the app themselves.
const ABOUT: { id: string; label: string }[] = [
  { id: 'consent', label: 'My consent' }, { id: 'marketing', label: 'Messages I didn’t want' }, { id: 'access', label: 'Seeing my data' },
  { id: 'erasure', label: 'Deleting my data' }, { id: 'security', label: 'Safety of my data' }, { id: 'other', label: 'Something else' },
];
function RequestForm({ kind, onClose }: { kind: 'grievance' | 'correction'; onClose: () => void }) {
  const [about, setAbout] = useState(kind === 'correction' ? 'correction' : 'consent');
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const send = async () => {
    setError('');
    if (message.trim().length < 10) return setError('Please describe it in at least 10 characters.');
    setBusy(true);
    try { setReceipt(await apiPost<Receipt>('/privacy/grievances', { kind, about, message: message.trim() })); setMessage(''); }
    catch (e) { setError((e as Error).message || 'Couldn’t send this. Your message is still here; please try again.'); }
    finally { setBusy(false); }
  };
  return <View testID={`privacy-${kind}-form`} style={s.card}>
    <View style={s.row}><Text style={[s.title, s.flex]}>{kind === 'correction' ? 'Ask us to correct something' : 'Raise a privacy grievance'}</Text><Pressable testID={`privacy-${kind}-close`} accessibilityLabel="Close" onPress={onClose} hitSlop={8} style={st.close}><Icon name="close" size={20} color={colors.muted} /></Pressable></View>
    {receipt ? <Receipted receipt={receipt} what={kind === 'correction' ? 'correction request' : 'grievance'} /> : <>
      {kind === 'grievance' && <View style={st.chips}>{ABOUT.map(a => <Pressable key={a.id} testID={`privacy-about-${a.id}`} accessibilityRole="radio" accessibilityState={{ selected: about === a.id }} onPress={() => setAbout(a.id)} style={[st.chip, about === a.id && st.chipOn]}><Text style={[st.chipText, about === a.id && st.chipTextOn]}>{a.label}</Text></Pressable>)}</View>}
      <TextInput testID={`privacy-${kind}-message`} accessibilityLabel="Describe it" placeholder={kind === 'correction' ? 'What is wrong, and what should it say?' : 'Tell us what happened…'} value={message} onChangeText={setMessage}
        maxLength={2000} multiline textAlignVertical="top" style={[s.input, st.message]} placeholderTextColor={colors.muted} />
      <Text style={st.meta}>Please don’t include card numbers, passwords or bank details.</Text>
      <Message id={`privacy-${kind}-error`} text={error} error />
      <ActionButton id={`privacy-${kind}-submit`} title={kind === 'correction' ? 'Send correction request' : 'Send grievance'} onPress={send} busy={busy} />
    </>}
  </View>;
}

const RELATIONSHIPS = [['spouse', 'Spouse'], ['parent', 'Parent'], ['child', 'Child'], ['sibling', 'Brother or sister'], ['relative', 'Other relative'], ['friend', 'Friend'], ['other', 'Someone else']] as const;
function NomineeForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState(''); const [relationship, setRelationship] = useState<string>('');
  const [phone, setPhone] = useState(''); const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [receipt, setReceipt] = useState<Receipt | null>(null);
  const send = async () => {
    setError('');
    if (name.trim().length < 2) return setError('Enter your nominee’s full name.');
    if (!relationship) return setError('Choose how they are related to you.');
    if (!phone.trim() && !email.trim()) return setError('Give a mobile number or an email so we can reach them.');
    setBusy(true);
    try { setReceipt(await apiPost<Receipt>('/privacy/nominee', { name: name.trim(), relationship, phone: phone.trim(), email: email.trim() })); }
    catch (e) { setError((e as Error).message || 'Couldn’t save your nominee. Please try again.'); }
    finally { setBusy(false); }
  };
  return <View testID="privacy-nominee-form" style={s.card}>
    <View style={s.row}><Text style={[s.title, s.flex]}>Nominate someone</Text><Pressable testID="privacy-nominee-close" accessibilityLabel="Close" onPress={onClose} hitSlop={8} style={st.close}><Icon name="close" size={20} color={colors.muted} /></Pressable></View>
    {receipt ? <Receipted receipt={receipt} what="nomination" /> : <>
      <Text style={s.hint}>If you die or cannot act for yourself, this person can ask us to show, correct or delete your data. Tell them you have named them. A new nomination replaces the old one.</Text>
      <TextInput testID="privacy-nominee-name" accessibilityLabel="Nominee’s full name" placeholder="Nominee’s full name" value={name} onChangeText={setName} maxLength={80} autoCapitalize="words" style={s.input} placeholderTextColor={colors.muted} />
      <View style={st.chips}>{RELATIONSHIPS.map(([id, label]) => <Pressable key={id} testID={`privacy-nominee-${id}`} accessibilityRole="radio" accessibilityState={{ selected: relationship === id }} onPress={() => setRelationship(id)} style={[st.chip, relationship === id && st.chipOn]}><Text style={[st.chipText, relationship === id && st.chipTextOn]}>{label}</Text></Pressable>)}</View>
      <TextInput testID="privacy-nominee-phone" accessibilityLabel="Nominee’s mobile number" placeholder="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={16} style={s.input} placeholderTextColor={colors.muted} />
      <TextInput testID="privacy-nominee-email" accessibilityLabel="Nominee’s email" placeholder="Email (optional if you gave a number)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" maxLength={120} style={s.input} placeholderTextColor={colors.muted} />
      <Message id="privacy-nominee-error" text={error} error />
      <ActionButton id="privacy-nominee-submit" title="Save my nominee" onPress={send} busy={busy} />
    </>}
  </View>;
}

function Receipted({ receipt, what }: { receipt: Receipt; what: string }) {
  return <View testID="privacy-receipt" style={st.receipt}>
    <Icon name="checkmark-circle" size={24} color={colors.forest} />
    <Text selectable testID="privacy-receipt-reference" style={st.reference}>Reference {receipt.reference}</Text>
    <Text selectable style={s.hint}>We have your {what}. We will answer{receipt.due_at ? ` by ${day(receipt.due_at)}` : ''}, within {receipt.respond_within_days} days at the latest. Quote the reference if you contact us.</Text>
  </View>;
}

const st = StyleSheet.create({
  group: { fontSize: 12, fontWeight: '800', color: colors.muted, letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 8, marginBottom: 8, marginLeft: 6 },
  whoCard: { gap: 12 },
  done: { alignItems: 'flex-start', backgroundColor: colors.limeSoft },
  reference: { color: colors.forest, fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },
  icon: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.limeSoft, alignItems: 'center', justifyContent: 'center' },
  itemTitle: { color: colors.onSurface, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  meta: { color: colors.onSurfaceTertiary, fontSize: 11, lineHeight: 16, marginTop: 2 },
  strong: { color: colors.onSurface, fontWeight: '700' },
  todo: { color: colors.onWarning, backgroundColor: colors.warning, fontWeight: '700' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  divided: { borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 14 },
  rows: { gap: 0, paddingVertical: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 10 },
  lock: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surfaceSecondary, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4 },
  lockText: { fontSize: 10, fontWeight: '800', color: colors.muted },
  secondary: { minHeight: 48, borderRadius: 16, backgroundColor: colors.electricLime, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  secondaryText: { color: '#050605', fontSize: 13, fontWeight: '800', textAlign: 'center' },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 28 },
  outlineDanger: { minHeight: 50, borderRadius: 16, borderWidth: 1.5, borderColor: colors.onError, backgroundColor: colors.error, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 },
  outlineDangerText: { color: colors.onError, fontSize: 14, fontWeight: '800' },
  contact: { backgroundColor: colors.surfaceSecondary, gap: 6 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', backgroundColor: colors.surface },
  chipOn: { backgroundColor: '#050605', borderColor: '#050605' },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.onSurface },
  chipTextOn: { color: colors.electricLime },
  message: { minHeight: 120 },
  receipt: { backgroundColor: colors.limeSoft, padding: 16, borderRadius: 16, gap: 8 },
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: 34, gap: 8, maxHeight: '92%' },
  sheetScroll: { gap: 8 },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: colors.onSurface },
  sheetBody: { fontSize: 14, lineHeight: 20, color: colors.muted },
  sheetHead: { fontSize: 13, fontWeight: '800', color: colors.onSurface, marginTop: 8 },
  sheetLine: { fontSize: 12, lineHeight: 18, color: colors.muted },
  sheetError: { color: colors.onError, fontSize: 13, lineHeight: 18 },
  sheetDanger: { minHeight: 52, borderRadius: 16, backgroundColor: colors.onError, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  sheetDangerText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  sheetCancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  sheetCancelText: { color: colors.onSurface, fontSize: 14, fontWeight: '700' },
});
