import React from "react";
import { View, Text } from "react-native";
import { router } from "expo-router";
import { ArrowRight, Check, Pill, Sun } from "lucide-react-native";
import Animated, {
  FadeInDown,
  useReducedMotion,
} from "react-native-reanimated";
import { Screen, Button, Chip, Listen, useCopy } from "../ui/components";
import { color, type } from "../ui/theme";
import { store } from "../state/store";
import { Language } from "../domain/medication";
export default function Welcome() {
  const { t, language } = useCopy();
  const reduced = useReducedMotion();
  return (
    <Screen>
      <Animated.View
        entering={reduced ? undefined : FadeInDown.duration(250)}
        style={{ gap: 28, paddingTop: 24 }}
      >
        <View
          style={{
            height: 245,
            backgroundColor: color.blueWash,
            borderRadius: 38,
            justifyContent: "center",
            alignItems: "center",
            overflow: "hidden",
          }}
        >
          <View
            style={{
              position: "absolute",
              width: 220,
              height: 220,
              borderRadius: 110,
              borderColor: "#D4DEF7",
              borderWidth: 1,
            }}
          />
          <View
            style={{
              position: "absolute",
              width: 170,
              height: 170,
              borderRadius: 85,
              borderColor: "#D4DEF7",
              borderWidth: 1,
            }}
          />
          <View
            style={{
              width: 104,
              height: 142,
              backgroundColor: color.paper,
              borderRadius: 34,
              alignItems: "center",
              justifyContent: "center",
              transform: [{ rotate: "-22deg" }],
              borderWidth: 1,
              borderColor: color.border,
            }}
          >
            <Pill size={64} color={color.blue} strokeWidth={1.5} />
          </View>
          <View
            style={{
              position: "absolute",
              right: 50,
              top: 34,
              backgroundColor: color.yellow,
              borderRadius: 20,
              padding: 15,
              transform: [{ rotate: "12deg" }],
            }}
          >
            <Sun size={26} color={color.ink} />
          </View>
          <View
            style={{
              position: "absolute",
              bottom: 35,
              left: 38,
              backgroundColor: color.green,
              borderRadius: 15,
              padding: 10,
            }}
          >
            <Check size={25} color={color.white} />
          </View>
        </View>
        <View style={{ gap: 12 }}>
          <Text accessibilityRole="header" style={type.hero}>
            {t("welcome")}
          </Text>
          <Text style={[type.body, { color: color.muted }]}>
            {t("welcomeBody")}
          </Text>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {(
            [
              ["en", "English"],
              ["hi", "हिन्दी"],
              ["ta", "தமிழ்"],
            ] as [Language, string][]
          ).map(([code, label]) => (
            <Chip
              key={code}
              title={label}
              selected={language === code}
              onPress={() => {
                void store.preferences({ language: code });
              }}
            />
          ))}
        </View>
        <Button
          title={t("start")}
          onPress={() => {
            void store
              .preferences({ onboarded: true })
              .then(() => router.replace("/(tabs)/scan"));
          }}
          icon={<ArrowRight size={21} color={color.white} />}
        />
        <Listen text={`${t("welcome")} ${t("welcomeBody")}`} />
      </Animated.View>
    </Screen>
  );
}
