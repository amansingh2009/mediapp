export type Language = "en" | "hi" | "ta";
export type RecordBase = { id: string; updatedAt: string; deleted?: boolean };
export type Profile = RecordBase & {
  name: string;
  hospital: string;
  doctor: string;
  active: boolean;
  imageUri?: string;
  imagePath?: string;
  sample?: boolean;
  createdAt: string;
};
export type MedicineInfo = {
  uses?: string;
  general_dosage?: string;
  general_dosage_source?: { label: string; url: string };
  common_effects?: string;
  serious_effects?: string;
  adverse_reactions?: string;
  warnings?: string;
  ingredients: string[];
  other_ingredients: string[];
  source?: string;
  label_date?: string;
  fetched_at?: string;
  routes?: string[];
  sources?: { label: string; url: string }[];
};
export type Medicine = RecordBase & {
  profileId: string;
  global: boolean;
  name: string;
  strength: string;
  dosage: string;
  instruction: string;
  frequency: string;
  durationDays?: number;
  reviewed: boolean;
  reading?: { original: string; model: string; printed: string };
  info?: MedicineInfo;
};
export type Reminder = RecordBase & {
  medicineId: string;
  dosage: string;
  times: string[];
  baselineTimes?: string[];
  days: number[];
  start: string;
  end?: string;
  food: "" | "before" | "after" | "with";
  active: boolean;
};
export type DoseEvent = RecordBase & {
  reminderId: string;
  date: string;
  time: string;
  status: "taken" | "skipped" | "snoozed";
  snoozedUntil?: string;
  name: string;
  strength: string;
  dosage: string;
  profileName: string;
};
export type Data = {
  schema: 1;
  profiles: Profile[];
  medicines: Medicine[];
  reminders: Reminder[];
  events: DoseEvent[];
};
export type Dose = {
  id: string;
  date: string;
  time: string;
  at: Date;
  medicine: Medicine;
  profile?: Profile;
  reminder: Reminder;
  event?: DoseEvent;
  status: "upcoming" | "due" | "unrecorded" | DoseEvent["status"];
};
export const blank = (): Data => ({
  schema: 1,
  profiles: [],
  medicines: [],
  reminders: [],
  events: [],
});
export const uid = (prefix = "id") =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 11)}`;
export const dayKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export function shiftDay(date: string, amount: number) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + amount);
  return dayKey(d);
}
export const validTime = (time: string) =>
  /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
export function validDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(date.valueOf()) &&
    dayKey(date) === value
  );
}
export function validateSchedule(
  reminder: Pick<Reminder, "dosage" | "times" | "days" | "start" | "end">,
): string | null {
  if (!reminder.dosage.trim()) return "doseRequired";
  if (
    !reminder.times.length ||
    reminder.times.some((t) => !validTime(t)) ||
    new Set(reminder.times).size !== reminder.times.length
  )
    return "timeInvalid";
  if (
    !reminder.days.length ||
    reminder.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)
  )
    return "daysRequired";
  if (
    !validDate(reminder.start) ||
    (reminder.end &&
      (!validDate(reminder.end) || reminder.end < reminder.start))
  )
    return "dateInvalid";
  return null;
}
// Anchored to the original schedule, never the most recent edit.
export function validateTimeAdjustment(
  times: string[],
  baseline: string[],
): string | null {
  if (
    !baseline.length ||
    times.length !== baseline.length ||
    [...times, ...baseline].some((t) => !validTime(t))
  )
    return "timeWindow";
  const minutes = (t: string) =>
    Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  if (times.some((t, i) => Math.abs(minutes(t) - minutes(baseline[i])) > 120))
    return "timeWindow";
  return null;
}
export function merge(a: Data, b: Data): Data {
  const rows = <T extends RecordBase>(x: T[], y: T[]): T[] => {
    const out = new Map(x.map((r) => [r.id, r]));
    for (const row of y) {
      const previous = out.get(row.id);
      if (
        !previous ||
        row.updatedAt > previous.updatedAt ||
        (row.updatedAt === previous.updatedAt && row.deleted)
      )
        out.set(row.id, row);
    }
    return [...out.values()];
  };
  return {
    schema: 1,
    profiles: rows(a.profiles, b.profiles),
    medicines: rows(a.medicines, b.medicines),
    reminders: rows(a.reminders, b.reminders),
    events: rows(a.events, b.events),
  };
}
export function running(data: Data, reminder: Reminder) {
  const med = data.medicines.find(
    (m) => m.id === reminder.medicineId && !m.deleted,
  );
  return Boolean(
    med?.reviewed &&
    !reminder.deleted &&
    reminder.active &&
    (med.global ||
      data.profiles.some(
        (p) => p.id === med.profileId && p.active && !p.deleted,
      )),
  );
}
export const isSample = (data: Data, medicine: Medicine) =>
  Boolean(data.profiles.find((p) => p.id === medicine.profileId)?.sample);
export const visibleMedicines = (data: Data, profile: string | null) =>
  data.medicines.filter(
    (m) => !m.deleted && (m.global || m.profileId === profile),
  );
export function plan(
  data: Data,
  date: string,
  profile?: string | null,
  now = new Date(),
): Dose[] {
  const weekday = new Date(`${date}T12:00:00`).getDay();
  return data.reminders
    .flatMap((reminder) => {
      const medicine = data.medicines.find((m) => m.id === reminder.medicineId);
      if (
        !medicine ||
        (profile !== undefined &&
          !medicine.global &&
          medicine.profileId !== profile)
      )
        return [];
      const events = data.events.filter(
        (e) => e.reminderId === reminder.id && e.date === date && !e.deleted,
      );
      const scheduled =
        running(data, reminder) &&
        reminder.days.includes(weekday) &&
        date >= reminder.start &&
        (!reminder.end || date <= reminder.end);
      const displaced = new Set(
        events
          .filter((event) => event.time !== event.id.slice(-5))
          .map((event) => event.id.slice(-5)),
      );
      const times = [
        ...new Set([
          ...(scheduled
            ? reminder.times.filter((time) => !displaced.has(time))
            : []),
          ...events.map((e) => e.time),
        ]),
      ];
      return times.map((time) => {
        const scheduledId = `${reminder.id}:${date}:${time}`;
        const event = events.find((e) => e.time === time);
        const id = event?.id ?? scheduledId;
        const at = new Date(`${date}T${time}:00`);
        const status: Dose["status"] =
          event?.status === "snoozed" &&
          event.snoozedUntil &&
          new Date(event.snoozedUntil) <= now
            ? date < dayKey(now)
              ? "unrecorded"
              : "due"
            : event?.status ||
              (date < dayKey(now)
                ? "unrecorded"
                : at <= now
                  ? "due"
                  : "upcoming");
        return {
          id,
          date,
          time,
          at,
          medicine: event
            ? { ...medicine, name: event.name, strength: event.strength }
            : medicine,
          reminder: event ? { ...reminder, dosage: event.dosage } : reminder,
          profile: data.profiles.find((p) => p.id === medicine.profileId),
          event,
          status,
        };
      });
    })
    .sort((a, b) => a.at.valueOf() - b.at.valueOf());
}

export function remainingToday(doses: Dose[], now = new Date()) {
  const minute = new Date(now);
  minute.setSeconds(0, 0);
  const tomorrow = new Date(now);
  tomorrow.setHours(24, 0, 0, 0);
  const today = dayKey(now);
  return doses.filter(
    (dose) => dose.date === today && dose.at >= minute && dose.at < tomorrow,
  );
}

export function completedToday(doses: Dose[]) {
  return doses.length > 0 && doses.every((dose) => dose.status === "taken");
}
export function cloudData(data: Data): Data {
  const profiles = new Set(
    data.profiles.filter((p) => p.sample).map((p) => p.id),
  );
  const medicines = new Set(
    data.medicines.filter((m) => profiles.has(m.profileId)).map((m) => m.id),
  );
  const reminders = new Set(
    data.reminders.filter((r) => medicines.has(r.medicineId)).map((r) => r.id),
  );
  return {
    schema: 1,
    profiles: data.profiles
      .filter((p) => !profiles.has(p.id))
      .map(({ imageUri, ...p }) => p),
    medicines: data.medicines.filter((m) => !medicines.has(m.id)),
    reminders: data.reminders.filter((r) => !reminders.has(r.id)),
    events: data.events.filter((e) => !reminders.has(e.reminderId)),
  };
}
export function suggestedTimes(frequency: string) {
  const f = frequency.toUpperCase();
  if (/PRN|SOS|AS NEEDED/.test(f)) return [];
  if (/TID|TDS|THREE|1-1-1|MORNING.*AFTERNOON.*EVENING/.test(f)) return ["08:00", "14:00", "20:00"];
  if (/BID|\bBD\b|TWICE|1-0-1|MORNING.*EVENING/.test(f)) return ["08:00", "20:00"];
  if (/HS|NIGHT|BEDTIME|0-0-1/.test(f)) return ["21:00"];
  if (/QID|FOUR/.test(f)) return ["08:00", "12:00", "16:00", "20:00"];
  if (/IN THE AFTERNOON/.test(f)) return ["14:00"];
  if (/\bOD\b|\bQD\b|ONCE|DAILY|1-0-0|IN THE MORNING/.test(f)) return ["08:00"];
  return [];
}
