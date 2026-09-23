import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import Icon from '@react-native-vector-icons/ionicons';
import { Diet, useCustomer } from '@/src/customer';
import { colors } from '@/src/theme';
import { AccountLayout, ActionButton, Message, accountStyles as s } from '@/src/components/account-layout';

const DIETS: { id: Diet; label: string }[] = [{ id: '', label: 'Anything' }, { id: 'veg', label: 'Veg' }, { id: 'egg', label: 'Egg' }, { id: 'nonveg', label: 'Non-veg' }];

export default function ProfileEdit() {
  const { profile, update, ready } = useCustomer(); const [draft, setDraft] = useState(profile); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  useEffect(() => { if (ready) setDraft(profile); }, [ready, profile]);

  // Photos are stored small (square, compressed, as a data URI) so they fit in on-device storage.
  const pickPhoto = async (camera: boolean) => {
    setError('');
    try {
      if (camera) { const p = await ImagePicker.requestCameraPermissionsAsync(); if (!p.granted) return setError('Camera access is off. Allow it in settings, or choose a photo instead.'); }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.35, base64: true };
      const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync({ ...options, selectionLimit: 1 });
      const asset = result.canceled ? null : result.assets[0];
      if (!asset) return;
      const photo = asset.base64 ? `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}` : asset.uri;
      if (photo.length > 900_000) return setError('That photo is too large. Try a smaller one.');
      setDraft(d => ({ ...d, photo }));
    } catch { setError('Could not open your photos. Please try again.'); }
  };

  const save = async () => {
    setMessage(''); setError('');
    if (draft.name.trim().length < 2) return setError('Please enter a name with at least two characters.');
    if (draft.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) return setError('Please enter a valid email address.');
    if (draft.phone && !/^[6-9]\d{9}$/.test(draft.phone.trim())) return setError('Please enter a valid 10-digit Indian mobile number.');
    if (draft.birthday && !/^(0?[1-9]|[12]\d|3[01])\/(0?[1-9]|1[0-2])$/.test(draft.birthday.trim())) return setError('Enter your birthday as DD/MM, for example 14/08.');
    setBusy(true);
    try { await update({ profile: { ...draft, name: draft.name.trim(), email: draft.email.trim(), phone: draft.phone.trim(), birthday: draft.birthday.trim() } }); setMessage('Saved. Your profile looks great.'); }
    catch { setError('Could not save your profile. Please try again.'); }
    finally { setBusy(false); }
  };

  const initials = draft.name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return <AccountLayout id="profile-edit" title="Make it yours" subtitle="Your photo and details, saved on this device.">
    <View style={styles.photoBlock}>
      <View style={styles.photoRing}>{draft.photo ? <Image testID="profile-photo" source={draft.photo} style={styles.photo} contentFit="cover" /> : <View style={styles.placeholder}>{initials ? <Text style={styles.initials}>{initials}</Text> : <Icon name={`${draft.avatar}-outline` as any} size={40} color="#050605" />}</View>}</View>
      <View style={styles.photoActions}>
        <Pressable testID="profile-photo-library" onPress={() => void pickPhoto(false)} style={styles.photoBtn}><Icon name="images-outline" size={17} color={colors.forest} /><Text style={styles.photoBtnText}>Choose photo</Text></Pressable>
        <Pressable testID="profile-photo-camera" onPress={() => void pickPhoto(true)} style={styles.photoBtn}><Icon name="camera-outline" size={17} color={colors.forest} /><Text style={styles.photoBtnText}>Take photo</Text></Pressable>
        {!!draft.photo && <Pressable testID="profile-photo-remove" onPress={() => setDraft(d => ({ ...d, photo: '' }))} style={styles.photoBtn}><Icon name="trash-outline" size={17} color={colors.onError} /></Pressable>}
      </View>
      {!draft.photo && <View style={styles.avatars}>{['person', 'happy', 'flower', 'rocket'].map(icon => <Pressable key={icon} testID={`profile-avatar-${icon}`} accessibilityLabel={`Choose ${icon} avatar`} accessibilityState={{ selected: draft.avatar === icon }} style={[styles.avatar, draft.avatar === icon && styles.selected]} onPress={() => setDraft({ ...draft, avatar: icon })}><Icon name={`${icon}-outline` as any} color={colors.forest} size={22} /></Pressable>)}</View>}
    </View>

    <View style={s.card}>{[
      { key: 'name', label: 'Full name', placeholder: 'What should we call you?' },
      { key: 'email', label: 'Email address · optional', placeholder: 'you@example.com' },
      { key: 'phone', label: 'Mobile number · optional', placeholder: '10-digit mobile number' },
      { key: 'birthday', label: 'Birthday · optional', placeholder: 'DD/MM — for a little treat' },
    ].map(f => <View key={f.key}><Text testID={`profile-${f.key}-label`} style={s.label}>{f.label}</Text><TextInput testID={`profile-${f.key}-input`} accessibilityLabel={f.label} value={draft[f.key as 'name' | 'email' | 'phone' | 'birthday']} onChangeText={value => setDraft({ ...draft, [f.key]: value })} editable={ready && !busy} autoCapitalize={f.key === 'name' ? 'words' : 'none'} keyboardType={f.key === 'email' ? 'email-address' : f.key === 'phone' ? 'phone-pad' : f.key === 'birthday' ? 'numbers-and-punctuation' : 'default'} maxLength={f.key === 'phone' ? 10 : f.key === 'birthday' ? 5 : 100} placeholder={f.placeholder} placeholderTextColor={colors.muted} style={s.input} /></View>)}
      <View><Text style={s.label}>Food preference</Text><View style={styles.chips}>{DIETS.map(d => <Pressable key={d.id || 'any'} testID={`profile-diet-${d.id || 'any'}`} accessibilityState={{ selected: draft.diet === d.id }} onPress={() => setDraft({ ...draft, diet: d.id })} style={[styles.chip, draft.diet === d.id && styles.chipOn]}><Text style={[styles.chipText, draft.diet === d.id && styles.chipTextOn]}>{d.label}</Text></Pressable>)}</View></View>
    </View>
    <Message id="profile-edit-error" text={error} error /><Message id="profile-edit-success" text={message} /><ActionButton id="profile-save" title="Save changes" onPress={save} busy={busy} disabled={!ready} />
  </AccountLayout>;
}

const styles = StyleSheet.create({
  photoBlock: { alignItems: 'center', marginBottom: 22, gap: 14 },
  photoRing: { width: 108, height: 108, borderRadius: 40, padding: 4, backgroundColor: colors.electricLime },
  photo: { width: 100, height: 100, borderRadius: 36 },
  placeholder: { width: 100, height: 100, borderRadius: 36, backgroundColor: colors.limeSoft, alignItems: 'center', justifyContent: 'center' },
  initials: { fontSize: 34, fontWeight: '800', color: '#050605' },
  photoActions: { flexDirection: 'row', gap: 8 },
  photoBtn: { minHeight: 44, minWidth: 44, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  photoBtnText: { fontSize: 12, fontWeight: '700', color: colors.forest },
  avatars: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.transparent },
  selected: { borderColor: colors.forest, backgroundColor: colors.limeSoft },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: '#050605', borderColor: '#050605' },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.onSurface },
  chipTextOn: { color: colors.electricLime },
});
