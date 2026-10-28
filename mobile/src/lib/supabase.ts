import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const secureStorage = {
  async getItem(key: string) {
    if (Platform.OS === "web") return AsyncStorage.getItem(key);
    const count = Number((await SecureStore.getItemAsync(`${key}_count`)) || 0);
    if (!count) return null;
    const parts = await Promise.all(
      Array.from({ length: count }, (_, i) =>
        SecureStore.getItemAsync(`${key}_${i}`),
      ),
    );
    return parts.every((part) => part !== null) ? parts.join("") : null;
  },
  async setItem(key: string, value: string) {
    if (Platform.OS === "web") return AsyncStorage.setItem(key, value);
    const old = Number((await SecureStore.getItemAsync(`${key}_count`)) || 0);
    const parts = value.match(/[\s\S]{1,1200}/g) || [];
    await Promise.all(
      parts.map((part, i) => SecureStore.setItemAsync(`${key}_${i}`, part)),
    );
    await SecureStore.setItemAsync(`${key}_count`, String(parts.length));
    await Promise.all(
      Array.from({ length: Math.max(0, old - parts.length) }, (_, i) =>
        SecureStore.deleteItemAsync(`${key}_${i + parts.length}`),
      ),
    );
  },
  async removeItem(key: string) {
    if (Platform.OS === "web") return AsyncStorage.removeItem(key);
    const count = Number((await SecureStore.getItemAsync(`${key}_count`)) || 0);
    await Promise.all(
      Array.from({ length: count }, (_, i) =>
        SecureStore.deleteItemAsync(`${key}_${i}`),
      ),
    );
    await SecureStore.deleteItemAsync(`${key}_count`);
  },
};
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const supabase =
  url && key
    ? createClient(url, key, {
        auth: {
          storage: secureStorage,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      })
    : null;
