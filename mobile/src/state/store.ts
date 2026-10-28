import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";
import { Platform } from "react-native";
import { getLocales } from "expo-localization";
import {
  blank,
  cloudData,
  Data,
  Dose,
  DoseEvent,
  Language,
  Medicine,
  merge,
  Profile,
  Reminder,
  uid,
  validateSchedule,
  validateTimeAdjustment,
  suggestedTimes,
} from "../domain/medication";
import type { DecodeResult } from "../lib/api";
import { supabase } from "../lib/supabase";

type Preferences = {
  selected: string | null;
  language: Language;
  onboarded: boolean;
  owner: string | null;
};
type State = {
  data: Data;
  preferences: Preferences;
  ready: boolean;
  sync: "localOnly" | "syncing" | "synced" | "offline";
  error: string | null;
};
const KEY = "mediapp.v1";
const language = getLocales()[0]?.languageCode;
let state: State = {
  data: blank(),
  preferences: {
    selected: null,
    language: language === "hi" || language === "ta" ? language : "en",
    onboarded: false,
    owner: null,
  },
  ready: false,
  sync: "localOnly",
  error: null,
};
const listeners = new Set<() => void>();
let queue = Promise.resolve();
let hydration: Promise<void> | null = null;
let syncJob: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout>;
let lastStamp = 0;
const stamp = () => {
  const newest = Math.max(
    0,
    ...(["profiles", "medicines", "reminders", "events"] as const).flatMap(
      (key) => state.data[key].map((r) => Date.parse(r.updatedAt) || 0),
    ),
  );
  lastStamp = Math.max(Date.now(), lastStamp + 1, newest + 1);
  return new Date(lastStamp).toISOString();
};
const publish = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
};
function write(transform: (current: State) => State, sync = true) {
  const task = queue.then(async () => {
    await store.hydrate();
    const next = transform(state);
    try {
      await AsyncStorage.setItem(
        KEY,
        JSON.stringify({ data: next.data, preferences: next.preferences }),
      );
    } catch {
      throw new Error("storageError");
    }
    publish(next);
  });
  queue = task.catch(() => {
    publish({ error: "storageError" });
  });
  return task.then(() => {
    if (sync && supabase && state.preferences.owner) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void store.synchronize();
      }, 1000);
    }
  });
}
export async function keepImage(uri: string, id: string) {
  if (Platform.OS === "web") {
    if (uri.startsWith("data:")) return uri;
    const blob = await (await fetch(uri)).blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  const { File, Directory, Paths } = await import("expo-file-system");
  const directory = new Directory(Paths.document, "prescriptions");
  directory.create({ idempotent: true, intermediates: true });
  const source = new File(uri);
  const target = new File(directory, `${id}.jpg`);
  if (source.uri !== target.uri && !target.exists) await source.copy(target);
  return target.uri;
}
export const store = {
  get: () => state,
  subscribe: (fn: () => void) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  hydrate() {
    if (!hydration)
      hydration = (async () => {
        try {
          const raw = await AsyncStorage.getItem(KEY);
          if (raw) {
            const saved = JSON.parse(raw);
            if (saved.data?.schema !== 1) throw new Error("storageError");
            publish({
              data: saved.data,
              preferences: saved.preferences,
              ready: true,
            });
          } else publish({ ready: true });
        } catch {
          publish({ ready: true, error: "storageError" });
        }
      })();
    return hydration;
  },
  preferences: (change: Partial<Preferences>) =>
    write((s) => ({ ...s, preferences: { ...s.preferences, ...change } })),
  async addPrescription(
    result: DecodeResult,
    imageUri: string,
    sample = false,
  ) {
    const id = uid("rx");
    const at = stamp();
    const localImage = imageUri ? await keepImage(imageUri, id) : undefined;
    const profile: Profile = {
      id,
      name: sample
        ? "Sample prescription"
        : result.hospital || result.doctor || `Prescription · ${new Date(at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`,
      hospital: result.hospital,
      doctor: result.doctor,
      active: true,
      sample,
      imageUri: localImage,
      createdAt: at,
      updatedAt: at,
    };
    const medicines: Medicine[] = result.medicines.map((row) => ({
      id: uid("med"),
      profileId: id,
      global: false,
      name: row.name,
      strength: row.strength,
      dosage: row.dosage,
      instruction: row.instruction,
      frequency: row.frequency,
      durationDays: row.duration_days,
      reviewed: sample,
      reading: {
        original: row.original,
        model: row.model,
        printed: row.printed,
      },
      updatedAt: at,
    }));
    await write((s) => ({
      ...s,
      data: merge(s.data, { ...blank(), profiles: [profile], medicines }),
      preferences: { ...s.preferences, selected: id, onboarded: true },
    }));
    return id;
  },
  addDecodedMedicines(profileId: string, result: DecodeResult) {
    if (!result.medicines.length) throw new Error("decodeUnavailable");
    return write((s) => {
      const profile = s.data.profiles.find((p) => p.id === profileId && !p.deleted);
      const existing = s.data.medicines.filter((m) => m.profileId === profileId && !m.deleted);
      if (!profile || existing.some((m) =>
        !m.reading || m.reviewed || s.data.reminders.some((r) => r.medicineId === m.id && !r.deleted)
      ))
        throw new Error("decodeUnavailable");
      const at = stamp();
      const replaced = new Set(existing.map((m) => m.id));
      const medicines: Medicine[] = result.medicines.map((row) => ({
        id: uid("med"),
        profileId,
        global: false,
        name: row.name,
        strength: row.strength,
        dosage: row.dosage,
        instruction: row.instruction,
        frequency: row.frequency,
        durationDays: row.duration_days,
        reviewed: false,
        reading: { original: row.original, model: row.model, printed: row.printed },
        updatedAt: at,
      }));
      return {
        ...s,
        data: {
          ...s.data,
          profiles: s.data.profiles.map((p) => p.id === profileId ? {
            ...p,
            hospital: p.hospital || result.hospital,
            doctor: p.doctor || result.doctor,
            name: p.name || result.hospital || result.doctor,
            updatedAt: at,
          } : p),
          medicines: [
            ...s.data.medicines.map((m) => replaced.has(m.id) ? { ...m, deleted: true, updatedAt: at } : m),
            ...medicines,
          ],
        },
      };
    });
  },
  profile: (
    id: string,
    change: Partial<Pick<Profile, "name" | "hospital" | "doctor" | "active">>,
  ) =>
    write((s) => ({
      ...s,
      data: {
        ...s.data,
        profiles: s.data.profiles.map((p) =>
          p.id === id ? { ...p, ...change, updatedAt: stamp() } : p,
        ),
      },
    })),
  medicine: (
    id: string,
    change: Partial<Omit<Medicine, "id" | "profileId" | "updatedAt">>,
  ) =>
    write((s) => ({
      ...s,
      data: {
        ...s.data,
        medicines: s.data.medicines.map((m) => {
          if (m.id !== id) return m;
          if (
            m.reading &&
            [
              "name",
              "strength",
              "dosage",
              "frequency",
              "durationDays",
              "instruction",
            ].some(
              (key) =>
                key in change &&
                change[key as keyof typeof change] !== m[key as keyof Medicine],
            )
          )
            throw new Error("prescriptionLocked");
          return { ...m, ...change, updatedAt: stamp() };
        }),
      },
    })),
  async manual(
    medicine: Pick<
      Medicine,
      "name" | "strength" | "dosage" | "instruction" | "global"
    >,
  ) {
    if (!medicine.name.trim()) throw new Error("nameRequired");
    const record: Medicine = {
      ...medicine,
      name: medicine.name.trim(),
      id: uid("med"),
      frequency: "",
      profileId: state.preferences.selected || "",
      reviewed: true,
      updatedAt: stamp(),
    };
    if (!record.profileId) record.global = true;
    await write((s) => ({
      ...s,
      data: { ...s.data, medicines: [...s.data.medicines, record] },
    }));
    return record.id;
  },
  async saveReminder(
    input: Omit<Reminder, "id" | "updatedAt"> & { id?: string },
    confirmReading = false,
    confirmedName?: string,
  ) {
    const problem = validateSchedule(input);
    if (problem) throw new Error(problem);
    const medicine = state.data.medicines.find(
      (m) => m.id === input.medicineId && !m.deleted,
    );
    if (!medicine || (!medicine.reviewed && !confirmReading))
      throw new Error("reviewRequired");
    const existing = state.data.reminders.find(
      (r) => r.medicineId === input.medicineId && !r.deleted,
    );
    if (
      medicine.reading &&
      (!medicine.dosage || !medicine.frequency || !medicine.durationDays)
    )
      throw new Error("incompleteReading");
    const baselineTimes =
      existing?.baselineTimes ||
      existing?.times ||
      suggestedTimes(medicine.frequency);
    const timingProblem = validateTimeAdjustment(input.times, baselineTimes);
    if (timingProblem) throw new Error(timingProblem);
    if (
      input.dosage !== medicine.dosage ||
      (existing &&
        (input.start !== existing.start ||
          input.end !== existing.end ||
          input.food !== existing.food ||
          JSON.stringify(input.days) !== JSON.stringify(existing.days)))
    )
      throw new Error("prescriptionLocked");
    const row: Reminder = {
      ...input,
      baselineTimes,
      id: input.id || existing?.id || `rem_${input.medicineId}`,
      updatedAt: stamp(),
      deleted: false,
    };
    await write((s) => ({
        ...s,
        data: {
          ...s.data,
          medicines: confirmReading
            ? s.data.medicines.map((m) =>
                m.id === medicine.id
                  ? { ...m, name: confirmedName || m.name, reviewed: true, updatedAt: row.updatedAt }
                  : m,
              )
            : s.data.medicines,
          reminders: [...s.data.reminders.filter((r) => r.id !== row.id), row],
        },
    }));
  },
  reminder: (
    id: string,
    change: Partial<Pick<Reminder, "active" | "deleted">>,
  ) =>
    write((s) => ({
      ...s,
      data: {
        ...s.data,
        reminders: s.data.reminders.map((r) =>
          r.id === id ? { ...r, ...change, updatedAt: stamp() } : r,
        ),
      },
    })),
  removeMedicine: (id: string) =>
    write((s) => ({
      ...s,
      data: {
        ...s.data,
        medicines: s.data.medicines.map((m) =>
          m.id === id ? { ...m, deleted: true, updatedAt: stamp() } : m,
        ),
        reminders: s.data.reminders.map((r) =>
          r.medicineId === id ? { ...r, deleted: true, updatedAt: stamp() } : r,
        ),
      },
    })),
  log: (dose: Dose, status: DoseEvent["status"], minutes?: number) =>
    write((s) => {
      const requested = minutes
        ? new Date(Math.max(Date.now(), dose.at.valueOf()) + minutes * 60000)
        : undefined;
      const endOfDoseDay = new Date(`${dose.date}T23:59:00`);
      const snoozedUntil = requested
        ? new Date(Math.min(requested.valueOf(), endOfDoseDay.valueOf()))
        : undefined;
      const event: DoseEvent = {
        id: dose.id,
        reminderId: dose.reminder.id,
        date: dose.date,
        time: snoozedUntil
          ? `${String(snoozedUntil.getHours()).padStart(2, "0")}:${String(snoozedUntil.getMinutes()).padStart(2, "0")}`
          : dose.time,
        status,
        snoozedUntil: snoozedUntil?.toISOString(),
        name: dose.medicine.name,
        strength: dose.medicine.strength,
        dosage: dose.reminder.dosage,
        profileName: dose.medicine.global
          ? "global"
          : dose.profile?.name || dose.profile?.hospital || "",
        updatedAt: stamp(),
      };
      return {
        ...s,
        data: {
          ...s.data,
          events: [...s.data.events.filter((e) => e.id !== event.id), event],
        },
      };
    }),
  undo: (id: string) =>
    write((s) => ({
      ...s,
      data: {
        ...s.data,
        events: s.data.events.map((e) =>
          e.id === id ? { ...e, deleted: true, updatedAt: stamp() } : e,
        ),
      },
    })),
  async account(owner: string | null) {
    await queue;
    if (state.preferences.owner === owner) return;
    if (syncJob) await syncJob;
    const previous = state.preferences.owner;
    if (previous)
      await AsyncStorage.setItem(
        `${KEY}.${previous}`,
        JSON.stringify(state.data),
      );
    const archived = owner
      ? await AsyncStorage.getItem(`${KEY}.${owner}`)
      : null;
    await write(
      (s) => ({
        ...s,
        data:
          owner && !previous
            ? merge(s.data, archived ? JSON.parse(archived) : blank())
            : archived
              ? JSON.parse(archived)
              : blank(),
        preferences: {
          ...s.preferences,
          owner,
          selected: owner && !previous ? s.preferences.selected : null,
        },
        sync: "localOnly",
      }),
      false,
    );
  },
  async resetDevelopment() {
    if (!__DEV__) throw new Error("prescriptionLocked");
    clearTimeout(timer);
    if (syncJob) await syncJob;
    await queue;
    // Detach before clearing so an auth callback cannot archive erased data.
    await write(
      (s) => ({
        ...s,
        data: blank(),
        preferences: {
          ...s.preferences,
          owner: null,
          selected: null,
          onboarded: false,
        },
        sync: "localOnly",
        error: null,
      }),
      false,
    );
    if (supabase) {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
    }
    const keys = (await AsyncStorage.getAllKeys()).filter(
      (k) => k === KEY || k.startsWith(`${KEY}.`),
    );
    await AsyncStorage.multiRemove(keys);
    if (Platform.OS !== "web") {
      const { Directory, Paths } = await import("expo-file-system");
      const directory = new Directory(Paths.document, "prescriptions");
      if (directory.exists) directory.delete();
    }
    const { reconcileNotifications } = await import("../lib/notifications");
    await reconcileNotifications(blank(), state.preferences.language);
  },
  async synchronize() {
    if (!supabase || !state.preferences.owner) return;
    if (syncJob) return syncJob;
    syncJob = (async () => {
      const owner = state.preferences.owner;
      publish({ sync: "syncing" });
      try {
        const session = (await supabase.auth.getSession()).data.session;
        if (session?.user.id !== owner) throw new Error("networkError");
        for (let attempt = 0; attempt < 3; attempt++) {
          const { data: remote, error } = await supabase
            .from("medication_backups")
            .select("revision,payload")
            .eq("user_id", owner)
            .maybeSingle();
          if (error) throw error;
          let outgoing = blank();
          await write((s) => {
            if (s.preferences.owner !== owner) throw new Error("networkError");
            const images = new Map(
              s.data.profiles.map((p) => [p.id, p.imageUri]),
            );
            const data = remote?.payload
              ? merge(s.data, remote.payload as Data)
              : s.data;
            const merged = {
              ...data,
              profiles: data.profiles.map((p) => ({
                ...p,
                imageUri: images.get(p.id),
              })),
            };
            outgoing = cloudData(merged);
            return {
              ...s,
              data: merged,
              preferences: {
                ...s.preferences,
                selected:
                  !s.preferences.selected &&
                  !s.data.profiles.some((p) => !p.deleted)
                    ? merged.profiles.find((p) => !p.deleted)?.id || null
                    : s.preferences.selected,
              },
            };
          }, false);
          const { error: conflict } = await supabase.rpc(
            "save_medication_backup",
            {
              expected_revision: remote?.revision || 0,
              next_payload: outgoing,
            },
          );
          if (!conflict) break;
          if (conflict.code !== "40001" || attempt === 2) throw conflict;
        }
        // Photos are private objects and are never placed inside the JSON backup.
        for (const profile of state.data.profiles.filter(
          (p) => !p.deleted && !p.sample && p.imageUri && !p.imagePath,
        )) {
          if (state.preferences.owner !== owner) break;
          const path = `${owner}/${profile.id}.jpg`;
          const readNativeImage = async () => {
            const { File } = await import("expo-file-system");
            return new File(profile.imageUri!).bytes();
          };
          const image =
            Platform.OS === "web"
              ? await (await fetch(profile.imageUri!)).arrayBuffer()
              : await readNativeImage();
          const bytes =
            image instanceof Uint8Array ? image : new Uint8Array(image);
          const mime =
            bytes[0] === 137 && bytes[1] === 80
              ? "image/png"
              : bytes[0] === 82 && bytes[1] === 73
                ? "image/webp"
                : "image/jpeg";
          const { error } = await supabase.storage
            .from("prescriptions")
            .upload(path, image, { contentType: mime, upsert: true });
          if (error) throw error;
          await write((s) => ({
            ...s,
            data: {
              ...s.data,
              profiles: s.data.profiles.map((p) =>
                p.id === profile.id
                  ? { ...p, imagePath: path, updatedAt: stamp() }
                  : p,
              ),
            },
          }));
        }
        for (const profile of state.data.profiles.filter(
          (p) => !p.deleted && p.imagePath && !p.imageUri,
        )) {
          if (state.preferences.owner !== owner) break;
          const { data, error } = await supabase.storage
            .from("prescriptions")
            .download(profile.imagePath!);
          if (error || !data) continue;
          let uri: string;
          if (Platform.OS === "web")
            uri = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = reject;
              reader.readAsDataURL(data);
            });
          else {
            const { File, Directory, Paths } = await import("expo-file-system");
            const directory = new Directory(Paths.document, "prescriptions");
            directory.create({ idempotent: true, intermediates: true });
            const file = new File(directory, `${profile.id}.jpg`);
            file.write(new Uint8Array(await data.arrayBuffer()));
            uri = file.uri;
          }
          await write(
            (s) => ({
              ...s,
              data: {
                ...s.data,
                profiles: s.data.profiles.map((p) =>
                  p.id === profile.id ? { ...p, imageUri: uri } : p,
                ),
              },
            }),
            false,
          );
        }
        publish({ sync: "synced" });
      } catch {
        publish({ sync: "offline" });
      } finally {
        syncJob = null;
      }
    })();
    return syncJob;
  },
};
export const useStore = () =>
  useSyncExternalStore(store.subscribe, store.get, store.get);
