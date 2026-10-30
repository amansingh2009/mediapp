import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Text, View } from "react-native";
import * as Location from "expo-location";
import { Clock3, MapPin, Navigation, Phone, Star } from "lucide-react-native";
import {
  Button,
  Card,
  Chip,
  Empty,
  Field,
  Notice,
  Screen,
  Tag,
  Tap,
  useCopy,
} from "../../ui/components";
import { color, type } from "../../ui/theme";
import { api, Hospital, PlaceSuggestion } from "../../lib/api";

const hasHours = (hospital: Hospital) =>
  Array.isArray(hospital.opening_hours)
    ? hospital.opening_hours.length > 0
    : Boolean(hospital.opening_hours);

function currentPositionWithTimeout() {
  return new Promise<Location.LocationObject>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("locationTimeout")), 15000);
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      .then(resolve, reject)
      .finally(() => clearTimeout(timer));
  });
}

export default function Hospitals() {
  const { t } = useCopy();
  const country = "IN";
  const loadedDefaultLocation = useRef(false);
  const searchRequest = useRef(0);
  const [city, setCity] = useState("");
  const [origin, setOrigin] = useState<{ lat: number; lon: number }>();
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestedQuery, setSuggestedQuery] = useState("");
  useEffect(() => {
    if (!showSuggestions || city.trim().length < 3) return;
    let active = true;
    const timer = setTimeout(() => {
      setSuggesting(true);
      api
        .suggestions({ q: city.trim(), country, ...origin })
        .then((result) => {
          if (active) {
            setSuggestions(result.suggestions);
            setSuggestedQuery(city.trim());
            setSuggestError(false);
          }
        })
        .catch(() => {
          if (active) setSuggestError(true);
        })
        .finally(() => {
          if (active) setSuggesting(false);
        });
    }, 600);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [city, country, origin, showSuggestions]);
  const [rows, setRows] = useState<Hospital[]>([]);
  const [filter, setFilter] = useState<
    "all" | "hospital" | "clinic" | "emergency"
  >("all");
  const [busy, setBusy] = useState<"search" | "location" | null>(null);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState("");
  const [distanceFrom, setDistanceFrom] = useState("");
  const [initializing, setInitializing] = useState(true);
  const [expandedHours, setExpandedHours] = useState<string>();
  useEffect(() => {
    if (loadedDefaultLocation.current) return;
    loadedDefaultLocation.current = true;
    const request = ++searchRequest.current;
    async function loadIpLocation() {
      try {
        const location = await api.ipLocation();
        if (request !== searchRequest.current) return;
        const coordinates = { lat: location.lat, lon: location.lon };
        setCity(location.city);
        setOrigin(coordinates);
        setDistanceFrom(location.city);
        const health = await api.health();
        if (!health.google_places_configured) throw new Error("placesNotConfigured");
        const result = await api.hospitals({ ...coordinates, country: location.country || country });
        if (request !== searchRequest.current) return;
        setRows(result.hospitals);
        setSource(result.source ?? "Google Places");
        setSearched(true);
        setError("");
      } catch (error) {
        if (request === searchRequest.current) setError(
          error instanceof Error && error.message === "placesNotConfigured"
            ? t("placesNotConfigured")
            : t("nearbyUnavailable"),
        );
      } finally {
        if (request === searchRequest.current) setInitializing(false);
      }
    }
    void loadIpLocation();
  }, [t]);
  async function find(location: boolean, place?: PlaceSuggestion) {
    if (busy) return;
    if (!location && city.trim().length < 2) return;
    const request = ++searchRequest.current;
    setBusy(location ? "location" : "search");
    setShowSuggestions(false);
    setError("");
    try {
      let params: { lat?: number; lon?: number; city?: string };
      if (place) {
        const coordinates = { lat: place.lat, lon: place.lon };
        params = coordinates;
        setOrigin(coordinates);
        setDistanceFrom(place.name);
      } else if (location) {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) {
          setError(t("locationPermission"));
          return;
        }
        const position = await currentPositionWithTimeout();
        const coordinates = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        };
        params = coordinates;
        setOrigin(coordinates);
        setDistanceFrom(t("yourLocation"));
      } else {
        params = { city: city.trim() };
        setDistanceFrom(city.trim());
      }
      const health = await api.health();
      if (!health.google_places_configured) throw new Error("placesNotConfigured");
      const result = await api.hospitals({ ...params, country });
      if (request !== searchRequest.current) return;
      setRows(result.hospitals);
      setSource(result.source ?? "Google Places");
      setSearched(true);
      setInitializing(false);
    } catch (e) {
      setError(e instanceof Error && e.message === "placesNotConfigured"
        ? t("placesNotConfigured")
        : e instanceof Error && e.message === "locationTimeout"
          ? t("locationUnavailable")
          : e instanceof Error && e.message === "networkError"
            ? t("nearbyUnavailable")
            : t("locationUnavailable"));
    } finally {
      setBusy(null);
    }
  }
  const visible = rows.filter((row) => {
    const facility = row.facility_type?.toLowerCase() ?? "hospital";
    if (filter === "all") return true;
    if (filter === "emergency") return row.emergency;
    if (filter === "clinic") return facility.includes("clinic");
    return facility.includes("hospital") || facility.includes("center");
  });
  return (
    <Screen
      title={t("findHospital")}
      list={{
        data: visible,
        keyExtractor: (row) => row.id,
        renderItem: ({ item }) => (
          <Card style={{ marginBottom: 12, padding: 16, gap: 12 }}>
            <View style={type.row}>
              <MapPin size={20} color={color.blue} />
              <Text style={[type.label, { flex: 1, fontSize: 16 }]}>
                {item.name}
              </Text>
            </View>
            <Text style={[type.small, { lineHeight: 19 }]}>{item.address}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <Tag>{item.facility_type ?? t("hospital")}</Tag>
              <Tag tone="muted">{t(item.ownership === "unknown" ? "private" : item.ownership)}</Tag>
              {item.emergency && <Tag tone="orange">{t("emergency")}</Tag>}
              {typeof item.open_now === "boolean" ? (
                <Tag tone={item.open_now ? "green" : "orange"}>
                  {t(item.open_now ? "openNow" : "closedNow")}
                </Tag>
              ) : null}
            </View>
            <View style={{ gap: 5 }}>
              <View style={type.row}>
                <Navigation size={16} color={color.blue} />
                <Text style={type.small}>
                  {item.distance_km !== null
                    ? `${item.distance_km < 0.1 ? "< 0.1" : item.distance_km.toFixed(1)} km${item.travel_minutes ? ` · ${item.travel_minutes} ${t("minDrive")}` : ""}`
                    : t("distanceUnavailable")}
                </Text>
              </View>
              <View style={type.row}>
                <Clock3 size={16} color={color.blue} />
                <Text style={type.small}>
                  {item.today_hours ? `${t("todaysHours")}: ${item.today_hours}` : t("hoursNotListed")}
                </Text>
              </View>
            </View>
            {item.business_status === "CLOSED_TEMPORARILY" && (
              <Notice warning>{t("temporarilyClosed")}</Notice>
            )}
            {typeof item.rating === "number" && (
              <View style={type.row}>
                <Star size={16} color={color.orange} fill={color.orange} />
                <Text style={type.small}>
                  {item.rating.toFixed(1)}
                  {item.rating_count ? ` (${item.rating_count})` : ""}
                </Text>
              </View>
            )}
            {hasHours(item) && (
              <>
                <Tap
                  label={
                    expandedHours === item.id ? t("hideHours") : t("viewHours")
                  }
                  onPress={() =>
                    setExpandedHours((current) =>
                      current === item.id ? undefined : item.id,
                    )
                  }
                  style={[type.row, { paddingVertical: 4 }]}
                >
                  <Clock3 size={17} color={color.blue} />
                  <Text style={[type.label, { color: color.blue }]}>
                    {expandedHours === item.id
                      ? t("hideHours")
                      : t("viewHours")}
                  </Text>
                </Tap>
                {expandedHours === item.id && (
                  <Text style={type.small}>
                    {Array.isArray(item.opening_hours)
                      ? item.opening_hours.join("\n")
                      : item.opening_hours}
                  </Text>
                )}
              </>
            )}
            <View style={{ flexDirection: "row", gap: 10 }}>
      <Button
                title={t("directions")}
                variant="soft"
                style={{ flex: 1, minHeight: 50, paddingVertical: 11 }}
                icon={<Navigation size={20} color={color.blue} />}
                onPress={() => {
                  void Linking.openURL(
                    item.directions_uri ??
                      `https://www.google.com/maps/dir/?api=1&destination=${item.lat},${item.lon}`,
                  );
                }}
              />
              <Button
                title={t("call")}
                variant="outline"
                style={{ flex: 1, minHeight: 50, paddingVertical: 11 }}
                disabled={!item.phone}
                icon={<Phone size={18} color={color.blue} />}
                onPress={() => {
                  if (item.phone)
                    void Linking.openURL(
                      `tel:${item.phone.replace(/[^+\d]/g, "")}`,
                    );
                }}
              />
            </View>
          </Card>
        ),
        empty:
          initializing || busy ? (
            <View
              style={{
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 44,
                gap: 12,
              }}
            >
              <ActivityIndicator size="large" color={color.blue} />
              <Text style={[type.heading, { fontSize: 18, color: color.ink }]}>
                {initializing
                  ? "Searching nearby medical centers…"
                  : t("findingLocation")}
              </Text>
              <Text
                style={[
                  type.small,
                  { textAlign: "center", color: color.muted, maxWidth: 300 },
                ]}
              >
                Finding nearest verified government hospitals, clinics, and emergency services…
              </Text>
            </View>
          ) : searched ? (
            <Empty title={t("noHospitals")} />
          ) : undefined,
      }}
    >
      <Field
        label={t("city")}
        hideLabel
        placeholder={t("city")}
        value={city}
        onChangeText={(value) => {
          setCity(value);
          setShowSuggestions(true);
          setSuggestError(false);
          setSuggesting(false);
        }}
        onSubmitEditing={() => find(false)}
      />
      {showSuggestions && city.trim().length >= 3 && (
        <View
          style={{
            backgroundColor: color.paper,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: color.border,
            padding: 12,
            gap: 4,
          }}
        >
          <Text style={type.label}>{t("suggestions")}</Text>
          {suggesting && <Text style={type.small}>…</Text>}
          {suggestError && (
            <Text style={type.small}>{t("suggestionsError")}</Text>
          )}
          {suggestedQuery === city.trim() &&
            !suggestError &&
            suggestions.map((place) => (
              <Tap
                key={place.id}
                label={`${place.name}, ${place.address}`}
                onPress={() => {
                  setCity(place.name);
                  void find(false, place);
                }}
                style={[
                  type.row,
                  {
                    paddingVertical: 8,
                    borderTopWidth: 1,
                    borderColor: color.border,
                  },
                ]}
              >
                <MapPin size={18} color={color.blue} />
                <View style={{ flex: 1 }}>
                  <Text style={type.label}>{place.name}</Text>
                  <Text style={type.small}>{place.address}</Text>
                  {place.distance_km !== undefined && (
                    <Text style={type.small}>
                      {place.distance_km.toFixed(1)} km
                    </Text>
                  )}
                </View>
              </Tap>
            ))}
          {suggestedQuery === city.trim() &&
            !suggesting &&
            !suggestError &&
            !suggestions.length && (
              <Text style={type.small}>{t("noSuggestions")}</Text>
            )}
          <Text style={type.small}>Powered by Google</Text>
        </View>
      )}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Button
          title={t("find")}
          variant="outline"
          busy={busy === "search"}
          disabled={city.trim().length < 2}
          style={{ flex: 1 }}
          onPress={() => find(false)}
        />
        <Button
          title={t("useLocation")}
          busy={busy === "location"}
          style={{ flex: 1 }}
          icon={<MapPin size={20} color={color.white} />}
          onPress={() => find(true)}
        />
      </View>
      {!!error && <Notice warning>{error}</Notice>}
      {(initializing || busy) && (
        <Card
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            padding: 14,
            backgroundColor: color.blueWash,
            borderColor: color.blue,
            borderWidth: 1,
            borderRadius: 16,
          }}
        >
          <ActivityIndicator size="small" color={color.blue} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[type.label, { color: color.blue, fontSize: 15 }]}>
              {busy === "location"
                ? "Acquiring your location…"
                : initializing
                  ? `${t("findingLocation")} Searching nearby hospitals…`
                  : `Searching hospitals in ${city || "selected area"}…`}
            </Text>
            <Text style={[type.small, { color: color.muted, fontSize: 12 }]}>
              {initializing
                ? "Automatically finding nearest verified medical centers & emergency care"
                : "Fetching verified healthcare facilities"}
            </Text>
          </View>
        </Card>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {(["all", "hospital", "clinic", "emergency"] as const).map((value) => (
          <Chip
            key={value}
            title={t(value)}
            selected={filter === value}
            onPress={() => setFilter(value)}
          />
        ))}
      </View>
      {searched && (
        <Text style={type.small}>
          {t("distanceNote")} {distanceFrom} · {source}
        </Text>
      )}
    </Screen>
  );
}
