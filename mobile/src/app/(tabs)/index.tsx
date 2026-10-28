import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { Plus, Quote } from "lucide-react-native";
import {
  completedToday,
  dayKey,
  Dose,
  plan,
  remainingToday,
} from "../../domain/medication";
import { useStore } from "../../state/store";
import { Button, Card, Empty, Screen, useCopy } from "../../ui/components";
import { color, type } from "../../ui/theme";
import { ProfileSummary } from "../../features/prescription";
import { DoseSheet, TimelineRow } from "../../features/timeline";

export default function Today() {
  const { data, preferences } = useStore();
  const { t } = useCopy();
  const [selected, setSelected] = useState<Dose | null>(null);
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  const date = dayKey(now);
  const todayDoses = plan(data, date, preferences.selected, now);
  const doses = remainingToday(todayDoses, now);
  const finished = completedToday(todayDoses);
  const quoteKeys = [
    "positiveQuoteOne",
    "positiveQuoteTwo",
    "positiveQuoteThree",
  ] as const;
  const quote = t(quoteKeys[now.getDate() % quoteKeys.length]);
  const taken = doses.filter((d) => d.status === "taken").length;
  const profile = data.profiles.find(
    (p) => p.id === preferences.selected && !p.deleted,
  );
  const freshScan = () =>
    router.navigate({
      pathname: "/(tabs)/scan",
      params: { fresh: String(Date.now()) },
    });
  return (
    <>
      <Screen
        list={{
          data: doses,
          keyExtractor: (d) => d.id,
          renderItem: ({ item }) => (
            <TimelineRow dose={item} onPress={() => setSelected(item)} />
          ),
          empty: (
            <View style={{ gap: 12 }}>
              <Empty
                title={t(finished ? "allMedicineTaken" : "noDosesRemaining")}
              />
              <Card style={{ padding: 18, backgroundColor: color.greenWash }}>
                <Quote size={21} color={color.green} />
                <Text style={[type.body, { color: color.green }]}>{quote}</Text>
              </Card>
            </View>
          ),
        }}
      >
        {profile ? (
          <ProfileSummary profile={profile} />
        ) : (
          <Card style={{ backgroundColor: color.blueWash }}>
            <Text style={type.heading}>{t("noPrescription")}</Text>
            <Button
              title={t("scan")}
              onPress={freshScan}
              icon={<Plus size={20} color={color.white} />}
            />
          </Card>
        )}
        <View style={{ gap: 12 }}>
          <View style={type.between}>
            <Text accessibilityRole="header" style={type.heading}>
              {t("yourPlan")}
            </Text>
            <Text style={type.small}>
              {taken}/{doses.length} {t("taken").toLowerCase()}
            </Text>
          </View>
          {doses.length > 0 && (
            <View
              style={{
                height: 5,
                backgroundColor: color.border,
                borderRadius: 5,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  width: `${(taken / doses.length) * 100}%`,
                  height: 5,
                  backgroundColor: color.blue,
                }}
              />
            </View>
          )}
        </View>
      </Screen>
      {selected && (
        <DoseSheet dose={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
