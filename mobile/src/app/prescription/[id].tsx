import React, { useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowRight } from "lucide-react-native";
import { store, useStore } from "../../state/store";
import { visibleMedicines } from "../../domain/medication";
import { Button, Empty, Notice, Screen, useCopy } from "../../ui/components";
import { color, type } from "../../ui/theme";
import { ProfileSummary } from "../../features/prescription";
import { MedicineCard } from "../../features/medicines";
import { api } from "../../lib/api";
export default function Prescription() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data } = useStore();
  const { t } = useCopy();
  const [busy, setBusy] = useState(false);
  const [retryError, setRetryError] = useState("");
  const [recognizedText, setRecognizedText] = useState("");
  const [showText, setShowText] = useState(false);
  const profile = data.profiles.find((p) => p.id === id && !p.deleted);
  const medicines = visibleMedicines(data, id);
  const canRetryReading = !!profile?.imageUri && !profile.sample && medicines.length > 0 &&
    medicines.every((m) => !!m.reading && !m.reviewed &&
      !data.reminders.some((r) => r.medicineId === m.id && !r.deleted));
  async function retry() {
    if (!profile?.imageUri || busy) return;
    setBusy(true);
    setRetryError("");
    try {
      const result = await api.decode(profile.imageUri);
      setRecognizedText(result.raw_text || "");
      await store.addDecodedMedicines(profile.id, result);
    } catch {
      setRetryError(t("decodeUnavailable"));
    } finally {
      setBusy(false);
    }
  }
  if (!profile)
    return (
      <Screen back>
        <Empty
          title={t("noPrescription")}
          action={t("scan")}
          onPress={() => router.replace("/(tabs)/scan")}
        />
      </Screen>
    );
  return (
    <>
      <Screen
        back
        title={t("decoded")}
        footer={
          <Button
            title={t("goToday")}
            icon={<ArrowRight size={20} color={color.white} />}
            onPress={() => router.replace("/(tabs)")}
          />
        }
        list={{
          data: medicines,
          keyExtractor: (m) => m.id,
          renderItem: ({ item }) => <MedicineCard medicine={item} />,
          empty: (
            <View style={{ gap: 12 }}>
              <Notice>{t("noReadings")}</Notice>
              {!!profile.imageUri && !profile.sample && (
                <Button title={t("retry")} busy={busy} onPress={retry} />
              )}
              {!!recognizedText && (
                <>
                  <Button
                    title={t(showText ? "hideRecognizedText" : "showRecognizedText")}
                    variant="soft"
                    onPress={() => setShowText(!showText)}
                  />
                  {showText && <Text selectable style={type.body}>{recognizedText}</Text>}
                </>
              )}
              {!!retryError && <Notice warning>{retryError}</Notice>}
            </View>
          ),
        }}
      >
        <ProfileSummary profile={profile} />
        {profile.sample && <Notice warning>{t("sampleWarning")}</Notice>}
        <Text style={type.heading}>
          {medicines.length} {t("decodedCount")}
        </Text>
        {canRetryReading && (
          <Button title={t("retry")} variant="soft" busy={busy} onPress={retry} />
        )}
        {medicines.length > 0 && !!retryError && <Notice warning>{retryError}</Notice>}
        {!!recognizedText && medicines.length > 0 && (
          <View style={{ gap: 8 }}>
            <Button
              title={t(showText ? "hideRecognizedText" : "showRecognizedText")}
              variant="soft"
              onPress={() => setShowText(!showText)}
            />
            {showText && <Text selectable style={type.body}>{recognizedText}</Text>}
          </View>
        )}
      </Screen>
    </>
  );
}
