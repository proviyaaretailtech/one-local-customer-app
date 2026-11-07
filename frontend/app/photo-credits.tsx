// Who took the sample catalogue's product photos. They come from Wikimedia Commons under CC licences that allow commercial
// use only with credit, so the app names each author and licence; a tap opens the photo's own page.
import { Linking } from 'react-native';
import Icon from '@react-native-vector-icons/ionicons';
import { AccountLayout } from '@/src/components/account-layout';
import { ListGroup, ListRow } from '@/src/ui/list-row';
import { colors } from '@/src/theme';
import { useTranslation } from '@/src/i18n';
import credits from '@/src/photo-credits.json';

export default function PhotoCredits() {
  const { t } = useTranslation();
  return <AccountLayout id="photo-credits" title={t('photoCredits.title')} subtitle={t('photoCredits.intro')} fallback="/about">
    <ListGroup testID="photo-credits-list">
      {credits.map((c, i) => <ListRow key={c.page} testID={`photo-credit-${i}`} icon="image-outline" title={c.products} subtitle={t('photoCredits.by', { author: c.author, licence: c.licence })} trailing={<Icon name="open-outline" size={18} color={colors.muted} />} onPress={() => { void Linking.openURL(c.page); }} />)}
    </ListGroup>
  </AccountLayout>;
}
