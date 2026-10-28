import React, { useState } from "react";
import { Platform, Text, View } from "react-native";
import { Check, ChevronRight, Clock3, SkipForward } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { Dose, isSample } from "../domain/medication";
import { store, useStore } from "../state/store";
import { Button, Notice, Sheet, Tag, Tap, useCopy } from "../ui/components";
import { color, type } from "../ui/theme";
import { errorKey } from "../lib/i18n";

export function TimelineRow({
  dose,
  onPress,
}: {
  dose: Dose;
  onPress: () => void;
}) {
  const { t } = useCopy();
  const complete = dose.status === "taken";
  const skipped = dose.status === "skipped";
  const postponed = dose.status === "snoozed";
  const tint = complete
    ? color.green
    : skipped || postponed
      ? color.orange
      : color.blue;
  const wash = complete
    ? color.greenWash
    : skipped || postponed
      ? color.orangeWash
      : color.blueWash;
  return (
    <Tap
      label={`${dose.time} ${dose.medicine.name} ${t(dose.status)}`}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "stretch",
        gap: 12,
        minHeight: 82,
        paddingVertical: 0,
      }}
    >
      <View style={{ width: 48, justifyContent: "center" }}>
        <Text style={type.label}>{dose.time}</Text>
      </View>
      <View
        style={{ width: 20, alignItems: "center", justifyContent: "center" }}
      >
        <View
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            width: 2,
            backgroundColor: color.border,
          }}
        />
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            borderWidth: 2,
            borderColor: tint,
            backgroundColor: complete ? tint : color.canvas,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {complete ? (
            <Check size={12} color={color.white} />
          ) : skipped ? (
            <SkipForward size={11} color={tint} />
          ) : (
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: tint,
              }}
            />
          )}
        </View>
      </View>
      <View style={{ flex: 1, justifyContent: "center", paddingVertical: 10 }}>
        <View
          style={[
            type.between,
            {
              backgroundColor: wash,
              paddingHorizontal: 14,
              paddingVertical: 14,
              borderRadius: 14,
            },
          ]}
        >
          <Text
            style={[
              type.label,
              {
                fontSize: 17,
                color: tint,
                flex: 1,
                textDecorationLine: skipped ? "line-through" : "none",
              },
            ]}
          >
            {dose.medicine.name}
          </Text>
          <ChevronRight size={16} color={tint} />
        </View>
      </View>
    </Tap>
  );
}

export function DoseSheet({
  dose,
  onClose,
}: {
  dose: Dose;
  onClose: () => void;
}) {
  const { t } = useCopy();
  const { data } = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sample = isSample(data, dose.medicine);
  async function commit(
    status: "taken" | "skipped" | "snoozed" | "undo",
    minutes?: number,
  ) {
    setBusy(true);
    try {
      if (status === "undo") await store.undo(dose.id);
      else await store.log(dose, status, minutes);
      if (Platform.OS !== "web")
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => {});
      onClose();
    } catch (e) {
      setError(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet title={dose.medicine.name} onClose={onClose}>
      <Text style={type.title}>{dose.time}</Text>
      <Text style={type.body}>
        {dose.reminder.dosage} · {dose.medicine.strength}
      </Text>
      {!!dose.reminder.food && (
        <Text style={type.body}>{t(dose.reminder.food)}</Text>
      )}
      <Tag>
        {dose.medicine.global
          ? t("global")
          : dose.profile?.name || t("prescription")}
      </Tag>
      {sample && <Notice warning>{t("sampleWarning")}</Notice>}
      {!!error && <Notice warning>{error}</Notice>}
      {dose.event?.status === "snoozed" ? (
        <>
          <Tag tone="orange">{t("snoozed")}</Tag>
          <Button
            title={t("markTaken")}
            busy={busy}
            icon={<Check size={20} color={color.white} />}
            onPress={() => commit("taken")}
          />
          <Button
            title={t("skip")}
            disabled={busy}
            variant="outline"
            icon={<SkipForward size={20} color={color.blue} />}
            onPress={() => commit("skipped")}
          />
          <Button
            title={t("cancelSnooze")}
            disabled={busy}
            variant="ghost"
            onPress={() => commit("undo")}
          />
        </>
      ) : dose.event ? (
        <>
          <Tag tone="green">{t(dose.status)}</Tag>
          <Button
            title={t("undo")}
            busy={busy}
            onPress={() => commit("undo")}
          />
        </>
      ) : (
        <>
          <Button
            title={t("markTaken")}
            busy={busy}
            icon={<Check size={20} color={color.white} />}
            onPress={() => commit("taken")}
          />
          <Button
            title={t("skip")}
            disabled={busy}
            variant="outline"
            icon={<SkipForward size={20} color={color.blue} />}
            onPress={() => commit("skipped")}
          />
          <View style={type.row}>
            <Clock3 size={18} color={color.blue} />
            <Text style={type.label}>{t("snooze")}</Text>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {[10, 15, 30].map((minutes) => (
              <Button
                key={minutes}
                title={`${minutes} ${t("minutes")}`}
                variant="soft"
                disabled={busy}
                onPress={() => commit("snoozed", minutes)}
              />
            ))}
          </View>
        </>
      )}
    </Sheet>
  );
}
