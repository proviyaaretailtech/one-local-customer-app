import { Tabs } from 'expo-router';
import { colors } from '@/src/theme';
import { duration, easing } from '@/src/motion-tokens';
import { screenFrame } from '@/src/components/app-shell';
// Tabs cross-fade rather than cut. A hidden tab is not frozen: thawing it re-ran every card's setup at once, so going back
// to a long tab (Home) stalled for half a second. Kept live, a hidden tab is only detached and comes straight back.
export default function TabsLayout() {
  return <Tabs backBehavior="history" tabBar={() => null} screenLayout={screenFrame} screenOptions={{ headerShown: false, title: 'OneLocal', lazy: true, animation: 'fade', transitionSpec: { animation: 'timing', config: { duration: duration.base, easing: easing.standard } }, sceneStyle: { backgroundColor: colors.surface } }}>
    {['index', 'categories', 'discover', 'food', 'book-it'].map(name => <Tabs.Screen key={name} name={name} />)}
    {['reels', 'cart', 'account', 'grocery', 'pharmacy', 'beauty', 'shops', 'care'].map(name => <Tabs.Screen key={name} name={name} options={{ href: null }} />)}
  </Tabs>;
}
