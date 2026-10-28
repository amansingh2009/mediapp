import React from "react";
import { Text, View } from "react-native";
import { Check, Clock3 } from "lucide-react-native";
import { useStore } from "../state/store";
import { Card, Empty, Screen, useCopy } from "../ui/components";
import { color, type } from "../ui/theme";

export default function History() {
  const { data } = useStore();
  const { t, language } = useCopy();
  const locale =
    language === "hi" ? "hi-IN" : language === "ta" ? "ta-IN" : "en-IN";
  const rows = data.events
    .filter((event) => !event.deleted && event.status === "taken")
    .sort((first, second) =>
      `${second.date}T${second.time}`.localeCompare(
        `${first.date}T${first.time}`,
      ),
    );
  return (
    <Screen
      back
      title={t("medicineHistory")}
      list={{
        data: rows,
        keyExtractor: (event) => event.id,
        renderItem: ({ item }) => (
          <Card style={{ marginBottom: 12, padding: 16 }}>
            <View style={type.row}>
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: color.greenWash,
                }}
              >
                <Check size={20} color={color.green} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={type.heading}>{item.name}</Text>
                <Text style={type.small}>
                  {item.dosage}
                  {item.strength ? ` · ${item.strength}` : ""}
                </Text>
              </View>
            </View>
            <View style={type.row}>
              <Clock3 size={16} color={color.blue} />
              <Text style={type.body}>
                {new Intl.DateTimeFormat(locale, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                }).format(new Date(`${item.date}T12:00:00`))}{" "}
                · {item.time}
              </Text>
            </View>
            {!!item.profileName && item.profileName !== "Global" && (
              <Text style={type.small}>{item.profileName}</Text>
            )}
          </Card>
        ),
        empty: <Empty title={t("noHistory")} />,
      }}
    >
      <Text style={type.small}>{t("historyHint")}</Text>
    </Screen>
  );
}
