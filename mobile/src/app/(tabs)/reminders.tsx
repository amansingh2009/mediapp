import React, { useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { Medicine } from "../../domain/medication";
import { store, useStore } from "../../state/store";
import { Button, Screen, Empty, Card, Tag, Tap, useCopy } from "../../ui/components";
import { type, color } from "../../ui/theme";
import {
  Fact,
  compactFrequency,
  MedicineDetails,
  ReminderEditor,
} from "../../features/medicines";
export default function Reminders() {
  const { data, preferences } = useStore();
  const { t } = useCopy();
  const [selected, setSelected] = useState<Medicine | null>(null);
  const [selectedInfo, setSelectedInfo] = useState<Medicine | null>(null);
  const rows = data.reminders.filter(
    (r) =>
      !r.deleted &&
      data.medicines.some(
        (m) =>
          m.id === r.medicineId &&
          !m.deleted &&
          (m.global || m.profileId === preferences.selected),
      ),
  );
  return (
    <>
      <Screen
        title={t("reminders")}
        list={{
          data: rows,
          keyExtractor: (r) => r.id,
          renderItem: ({ item }) => {
            const med = data.medicines.find((m) => m.id === item.medicineId)!;
            const profile = data.profiles.find((p) => p.id === med.profileId);
            return (
              <Card style={{ gap: 12, marginBottom: 16 }}>
                <View style={type.between}>
                  <Tap
                    label={`${t("details")}: ${med.name}`}
                    onPress={() => setSelectedInfo(med)}
                    style={{ flex: 1, alignItems: "flex-start" }}
                  >
                    <Text style={type.heading}>{med.name}</Text>
                    {!!med.strength && <Text style={type.small}>{med.strength}</Text>}
                  </Tap>
                  <Tag tone={item.active ? "green" : "muted"}>
                    {item.active ? t("active") : t("paused")}
                  </Tag>
                </View>
                <Text style={type.small}>
                  {med.global
                    ? t("global")
                    : profile?.name || t("prescription")}
                </Text>
                <Text style={[type.title, { color: color.blue }]}>
                  {item.times.join(" · ")}
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                  <Fact label={t("dosage")} value={item.dosage || t("missing")} />
                  <Fact label={t("frequency")} value={med.frequency ? compactFrequency(med.frequency) : (item.times.length ? `${item.times.length} ${t("timesPerDayShort")}` : t("noFixedSchedule"))} />
                  <Fact label={t("duration")} value={med.durationDays ? `${med.durationDays} ${t("days").toLowerCase()}` : t("missing")} />
                </View>
                {!!med.instruction && <Text style={type.small}>{med.instruction}</Text>}
                {!!item.food && <Text style={type.small}>{t(item.food)}</Text>}
                <Text style={type.small}>
                  {item.start} — {item.end || t("noEnd")}
                </Text>
                <View style={type.row}>
                  <View style={{ flex: 1 }}>
                    <Button
                      title={t("editReminder")}
                      variant="soft"
                      onPress={() => setSelected(med)}
                    />
                  </View>
                  <Button
                    title={item.active ? t("pause") : t("resume")}
                    variant="ghost"
                    onPress={() => {
                      void store.reminder(item.id, { active: !item.active });
                    }}
                  />
                </View>
              </Card>
            );
          },
          empty: (
            <Empty
              title={t("noReminders")}
              action={t("medicines")}
              onPress={() => router.navigate("/(tabs)/medicines")}
            />
          ),
        }}
      />
      {selected && (
        <ReminderEditor medicine={selected} onClose={() => setSelected(null)} />
      )}
      {selectedInfo && (
        <MedicineDetails
          medicine={selectedInfo}
          onClose={() => setSelectedInfo(null)}
          onSetReminder={() => {
            const med = selectedInfo;
            setSelectedInfo(null);
            setSelected(med);
          }}
        />
      )}
    </>
  );
}
