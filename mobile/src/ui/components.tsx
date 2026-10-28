import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  FlatList,
  ListRenderItem,
  TextInput,
  TextInputProps,
  ActivityIndicator,
  StyleProp,
  ViewStyle,
  Modal,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  FadeIn,
  FadeInDown,
  useReducedMotion,
} from "react-native-reanimated";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Pill,
  Settings2,
  Volume2,
  X,
} from "lucide-react-native";
import { useIsFocused, useRouter } from "expo-router";
import * as Speech from "expo-speech";
import { color, type } from "./theme";
import { useStore } from "../state/store";
import { Key, localeFor, tr } from "../lib/i18n";

export function useCopy() {
  const { preferences } = useStore();
  const language = preferences.language;
  const t = useCallback((key: Key) => tr(key, language), [language]);
  return {
    language,
    locale: localeFor(language),
    t,
  };
}
export function Tap({
  onPress,
  children,
  label,
  style,
  disabled,
  selected,
  expanded,
}: {
  onPress: () => void;
  children: React.ReactNode;
  label: string;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  selected?: boolean;
  expanded?: boolean;
}) {
  const [pressed, setPressed] = useState(false);
  const reduced = useReducedMotion();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected, expanded }}
      aria-expanded={expanded}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      pressRetentionOffset={18}
    >
      <Animated.View
        style={[
          {
            minHeight: 48,
            justifyContent: "center",
            opacity: disabled ? 0.45 : pressed ? 0.76 : 1,
            transform: [{ scale: pressed && !reduced ? 0.98 : 1 }],
            transitionProperty: ["transform", "opacity"],
            transitionDuration: reduced ? 0 : 120,
          },
          style,
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}
export function Button({
  title,
  onPress,
  icon,
  variant = "primary",
  busy,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  icon?: React.ReactNode;
  variant?: "primary" | "soft" | "outline" | "ghost" | "danger" | "sun";
  busy?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const dark = variant === "primary" || variant === "danger";
  const foreground = dark ? color.white : color.blue;
  return (
    <Tap
      label={title}
      onPress={onPress}
      disabled={disabled || busy}
      style={[
        {
          minHeight: 56,
          justifyContent: "center",
          borderRadius: 18,
          paddingHorizontal: 20,
          paddingVertical: 14,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          borderWidth: 1,
          borderColor: variant === "outline" ? color.border : "transparent",
          backgroundColor:
            variant === "primary"
              ? color.blue
              : variant === "danger"
                ? color.red
                : variant === "soft"
                  ? color.blueWash
                  : variant === "sun"
                    ? color.yellow
                    : variant === "outline"
                      ? color.paper
                      : "transparent",
        },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={foreground} /> : icon}
      <Text
        style={[
          type.label,
          {
            color: foreground,
            fontSize: 16,
            flexShrink: 1,
            textAlign: "center",
          },
        ]}
      >
        {title}
      </Text>
    </Tap>
  );
}
export const Card = ({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) => <View style={[type.card, style]}>{children}</View>;
export function Skeleton({
  width = "100%",
  height = 14,
  radius = 8,
}: {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
}) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width,
        height,
        borderRadius: radius,
        backgroundColor: color.faint,
      }}
    />
  );
}
export function Field({
  label,
  hideLabel = false,
  ...props
}: TextInputProps & { label: string; hideLabel?: boolean }) {
  return (
    <View style={{ gap: 8 }}>
      {!hideLabel && <Text style={type.label}>{label}</Text>}
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholder={props.placeholder ?? (hideLabel ? label : undefined)}
        placeholderTextColor={color.muted}
        style={[
          type.body,
          {
            backgroundColor: color.paper,
            borderWidth: 1,
            borderColor: color.border,
            borderRadius: 15,
            padding: 15,
            minHeight: 54,
          },
          props.multiline && { minHeight: 90, textAlignVertical: "top" },
          props.style,
        ]}
      />
    </View>
  );
}
export function Notice({
  children,
  warning = false,
}: {
  children: string;
  warning?: boolean;
}) {
  return (
    <View
      accessibilityRole="alert"
      style={{
        backgroundColor: warning ? color.orangeWash : color.blueWash,
        borderRadius: 16,
        padding: 16,
      }}
    >
      <Text
        style={[
          type.small,
          { color: warning ? color.orange : color.blue, fontSize: 14 },
        ]}
      >
        {children}
      </Text>
    </View>
  );
}
export function Tag({
  children,
  tone = "blue",
}: {
  children: string;
  tone?: "blue" | "green" | "orange" | "muted";
}) {
  const foreground =
    tone === "green"
      ? color.green
      : tone === "orange"
        ? color.orange
        : tone === "muted"
          ? color.muted
          : color.blue;
  return (
    <View
      style={{
        alignSelf: "flex-start",
        borderRadius: 8,
        backgroundColor:
          tone === "green"
            ? color.greenWash
            : tone === "orange"
              ? color.orangeWash
              : tone === "muted"
                ? color.faint
                : color.blueWash,
        paddingHorizontal: 9,
        paddingVertical: 4,
      }}
    >
      <Text
        style={[
          type.small,
          { fontSize: 11, fontFamily: "Manrope_700Bold", color: foreground },
        ]}
      >
        {children}
      </Text>
    </View>
  );
}
export function Chip({
  title,
  selected,
  onPress,
}: {
  title: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Tap
      label={title}
      selected={selected}
      onPress={onPress}
      style={{
        borderRadius: 14,
        backgroundColor: selected ? color.blue : color.paper,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: selected ? color.blue : color.border,
      }}
    >
      <Text
        style={[type.label, { color: selected ? color.white : color.muted }]}
      >
        {title}
      </Text>
    </Tap>
  );
}
export function Listen({ text }: { text: string }) {
  const { locale, t } = useCopy();
  return (
    <Tap
      label={t("listen")}
      onPress={() => {
        Speech.stop();
        Speech.speak(text, { language: locale });
      }}
      style={[
        type.row,
        { alignSelf: "flex-start", paddingHorizontal: 12, gap: 8 },
      ]}
    >
      <Volume2 size={19} color={color.blue} />
      <Text style={[type.label, { color: color.blue }]}>{t("listen")}</Text>
    </Tap>
  );
}
export function Empty({
  title,
  action,
  onPress,
}: {
  title: string;
  action?: string;
  onPress?: () => void;
}) {
  return (
    <View style={{ alignItems: "center", gap: 18, paddingVertical: 36 }}>
      <View
        style={{
          width: 70,
          height: 70,
          borderRadius: 24,
          backgroundColor: color.blueWash,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Pill size={30} color={color.blue} />
      </View>
      <Text style={[type.heading, { textAlign: "center" }]}>{title}</Text>
      {action && onPress && <Button title={action} onPress={onPress} />}
    </View>
  );
}
export function Sheet({
  title,
  subtitle,
  children,
  onClose,
  tall = false,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  tall?: boolean;
  footer?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const { t } = useCopy();
  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      accessibilityViewIsModal
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, justifyContent: "flex-end" }}
      >
        <Animated.View
          entering={reduced ? undefined : FadeIn.duration(160)}
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "#1B263D66",
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("close")}
            onPress={onClose}
            style={{ flex: 1 }}
          />
        </Animated.View>
        <Animated.View
          entering={reduced ? undefined : FadeInDown.duration(240)}
          style={{
            width: "100%",
            maxWidth: 620,
            alignSelf: "center",
            maxHeight: height - insets.top - 24,
            height: tall ? height * 0.90 : undefined,
            backgroundColor: color.canvas,
            borderTopLeftRadius: 30,
            borderTopRightRadius: 30,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <View style={{ alignItems: "center", paddingTop: 12 }}>
            <View
              style={{
                width: 38,
                height: 4,
                borderRadius: 4,
                backgroundColor: color.border,
              }}
            />
          </View>
          <View
            style={[
              type.between,
              { paddingHorizontal: 24, paddingVertical: 12, alignItems: "flex-start" },
            ]}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text
                accessibilityRole="header"
                style={[type.heading, { fontSize: 24, lineHeight: 30, fontWeight: "700" }]}
              >
                {title}
              </Text>
              {!!subtitle && (
                <Text style={[type.small, { color: color.muted, fontSize: 14 }]}>
                  {subtitle}
                </Text>
              )}
            </View>
            <Tap
              label={t("close")}
              onPress={onClose}
              style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
            >
              <X size={22} color={color.ink} />
            </Tap>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingHorizontal: 24,
              paddingTop: 4,
              paddingBottom: footer ? 16 : insets.bottom + 28,
              gap: 18,
            }}
          >
            <View style={type.stack}>{children}</View>
          </ScrollView>
          {footer && (
            <View
              style={{
                paddingHorizontal: 16,
                paddingTop: 12,
                paddingBottom: Math.max(insets.bottom, 16) + 6,
                borderTopWidth: 1,
                borderTopColor: color.border,
                backgroundColor: color.paper,
                borderBottomLeftRadius: 30,
                borderBottomRightRadius: 30,
              }}
            >
              {footer}
            </View>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
export function Screen<T = never>({
  title,
  subtitle,
  children,
  back,
  footer,
  list,
}: {
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
  back?: boolean;
  footer?: React.ReactNode;
  list?: {
    data: T[];
    renderItem: ListRenderItem<T>;
    keyExtractor: (item: T) => string;
    empty?: React.ReactNode;
  };
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const focused = useIsFocused();
  const { t } = useCopy();
  const content = (
    <View style={{ gap: 24 }}>
      <View style={type.between}>
        {back ? (
          <Tap
            label={t("back")}
            onPress={() =>
              router.canGoBack() ? router.back() : router.replace("/(tabs)")
            }
            style={type.row}
          >
            <ArrowLeft size={22} color={color.ink} />
            <Text style={type.label}>{t("back")}</Text>
          </Tap>
        ) : (
          <View style={[type.row, { gap: 8 }]}>
            <View
              style={{
                backgroundColor: color.blue,
                borderRadius: 12,
                padding: 8,
                transform: [{ rotate: "-12deg" }],
              }}
            >
              <Pill size={18} color={color.white} />
            </View>
            <Text style={[type.label, { fontSize: 17, letterSpacing: -0.4 }]}>
              mediapp<Text style={{ color: color.orange }}>.</Text>
            </Text>
          </View>
        )}
        <Tap
          label={t("settings")}
          onPress={() => router.push("/settings")}
          style={{
            width: 48,
            alignItems: "center",
            borderRadius: 16,
            backgroundColor: color.paper,
            borderColor: color.border,
            borderWidth: 1,
          }}
        >
          <Settings2 size={20} color={color.ink} />
        </Tap>
      </View>
      {title && (
        <View style={{ gap: 8 }}>
          <Text accessibilityRole="header" style={type.hero}>
            {title}
          </Text>
          {subtitle && (
            <Text style={[type.body, { color: color.muted }]}>{subtitle}</Text>
          )}
        </View>
      )}
      {children}
    </View>
  );
  const padding = {
    paddingTop: insets.top + 12,
    paddingBottom: 28,
    paddingHorizontal: 24,
    width: "100%" as const,
    maxWidth: 760,
    alignSelf: "center" as const,
  };
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: color.canvas,
        display: Platform.OS === "web" && !focused ? "none" : "flex",
      }}
    >
      {list ? (
        <FlatList
          data={list.data}
          keyExtractor={list.keyExtractor}
          renderItem={list.renderItem}
          ListHeaderComponent={content}
          ListHeaderComponentStyle={{ marginBottom: 20 }}
          ListEmptyComponent={
            list.empty ? <View>{list.empty}</View> : undefined
          }
          contentContainerStyle={padding}
          keyboardShouldPersistTaps="handled"
        />
      ) : (
        <ScrollView
          contentContainerStyle={padding}
          keyboardShouldPersistTaps="handled"
        >
          {content}
        </ScrollView>
      )}
      {footer && (
        <View
          style={{
            paddingHorizontal: 24,
            paddingVertical: 12,
            paddingBottom: insets.bottom + 12,
            borderTopWidth: 1,
            borderColor: color.border,
            width: "100%",
            maxWidth: 760,
            alignSelf: "center",
          }}
        >
          {footer}
        </View>
      )}
    </View>
  );
}
export function CheckRow({
  checked,
  label,
  onPress,
}: {
  checked: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Tap
      label={label}
      selected={checked}
      onPress={onPress}
      style={[type.row, { gap: 12 }]}
    >
      <View
        style={{
          width: 25,
          height: 25,
          borderRadius: 8,
          borderWidth: 2,
          borderColor: color.blue,
          backgroundColor: checked ? color.blue : color.paper,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked && <Check size={17} color={color.white} />}
      </View>
      <Text style={[type.body, { flex: 1 }]}>{label}</Text>
    </Tap>
  );
}
export function RowLink({
  title,
  subtitle,
  icon,
  onPress,
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <Tap label={title} onPress={onPress} style={[type.row, { minHeight: 80 }]}>
      {icon}
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={type.heading}>{title}</Text>
        {subtitle && <Text style={type.small}>{subtitle}</Text>}
      </View>
      <ChevronRight size={20} color={color.muted} />
    </Tap>
  );
}
