import { useMutation } from '@tanstack/react-query';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { partnerPut } from './api';

async function requestPushPermissions() {
  if (Platform.OS === 'web') return null;
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return existing;
  const { status } = await Notifications.requestPermissionsAsync();
  return status;
}

export async function registerPushToken() {
  const status = await requestPushPermissions();
  if (status !== 'granted') return { ok: false, status };
  const token = await Notifications.getExpoPushTokenAsync();
  await partnerPut('/devices', { token: token.data, platform: Platform.OS });
  return { ok: true, token: token.data };
}

export function useRegisterDevice() {
  return useMutation({ mutationFn: registerPushToken });
}
