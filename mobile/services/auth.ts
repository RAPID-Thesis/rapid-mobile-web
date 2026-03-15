import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { buildApiUrl, parseApiError } from './api';

const TOKEN_STORAGE_KEY = 'userToken';

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: {
    username: string;
    full_name: string;
    role: string;
    lgu_code: string;
  };
}

function isWebStorageAvailable(): boolean {
  return Platform.OS === 'web' && typeof window !== 'undefined' && !!window.localStorage;
}

export async function saveUserToken(token: string): Promise<void> {
  if (isWebStorageAvailable()) {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    return;
  }

  await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, token);
}

export async function getUserToken(): Promise<string | null> {
  if (isWebStorageAvailable()) {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  }

  return SecureStore.getItemAsync(TOKEN_STORAGE_KEY);
}

export async function deleteUserToken(): Promise<void> {
  if (isWebStorageAvailable()) {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    return;
  }

  await SecureStore.deleteItemAsync(TOKEN_STORAGE_KEY);
}

export async function loginUser(username: string, password: string): Promise<LoginResponse> {
  const response = await fetch(buildApiUrl('/api/auth/login'), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response, 'Unable to sign in right now.'));
  }

  return (await response.json()) as LoginResponse;
}
