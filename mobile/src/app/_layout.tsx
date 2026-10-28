import React, { useEffect } from "react";
import { AppState, Platform, View, ActivityIndicator } from "react-native";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import {
  Manrope_500Medium,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from "@expo-google-fonts/manrope";
import { NotoSansDevanagari_500Medium } from "@expo-google-fonts/noto-sans-devanagari";
import { NotoSansTamil_500Medium } from "@expo-google-fonts/noto-sans-tamil";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useReducedMotion } from "react-native-reanimated";
import { store, useStore } from "../state/store";
import { supabase } from "../lib/supabase";
import { Notifications, reconcileNotifications } from "../lib/notifications";
import { dayKey, plan } from "../domain/medication";
import { color } from "../ui/theme";

void SplashScreen.preventAutoHideAsync();
export default function Layout() {
  const [fonts, fontError] = useFonts({
    Manrope_500Medium,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    NotoSansDevanagari_500Medium,
    NotoSansTamil_500Medium,
  });
  const state = useStore();
  const reduced = useReducedMotion();
  useEffect(() => {
    void store.hydrate();
  }, []);
  useEffect(() => {
    if (state.ready && (fonts || fontError)) void SplashScreen.hideAsync();
  }, [state.ready, fonts, fontError]);
  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    void client.auth.getSession().then(({ data }) => {
      void store
        .account(data.session?.user.id || null)
        .then(() => store.synchronize());
    });
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => {
        void store
          .account(session?.user.id || null)
          .then(() => store.synchronize());
      }, 0);
    });
    const subscription = AppState.addEventListener("change", (value) => {
      if (value === "active") {
        client.auth.startAutoRefresh();
        void store.synchronize();
      } else client.auth.stopAutoRefresh();
    });
    return () => {
      data.subscription.unsubscribe();
      subscription.remove();
    };
  }, []);
  useEffect(() => {
    if (state.ready)
      void reconcileNotifications(state.data, state.preferences.language);
  }, [state.data, state.preferences.language, state.ready]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (value) => {
      if (value === "active") {
        void reconcileNotifications(
          store.get().data,
          store.get().preferences.language,
        );
        void store.synchronize();
      }
    });
    const timer = setInterval(() => {
      void reconcileNotifications(
        store.get().data,
        store.get().preferences.language,
      );
    }, 60000);
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (Platform.OS === "web") return;
    const seen = new Set<string>();
    const handle = (response: Notifications.NotificationResponse) => {
      const key = `${response.notification.request.identifier}:${response.actionIdentifier}`;
      if (seen.has(key)) return;
      seen.add(key);
      void (async () => {
        await store.hydrate();
        const data = response.notification.request.content.data || {};
        const date = String(data.date || dayKey());
        const time = String(data.time || "");
        const reminderId = String(data.reminderId || "");
        const dose = plan(store.get().data, date).find(
          (d) => d.reminder.id === reminderId && d.time === time,
        );
        if (!dose) return;
        if (
          response.actionIdentifier === "taken" ||
          response.actionIdentifier === "skipped"
        )
          await store.log(dose, response.actionIdentifier);
        else
          router.push({
            pathname: "/dose",
            params: {
              id: dose.id,
              date,
              snooze: response.actionIdentifier === "snoozed" ? "1" : "0",
            },
          });
        await Notifications.clearLastNotificationResponseAsync();
      })().catch(() => {});
    };
    const subscription =
      Notifications.addNotificationResponseReceivedListener(handle);
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handle(response);
    });
    return () => subscription.remove();
  }, []);
  if (!state.ready || (!fonts && !fontError))
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: color.canvas,
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={color.blue} />
      </View>
    );
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: color.canvas },
            animation: reduced ? "fade" : "default",
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="welcome" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="history" />
          <Stack.Screen name="prescription/[id]" />
          <Stack.Screen
            name="dose"
            options={{ presentation: "transparentModal", animation: "none" }}
          />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
