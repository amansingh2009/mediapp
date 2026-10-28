import React, { useState } from "react";
import { Text, View } from "react-native";
import { Image } from "expo-image";
import { FileText, Maximize2 } from "lucide-react-native";
import { Profile } from "../domain/medication";
import {
  Button,
  Card,
  Field,
  Notice,
  Sheet,
  Tag,
  Tap,
  useCopy,
} from "../ui/components";
import { color, type } from "../ui/theme";
import { store } from "../state/store";
import { errorKey } from "../lib/i18n";

export function PrescriptionPreview({
  profile,
  onClose,
}: {
  profile: Profile;
  onClose: () => void;
}) {
  const { t } = useCopy();
  return (
    <Sheet title={t("photo")} onClose={onClose} tall>
      {profile.sample && <Notice warning>{t("demoInfo")}</Notice>}
      {profile.imageUri ? (
        <Image
          source={{ uri: profile.imageUri }}
          contentFit="contain"
          accessibilityLabel={t("photo")}
          style={{ width: "100%", height: 490 }}
        />
      ) : (
        <DemoPaper />
      )}
    </Sheet>
  );
}
export function DemoPaper() {
  const { t } = useCopy();
  return (
    <View
      style={{
        padding: 24,
        gap: 16,
        backgroundColor: color.paper,
        borderWidth: 1,
        borderColor: color.border,
        borderRadius: 8,
      }}
    >
      <View style={type.between}>
        <FileText color={color.blue} size={28} />
        <Tag tone="orange">{t("demoMode")}</Tag>
      </View>
      <Text style={type.heading}>Demo Care Clinic</Text>
      <Text style={type.small}>Dr. Sample</Text>
      <View style={{ height: 1, backgroundColor: color.border }} />
      <Text style={[type.title, { color: color.blue }]}>Rx</Text>
      {["Paracetamol · 500 mg", "Cetirizine · 10 mg", "Vitamin C · 500 mg"].map(
        (name) => (
          <View key={name} style={{ gap: 7 }}>
            <Text style={type.label}>{name}</Text>
            <View
              style={{
                height: 5,
                width: "72%",
                backgroundColor: color.faint,
                borderRadius: 5,
              }}
            />
          </View>
        ),
      )}
      <Text style={[type.small, { color: color.orange }]}>{t("demoInfo")}</Text>
    </View>
  );
}
export function ProfileSummary({
  profile,
  edit = false,
}: {
  profile: Profile;
  edit?: boolean;
}) {
  const { t } = useCopy();
  const [preview, setPreview] = useState(false);
  const [editing, setEditing] = useState(false);
  return (
    <>
      <Card style={{ padding: 16 }}>
        <View style={[type.row, { alignItems: "center" }]}>
          <Tap
            label={t("photo")}
            onPress={() => setPreview(true)}
            style={{
              width: 66,
              height: 78,
              borderRadius: 12,
              overflow: "hidden",
              backgroundColor: color.blueWash,
              alignItems: "center",
            }}
          >
            {profile.imageUri ? (
              <Image
                source={profile.imageUri}
                contentFit="cover"
                style={{ width: 66, height: 78 }}
              />
            ) : (
              <FileText size={27} color={color.blue} />
            )}
            <View
              style={{
                position: "absolute",
                right: 3,
                bottom: 3,
                backgroundColor: color.paper,
                padding: 3,
                borderRadius: 5,
              }}
            >
              <Maximize2 size={12} color={color.blue} />
            </View>
          </Tap>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={[type.small, { color: color.blue }]}>
              {profile.sample ? t("demoMode") : t("prescription")}
            </Text>
            <Text style={[type.heading, { fontSize: 17, lineHeight: 24 }]}>
              {profile.name || profile.hospital || t("prescription")}
            </Text>
            {!!profile.doctor && (
              <Text style={type.small}>{profile.doctor}</Text>
            )}
            {!!profile.hospital && profile.name !== profile.hospital && (
              <Text style={type.small}>{profile.hospital}</Text>
            )}
          </View>
        </View>
        {edit && (
          <Button
            variant="ghost"
            title={t("edit")}
            onPress={() => setEditing(true)}
          />
        )}
      </Card>
      {preview && (
        <PrescriptionPreview
          profile={profile}
          onClose={() => setPreview(false)}
        />
      )}
      {editing && (
        <EditProfile profile={profile} onClose={() => setEditing(false)} />
      )}
    </>
  );
}
function EditProfile({
  profile,
  onClose,
}: {
  profile: Profile;
  onClose: () => void;
}) {
  const { t } = useCopy();
  const [name, setName] = useState(profile.name);
  const [hospital, setHospital] = useState(profile.hospital);
  const [doctor, setDoctor] = useState(profile.doctor);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Sheet title={t("edit")} onClose={onClose}>
      <Field label={t("profileName")} value={name} onChangeText={setName} />
      <Field
        label={t("hospital")}
        value={hospital}
        onChangeText={setHospital}
      />
      <Field label={t("doctor")} value={doctor} onChangeText={setDoctor} />
      {!!error && <Notice warning>{error}</Notice>}
      <Button
        title={t("save")}
        busy={busy}
        onPress={async () => {
          setBusy(true);
          try {
            await store.profile(profile.id, {
              name: name.trim(),
              hospital: hospital.trim(),
              doctor: doctor.trim(),
            });
            onClose();
          } catch (e) {
            setError(t(errorKey(e)));
          } finally {
            setBusy(false);
          }
        }}
      />
    </Sheet>
  );
}
