/* eslint import/namespace: "off" -- Expo 58 exports these enums via .types modules; tsc resolves them, eslint-import does not. */
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { useSyncExternalStore } from "react";
import {
  Data,
  dayKey,
  isSample,
  Language,
  running,
  shiftDay,
} from "../domain/medication";
import { tr } from "./i18n";

type Status = {
  enabled: boolean;
  limited: boolean;
  count: number;
  through?: string;
  error: boolean;
};
let status: Status = { enabled: false, limited: false, count: 0, error: false };
const listeners = new Set<() => void>();
const publish = (next: Status) => {
  status = next;
  listeners.forEach((fn) => fn());
};
let queue = Promise.resolve();
const PREFIX = "mediapp.";
const hash = (text: string) => {
  let n = 0;
  for (const char of text) n = (Math.imul(31, n) + char.charCodeAt(0)) | 0;
  return (n >>> 0).toString(36);
};
if (Platform.OS !== "web")
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
export async function allowNotifications(language: Language) {
  if (Platform.OS === "web") return false;
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync("medicine", {
      name: tr("reminders", language),
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 100, 200],
    });
  const previous = await Notifications.getPermissionsAsync();
  if (
    previous.granted ||
    previous.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  )
    return true;
  const result = await Notifications.requestPermissionsAsync();
  return (
    result.granted ||
    result.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}
export function reconcileNotifications(data: Data, language: Language) {
  const task = async () => {
    if (Platform.OS === "web") return;
    try {
      const permissions = await Notifications.getPermissionsAsync();
      if (
        !permissions.granted &&
        permissions.ios?.status !==
          Notifications.IosAuthorizationStatus.PROVISIONAL
      ) {
        publish({ enabled: false, count: 0, limited: false, error: false });
        return;
      }
      await Notifications.setNotificationCategoryAsync("dose", [
        {
          identifier: "taken",
          buttonTitle: tr("markTaken", language),
          options: { opensAppToForeground: true },
        },
        {
          identifier: "snoozed",
          buttonTitle: tr("snooze", language),
          options: { opensAppToForeground: true },
        },
        {
          identifier: "skipped",
          buttonTitle: tr("skip", language),
          options: { opensAppToForeground: true },
        },
      ]);
      const desired: {
        identifier: string;
        at: Date;
        content: Notifications.NotificationContentInput;
      }[] = [];
      const now = new Date();
      const today = dayKey(now);
      for (const reminder of data.reminders) {
        if (!running(data, reminder)) continue;
        const medicine = data.medicines.find(
          (m) => m.id === reminder.medicineId,
        )!;
        if (isSample(data, medicine)) continue;
        const profile = data.profiles.find((p) => p.id === medicine.profileId);
        const content = (
          date: string,
          time: string,
        ): Notifications.NotificationContentInput => ({
          title: `${tr("due", language)} · ${medicine.name}`,
          body: `${reminder.dosage}${reminder.food ? ` · ${tr(reminder.food, language)}` : ""} · ${medicine.global ? tr("global", language) : profile?.name || profile?.hospital || tr("prescription", language)}`,
          categoryIdentifier: "dose",
          sound: true,
          data: { reminderId: reminder.id, date, time },
        });
        const first = reminder.start > today ? reminder.start : today;
        let added = 0;
        for (let offset = 0; offset < 370 && added < 61; offset++) {
          const date = shiftDay(first, offset);
          if (reminder.end && date > reminder.end) break;
          if (!reminder.days.includes(new Date(`${date}T12:00:00`).getDay()))
            continue;
          for (const time of reminder.times) {
            const at = new Date(`${date}T${time}:00`);
            const id = `${reminder.id}:${date}:${time}`;
            if (at <= now || data.events.some((e) => e.id === id && !e.deleted))
              continue;
            const body = content(date, time);
            desired.push({
              identifier: `${PREFIX}${hash(id + JSON.stringify(body) + reminder.updatedAt)}`,
              at,
              content: body,
            });
            added++;
          }
        }
        for (const event of data.events.filter(
          (e) =>
            e.reminderId === reminder.id &&
            !e.deleted &&
            e.status === "snoozed" &&
            e.snoozedUntil &&
            new Date(e.snoozedUntil) > now,
        )) {
          desired.push({
            identifier: `${PREFIX}snooze.${hash(event.id + event.snoozedUntil)}`,
            at: new Date(event.snoozedUntil!),
            content: content(event.date, event.time),
          });
        }
      }
      desired.sort((a, b) => a.at.valueOf() - b.at.valueOf());
      const chosen = desired.slice(0, 60);
      const ids = new Set(chosen.map((p) => p.identifier));
      const current = await Notifications.getAllScheduledNotificationsAsync();
      for (const item of current)
        if (item.identifier.startsWith(PREFIX) && !ids.has(item.identifier))
          await Notifications.cancelScheduledNotificationAsync(item.identifier);
      const existing = new Set(current.map((item) => item.identifier));
      for (const notification of chosen)
        if (!existing.has(notification.identifier))
          await Notifications.scheduleNotificationAsync({
            identifier: notification.identifier,
            content: notification.content,
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: notification.at,
              channelId: "medicine",
            },
          });
      publish({
        enabled: true,
        count: chosen.length,
        limited: desired.length > 60,
        through: chosen.length
          ? dayKey(chosen[chosen.length - 1].at)
          : undefined,
        error: false,
      });
    } catch {
      publish({ ...status, error: true });
    }
  };
  queue = queue.then(task, task);
  return queue;
}
export const useAlerts = () =>
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => status,
    () => status,
  );
export { Notifications };
