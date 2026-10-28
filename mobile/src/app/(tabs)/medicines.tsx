import React, { useState } from "react";
import { router } from "expo-router";
import { Plus } from "lucide-react-native";
import { visibleMedicines } from "../../domain/medication";
import { useStore } from "../../state/store";
import { Button, Empty, Field, Screen, useCopy } from "../../ui/components";
import { color } from "../../ui/theme";
import { MedicineCard, MedicineEditor } from "../../features/medicines";
import { ProfileSummary } from "../../features/prescription";
export default function Medicines() {
  const { data, preferences } = useStore();
  const { t } = useCopy();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const profile = data.profiles.find((p) => p.id === preferences.selected);
  const medicines = visibleMedicines(data, preferences.selected).filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <Screen
        title={t("medicines")}
        list={{
          data: medicines,
          keyExtractor: (m) => m.id,
          renderItem: ({ item }) => <MedicineCard medicine={item} />,
          empty: (
            <Empty
              title={t("noMedicines")}
              action={t("scan")}
              onPress={() => router.navigate("/(tabs)/scan")}
            />
          ),
        }}
      >
        {profile && <ProfileSummary profile={profile} />}
        <Field label={t("search")} value={search} onChangeText={setSearch} />
        <Button
          title={t("addMedicine")}
          variant="outline"
          icon={<Plus size={20} color={color.blue} />}
          onPress={() => setAdding(true)}
        />
      </Screen>
      {adding && <MedicineEditor onClose={() => setAdding(false)} />}
    </>
  );
}
