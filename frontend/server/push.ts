// Push alerts through Expo's push service (Expo → Firebase on Android / Apple on iOS).
// Needs no server secret. Tokens Expo reports as unregistered are removed.
import { db } from './db';

type Message = { title: string; body: string; data: Record<string, unknown> };

export async function pushToRestaurant(organizationId: string, message: Message) {
  try {
    const { data } = await db().from('ol_partner_devices').select('expo_push_token').eq('organization_id', organizationId);
    const tokens = (data ?? []).map(d => d.expo_push_token as string).filter(t => /^Expo(nent)?PushToken\[/.test(t));
    if (!tokens.length) return { sent: 0 };
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(tokens.map(to => ({
        to, title: message.title, body: message.body, data: message.data,
        sound: 'new_order.wav', channelId: 'new-orders', priority: 'high', interruptionLevel: 'time-sensitive', ttl: 60,
      }))),
      signal: AbortSignal.timeout(8000),
    });
    const result = await response.json().catch(() => ({}));
    const tickets: { status: string; details?: { error?: string } }[] = result.data ?? [];
    const dead = tokens.filter((_, i) => tickets[i]?.details?.error === 'DeviceNotRegistered');
    if (dead.length) await db().from('ol_partner_devices').delete().in('expo_push_token', dead);
    return { sent: tickets.filter(t => t.status === 'ok').length };
  } catch (error) {
    // An alert that fails to send must never break the order itself; phones also poll.
    console.warn('[push]', error);
    return { sent: 0 };
  }
}

// A job offer (or a cancellation) on a rider's phone. Same service as the restaurant alerts, but a
// short life: an offer is worth ringing for about 30 seconds, so Expo drops the push after that.
export async function pushToRider(riderId: string, message: Message & { sound?: boolean }) {
  try {
    const { data } = await db().from('push_tokens').select('expo_push_token').eq('rider_id', riderId);
    const tokens = (data ?? []).map(d => d.expo_push_token as string).filter(t => /^Expo(nent)?PushToken\[/.test(t));
    if (!tokens.length) return { sent: 0 };
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(tokens.map(to => ({
        to, title: message.title, body: message.body, data: message.data,
        ...(message.sound === false ? {} : { sound: 'job_offer.wav' }), channelId: 'job-offers', priority: 'high', interruptionLevel: 'time-sensitive', ttl: 30,
      }))),
      signal: AbortSignal.timeout(5000),
    });
    const result = await response.json().catch(() => ({}));
    const tickets: { status: string; details?: { error?: string } }[] = result.data ?? [];
    const dead = tokens.filter((_, i) => tickets[i]?.details?.error === 'DeviceNotRegistered');
    if (dead.length) await db().from('push_tokens').delete().in('expo_push_token', dead);
    return { sent: tickets.filter(t => t.status === 'ok').length };
  } catch (error) {
    // The rider app also polls for its offer, so a push that fails to send never breaks dispatch.
    console.warn('[push:rider]', error);
    return { sent: 0 };
  }
}
