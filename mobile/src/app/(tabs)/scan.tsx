import React, { useState } from "react";
import { Platform, Text, View } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import {
  ArrowRight,
  Camera,
  Check,
  FileText,
  Images,
  ScanLine,
} from "lucide-react-native";
import {
  Button,
  Card,
  Notice,
  Screen,
  Tap,
  useCopy,
} from "../../ui/components";
import { color, type } from "../../ui/theme";
import { api } from "../../lib/api";
import { demoResult } from "../../lib/demo";
import { errorKey } from "../../lib/i18n";
import { store } from "../../state/store";
import { DemoPaper } from "../../features/prescription";

function ScanSteps({ step }: { step: number }) {
  const { t } = useCopy();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      {(["stepPhoto", "readStep", "stepMedicines"] as const).map((key, i) => (
        <View key={key} style={{ flex: 1, gap: 8 }}>
          <View
            style={{
              height: 4,
              borderRadius: 4,
              backgroundColor: i <= step ? color.blue : color.border,
            }}
          />
          <View style={[type.row, { gap: 5 }]}>
            {i < step ? (
              <Check size={13} color={color.blue} />
            ) : (
              <Text style={type.small}>{i + 1}</Text>
            )}
            <Text
              style={[
                type.small,
                { color: i === step ? color.blue : color.muted },
              ]}
            >
              {t(key)}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export default function Scan() {
  const { fresh } = useLocalSearchParams<{ fresh?: string }>();
  return <ScanFlow key={fresh || "initial"} />;
}
function ScanFlow() {
  const { t } = useCopy();
  const [uri, setUri] = useState("");
  const [demoPhoto, setDemoPhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const preview = !!uri || demoPhoto;
  async function choose(camera: boolean) {
    setError("");
    try {
      if (
        camera &&
        Platform.OS !== "web" &&
        !(await ImagePicker.requestCameraPermissionsAsync()).granted
      ) {
        setError(t("cameraPermission"));
        return;
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["images"],
        quality: 0.8,
        allowsEditing: false,
      };
      const result = camera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        if ((asset.fileSize || 0) > 10 * 1024 * 1024)
          return setError(t("photoTooLarge"));
        setUri(asset.uri);
        setDemoPhoto(false);
      }
    } catch (e) {
      setError(t(errorKey(e)));
    }
  }
  async function decode(demo: boolean, manual = false) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = manual
        ? {
            medicines: [],
            hospital: "",
            doctor: "",
            engine: "manual",
            review_required: true,
          }
        : demo
          ? demoResult
          : await api.decode(uri);
      const id = await store.addPrescription(result, uri, demo);
      router.push({ pathname: "/prescription/[id]", params: { id } });
    } catch (e) {
      console.error("[SCAN DECODE ERROR]:", e);
      setError(
        e instanceof Error && e.message && e.message !== "networkError" && e.message !== "storageError"
          ? e.message
          : t(
              e instanceof Error && e.message === "storageError"
                ? "storageError"
                : "decodeUnavailable",
            ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen
      title={preview ? t("preview") : t("scanTitle")}
      subtitle={preview ? t("previewHint") : t("scanHelp")}
    >
      <ScanSteps step={preview ? 1 : 0} />
      {preview ? (
        <>
          <View
            style={{
              padding: 14,
              borderRadius: 24,
              backgroundColor: color.faint,
            }}
          >
            {uri ? (
              <Image
                source={{ uri }}
                accessibilityLabel={t("photo")}
                contentFit="contain"
                style={{ height: 310, width: "100%", borderRadius: 12 }}
              />
            ) : (
              <DemoPaper />
            )}
          </View>
          <Button
            title={t("changePhoto")}
            variant="ghost"
            disabled={busy}
            onPress={() => {
              setUri("");
              setDemoPhoto(false);
              setError("");
            }}
          />
          <Button
            title={
              busy ? t("decoding") : demoPhoto ? t("demoDecode") : t("decode")
            }
            busy={busy}
            icon={<ScanLine size={21} color={color.white} />}
            onPress={() => decode(demoPhoto)}
          />
          {!demoPhoto && (
            <Button
              title={t("demoDecode")}
              variant="soft"
              disabled={busy}
              onPress={() => decode(true)}
            />
          )}
          {!!error && <Notice warning>{error}</Notice>}
          {!!error && (
            <Button
              title={t("addManually")}
              variant="outline"
              onPress={() => decode(false, true)}
            />
          )}
          <Text style={type.small}>
            {demoPhoto ? t("demoInfo") : t("decodeReview")}
          </Text>
        </>
      ) : (
        <>
          <View style={{ alignItems: "center", paddingVertical: 16 }}>
            <View
              style={{
                width: 204,
                height: 190,
                backgroundColor: color.blueWash,
                borderRadius: 38,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View
                style={{
                  backgroundColor: color.paper,
                  borderRadius: 14,
                  padding: 24,
                  transform: [{ rotate: "-7deg" }],
                  borderWidth: 1,
                  borderColor: color.border,
                }}
              >
                <FileText size={58} strokeWidth={1.4} color={color.blue} />
              </View>
              <View
                style={{
                  position: "absolute",
                  bottom: 18,
                  right: 16,
                  borderRadius: 17,
                  padding: 12,
                  backgroundColor: color.blue,
                }}
              >
                <ScanLine size={24} color={color.white} />
              </View>
            </View>
          </View>
          <Card>
            <Button
              title={t("camera")}
              icon={<Camera size={23} color={color.white} />}
              onPress={() => choose(true)}
            />
            <Button
              title={t("gallery")}
              variant="outline"
              icon={<Images size={23} color={color.blue} />}
              onPress={() => choose(false)}
            />
          </Card>
          {!!error && <Notice warning>{error}</Notice>}
          <Tap
            label={t("tryDemo")}
            onPress={() => {
              setDemoPhoto(true);
              setError("");
            }}
            style={[
              type.between,
              {
                backgroundColor: color.yellowWash,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: color.border,
                padding: 18,
              },
            ]}
          >
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[type.label, { fontSize: 16 }]}>{t("tryDemo")}</Text>
              <Text style={type.small}>{t("sampleLabel")}</Text>
            </View>
            <ArrowRight size={20} color={color.blue} />
          </Tap>
        </>
      )}
    </Screen>
  );
}
