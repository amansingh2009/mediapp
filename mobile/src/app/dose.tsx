import { router, useLocalSearchParams } from "expo-router";
import { DoseSheet } from "../features/timeline";
import { dayKey, plan } from "../domain/medication";
import { useStore } from "../state/store";
import { Button, Screen, useCopy } from "../ui/components";
export default function Dose() {
  const { id, date } = useLocalSearchParams<{ id: string; date: string }>();
  const { data } = useStore();
  const { t } = useCopy();
  const dose = plan(data, date || dayKey()).find((d) => d.id === id);
  const close = () =>
    router.canGoBack() ? router.back() : router.replace("/(tabs)");
  return dose ? (
    <DoseSheet dose={dose} onClose={close} />
  ) : (
    <Screen title={t("noDoses")}>
      <Button title={t("back")} onPress={close} />
    </Screen>
  );
}
