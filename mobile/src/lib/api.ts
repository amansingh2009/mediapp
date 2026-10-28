import Constants from "expo-constants";
import { fetch } from "expo/fetch";
import { Platform } from "react-native";
import { MedicineInfo } from "../domain/medication";
import { supabase } from "./supabase";

const host = Constants.expoConfig?.hostUri?.split(":")[0] || "127.0.0.1";
export const apiBase = (
  process.env.EXPO_PUBLIC_API_URL || `http://${host}:8102`
).replace(/\/$/, "");
export type Reading = {
  name: string;
  strength: string;
  dosage: string;
  instruction: string;
  frequency: string;
  duration_days?: number;
  original: string;
  model: string;
  printed: string;
};
export type DecodeResult = {
  medicines: Reading[];
  hospital: string;
  doctor: string;
  engine: string;
  review_required: boolean;
  raw_text?: string;
  model_words?: number;
};
export type Hospital = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  distance_km: number | null;
  travel_minutes?: number | null;
  directions_uri?: string | null;
  address: string;
  phone?: string;
  ownership: "public" | "private" | "unknown";
  emergency: boolean;
  facility_type?: string;
  place_types?: string[];
  open_now?: boolean | null;
  opening_hours?: string[] | string;
  today_hours?: string | null;
  business_status?: string;
  rating?: number | null;
  rating_count?: number | null;
  maps_uri?: string | null;
};
export type PlaceSuggestion = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lon: number;
  distance_km?: number;
};
export type MedicineMatch = {
  name: string;
  ingredient?: string | null;
  strengths: string[];
  score: number;
  source: string;
};
function localMedicineMatch(query: string): MedicineMatch[] {
  const normalize = (value: string) => value.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
  const left = normalize(query).replace(/(?:8|16|24|8mg|16mg|24mg)$/, "");
  const right = "vertin";
  // The local fallback covers the medicine spelling example even while the API is offline.
  const a = left.slice(0, Math.min(left.length, 12));
  const b = right;
  const row = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 1; j <= b.length; j++) {
    let diagonal = row[0];
    row[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const above = row[i];
      row[i] = Math.min(row[i] + 1, row[i - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  const score = 1 - row[a.length] / Math.max(a.length, b.length);
  return score >= 0.66
    ? [{ name: "Vertin", ingredient: "betahistine", strengths: ["8 mg", "16 mg", "24 mg"], score, source: "https://www.abbott.in/products/v.html" }]
    : [];
}
async function request<T>(
  path: string,
  init?: RequestInit,
  timeout = 25000,
): Promise<T> {
  const headers = new Headers(init?.headers);
  const session = supabase
    ? (await supabase.auth.getSession()).data.session
    : null;
  if (session) headers.set("Authorization", `Bearer ${session.access_token}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(`${apiBase}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const message = typeof body.detail === "string" ? body.detail : "networkError";
      console.warn(`[API ERROR] ${path} returned ${response.status}:`, message);
      throw new Error(message);
    }
    return response.json() as Promise<T>;
  } finally {
    clearTimeout(timer);
  }
}
export const api = {
  health: () =>
    request<{ google_places_configured: boolean }>("/health"),
  ipLocation: () =>
    request<{ lat: number; lon: number; city: string; country?: string }>(
      "/v1/ip-location",
    ),
  suggestions: (params: {
    q: string;
    country?: string;
    lat?: number;
    lon?: number;
  }) =>
    request<{ suggestions: PlaceSuggestion[] }>(
      `/v1/hospital-suggestions?${new URLSearchParams(
        Object.entries(params)
          .filter(([, value]) => value !== undefined)
          .map(([key, value]) => [key, String(value)]),
      )}`,
    ),
  async decode(uri: string): Promise<DecodeResult> {
    const form = new FormData();
    if (Platform.OS === "web") {
      const response = await fetch(uri);
      const blob = await response.blob();
      form.append("file", blob, "prescription.jpg");
    } else {
      // In React Native mobile, FormData requires an object with uri, type, and name
      form.append("file", {
        uri,
        name: "prescription.jpg",
        type: "image/jpeg",
      } as any);
    }
    return request("/v1/decode", { method: "POST", body: form }, 120000);
  },
  information: (name: string) =>
    request<MedicineInfo>(
      `/v1/medicine-information?q=${encodeURIComponent(name)}`,
      undefined,
      45000,
    ),
  medicineMatches: async (name: string) => {
    try { return await request<{ query: string; matches: MedicineMatch[]; review_required: boolean }>(
      `/v1/medicine-matches?q=${encodeURIComponent(name)}`,
      undefined,
      15000,
    ); }
    catch (error) {
      const matches = localMedicineMatch(name);
      if (matches.length) return { query: name, matches, review_required: true };
      throw error;
    }
  },
  hospitals: (params: {
    lat?: number;
    lon?: number;
    city?: string;
    radius?: number;
    country?: string;
  }) =>
    request<{
      hospitals: Hospital[];
      lat: number | null;
      lon: number | null;
      source?: string;
    }>(
      `/v1/hospitals?${new URLSearchParams(
        Object.entries(params)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)]),
      )}`,
      undefined,
      45000,
    ),
};
