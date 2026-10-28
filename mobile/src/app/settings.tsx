import React, { useState } from "react";
import { Account } from "../features/account";
import { Platform, Text, View } from "react-native";
import { router } from "expo-router";
import { Check, ChevronRight, History } from "lucide-react-native";
import { Language } from "../domain/medication";
import { store, useStore } from "../state/store";
import {
  Button,
  Card,
  Chip,
  Notice,
  Screen,
  Sheet,
  Tap,
  useCopy,
} from "../ui/components";
import { color, type } from "../ui/theme";
import {
  allowNotifications,
  reconcileNotifications,
  useAlerts,
} from "../lib/notifications";

export default function Settings() {
  const { data, preferences } = useStore();
  const { t, language } = useCopy();
  const alerts = useAlerts();
  const [error, setError] = useState("");
  const [reset, setReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  return (
    <Screen back title={t("settings")}>
      <Text style={type.heading}>{t("switchProfile")}</Text>
      {data.profiles
        .filter((p) => !p.deleted)
        .map((profile) => (
          <Card key={profile.id}>
            <Tap
              label={`${t("switchProfile")}: ${profile.name}`}
              selected={preferences.selected === profile.id}
              onPress={() => {
                void store.preferences({ selected: profile.id });
              }}
              style={type.between}
            >
              <View style={{ flex: 1 }}>
                <Text style={type.heading}>
                  {profile.name || t("prescription")}
                </Text>
                <Text style={type.small}>{profile.doctor}</Text>
              </View>
              {preferences.selected === profile.id ? (
                <Check size={22} color={color.blue} />
              ) : (
                <ChevronRight size={20} color={color.muted} />
              )}
            </Tap>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <Button
                title={t("viewPrescription")}
                variant="soft"
                onPress={() => {
                  void store.preferences({ selected: profile.id }).then(() =>
                    router.push({
                      pathname: "/prescription/[id]",
                      params: { id: profile.id },
                    }),
                  );
                }}
              />
              <Button
                title={profile.active ? t("pause") : t("resume")}
                variant="ghost"
                onPress={() => {
                  void store.profile(profile.id, { active: !profile.active });
                }}
              />
            </View>
          </Card>
        ))}
      <Chip
        title={t("globalOnly")}
        selected={!preferences.selected}
        onPress={() => {
          void store.preferences({ selected: null });
        }}
      />
      <Button
        title={t("addPrescription")}
        variant="outline"
        onPress={() =>
          router.navigate({
            pathname: "/(tabs)/scan",
            params: { fresh: String(Date.now()) },
          })
        }
      />
      <Button
        title={t("medicineHistory")}
        variant="outline"
        icon={<History size={20} color={color.blue} />}
        onPress={() => router.push("/history")}
      />
      <Text style={type.heading}>{t("language")}</Text>
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
      <Text style={type.heading}>{t("notifications")}</Text>
      {Platform.OS === "web" ? (
        <Notice>{t("browserAlerts")}</Notice>
      ) : (
        <>
          <Button
            title={t("enableAlerts")}
            onPress={async () => {
              try {
                const allowed = await allowNotifications(language);
                if (!allowed) setError(t("alertsBlocked"));
                else {
                  setError("");
                  await reconcileNotifications(data, language);
                }
              } catch {
                setError(t("alertsBlocked"));
              }
            }}
          />
          {alerts.limited && <Notice>{t("alertsLimited")}</Notice>}
        </>
      )}
      {!!error && <Notice warning>{error}</Notice>}
      <Account />
      {__DEV__ && (
        <>
          <Text style={type.heading}>{t("development")}</Text>
          <Button
            title={t("resetApp")}
            variant="outline"
            onPress={() => setReset(true)}
          />
          {reset && (
            <Sheet
              title={t("resetApp")}
              onClose={() => {
                if (!resetting) setReset(false);
              }}
            >
              <Notice warning>{t("resetHint")}</Notice>
              <Button
                title={t("confirmReset")}
                busy={resetting}
                onPress={async () => {
                  setResetting(true);
                  try {
                    await store.resetDevelopment();
                    setReset(false);
                    router.replace("/welcome");
                  } catch {
                    setError(t("networkError"));
                  } finally {
                    setResetting(false);
                  }
                }}
              />
              <Button
                title={t("cancel")}
                variant="ghost"
                disabled={resetting}
                onPress={() => setReset(false)}
              />
              {!!error && <Notice warning>{error}</Notice>}
            </Sheet>
          )}
        </>
      )}
    </Screen>
  );
}
