import React from "react";
import { View, Text } from "react-native";
import { Tabs, Redirect, router } from "expo-router";
import { House, Pill, ScanLine, Bell, MapPin } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "../../state/store";
import { color, type } from "../../ui/theme";
import { Tap, useCopy } from "../../ui/components";
const items = {
  index: { icon: House, key: "today" },
  medicines: { icon: Pill, key: "medicines" },
  scan: { icon: ScanLine, key: "scan" },
  reminders: { icon: Bell, key: "reminders" },
  hospitals: { icon: MapPin, key: "nearby" },
} as const;
type BarProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  navigateToTab: (key: string) => void;
};
function TabBar({ state, navigateToTab }: BarProps) {
  const insets = useSafeAreaInsets();
  const { t } = useCopy();
  return (
    <View
      style={{
        backgroundColor: color.paper,
        borderTopWidth: 1,
        borderColor: color.border,
        paddingTop: 8,
        paddingBottom: Math.max(insets.bottom, 10),
        paddingHorizontal: 4,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          width: "100%",
          maxWidth: 620,
          alignSelf: "center",
        }}
      >
        {state.routes.map((route, index) => {
          const item = items[route.name as keyof typeof items];
          if (!item) return null;
          const active = state.index === index;
          const Icon = item.icon;
          const center = route.name === "scan";
          return (
            <View key={route.key} style={{ flex: 1 }}>
              <Tap
                label={t(item.key)}
                selected={active}
                onPress={() => {
                  if (center)
                    router.navigate({
                      pathname: "/(tabs)/scan",
                      params: { fresh: String(Date.now()) },
                    });
                  else navigateToTab(route.key);
                }}
                style={{ alignItems: "center", gap: 4, minHeight: 64 }}
              >
                <View
                  style={{
                    borderRadius: 15,
                    paddingHorizontal: 13,
                    paddingVertical: center ? 10 : 6,
                    backgroundColor: center
                      ? color.blue
                      : active
                        ? color.blueWash
                        : "transparent",
                  }}
                >
                  <Icon
                    size={22}
                    color={
                      center ? color.white : active ? color.blue : color.muted
                    }
                    strokeWidth={active ? 2.2 : 1.8}
                  />
                </View>
                <Text
                  style={[
                    type.small,
                    {
                      fontSize: 11,
                      lineHeight: 16,
                      textAlign: "center",
                      color: active ? color.blue : color.muted,
                      fontFamily: active
                        ? "Manrope_800ExtraBold"
                        : "Manrope_500Medium",
                    },
                  ]}
                >
                  {t(item.key)}
                </Text>
              </Tap>
            </View>
          );
        })}
      </View>
    </View>
  );
}
export default function TabLayout() {
  const { preferences } = useStore();
  if (!preferences.onboarded) return <Redirect href="/welcome" />;
  return (
    <Tabs
      screenOptions={{ headerShown: false, animation: "none" }}
      tabBar={(props) => <TabBar {...props} />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="medicines" />
      <Tabs.Screen name="scan" />
      <Tabs.Screen name="reminders" />
      <Tabs.Screen name="hospitals" />
    </Tabs>
  );
}
