import { test, expect } from "@playwright/test";
import path from "node:path";

async function onboard(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Get started", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Let’s read your prescription" }),
  ).toBeVisible();
}
async function demo(page) {
  await onboard(page);
  await page
    .getByRole("button", { name: "Try with a demo prescription", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Check your photo" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Demo decode", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your prescription, decoded" }),
  ).toBeVisible();
}
test("demo → detailed cards → reminder → timeline → taken/undo → reload", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-26T07:00:00"));
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await demo(page);
  await expect(page.getByText("3 medicines found")).toBeVisible();
  await expect(page.getByText("3 days", { exact: true })).toBeVisible();
  await expect(page.getByText("Twice daily", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Medicine details: Paracetamol", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Paracetamol", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).last().click();
  await page
    .getByRole("button", { name: "Add reminder", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("textbox", { name: "Dose", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Time 1", exact: true })
    .fill("11:00");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByText(
      "Keep each reminder within 2 hours of its original time, on the same day.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Time 1", exact: true })
    .fill("08:15");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Reminder saved" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByRole("button", { name: "View my timeline", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your timeline", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Today", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /08:15 Paracetamol/ }).click();
  await page.getByRole("button", { name: "Mark taken", exact: true }).click();
  await expect(page.getByText("1/2 taken", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("1/2 taken", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /08:15 Paracetamol/ }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByText("0/2 taken", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /08:15 Paracetamol/ }).click();
  await page.getByRole("button", { name: "10 min", exact: true }).click();
  await page.getByRole("button", { name: /08:25 Paracetamol/ }).click();
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Cancel snooze", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /08:15 Paracetamol/ }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/home.png" });
  expect(errors).toEqual([]);
});

test("uploaded image preview → demo is explicitly separate; Scan resets", async ({
  page,
}) => {
  await onboard(page);
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Choose from gallery", exact: true })
    .click();
  await (
    await chooser
  ).setFiles(
    path.resolve("tests/fixtures/public-prescriptions/prescription_00006.png"),
  );
  await expect(
    page.getByRole("heading", { name: "Check your photo" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Read prescription", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Demo decode", exact: true }).click();
  await expect(
    page.getByText(
      "Sample data, not read from your photo. Sample reminders won’t notify you.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "View my timeline", exact: true })
    .click();
  await page.getByRole("button", { name: "Scan", exact: true }).last().click();
  await expect(
    page.getByRole("button", { name: "Choose from gallery", exact: true }),
  ).toBeVisible();
});

test("uploaded prescription decodes through the separate backend", async ({
  page,
}) => {
  await onboard(page);
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Choose from gallery", exact: true })
    .click();
  await (
    await chooser
  ).setFiles(
    path.resolve("tests/fixtures/public-prescriptions/prescription_00006.png"),
  );
  const response = page.waitForResponse((result) =>
    result.url().includes(":8102/v1/decode"),
  );
  await page.getByRole("button", { name: "Read prescription", exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "Your prescription, decoded" }),
  ).toBeVisible();
  await expect(page.getByText("1 medicines found")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Medicine details: Prednisone" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add reminder", exact: true }).click();
  await expect(page.getByText("Dose", { exact: true }).last()).toBeVisible();
  await expect(page.getByText("Frequency", { exact: true }).last()).toBeVisible();
  await expect(page.getByText("Check", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Close", exact: true }).last().click();
  await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
});

test("small phone, reduced motion, localization, settings and all tabs", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await demo(page);
  await page.screenshot({ path: "test-results/decoded.png" });
  await page
    .getByRole("button", { name: "View my timeline", exact: true })
    .click();
  for (const [name, url] of [
    ["Medicines", "/medicines"],
    ["Reminders", "/reminders"],
    ["Nearby", "/hospitals"],
    ["Today", "/"],
  ]) {
    await page.getByRole("button", { name, exact: true }).last().click();
    await expect(page).toHaveURL(new RegExp(url === "/" ? "/$" : `${url}$`));
    await expect(
      page.getByRole("button", { name: "Settings", exact: true }),
    ).toBeVisible();
  }
  await page
    .getByRole("button", { name: "Settings", exact: true })
    .filter({ visible: true })
    .click();
  await page.getByRole("button", { name: "हिन्दी", exact: true }).click();
  await expect(page.getByRole("heading", { name: "सेटिंग्स" })).toBeVisible();
  await page.getByRole("button", { name: "தமிழ்", exact: true }).click();
  await expect(page.getByRole("heading", { name: "அமைப்புகள்" })).toBeVisible();
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.setViewportSize({ width: 844, height: 390 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("read-only prescription, anchored time window and development reset", async ({
  page,
}) => {
  await demo(page);
  await expect(
    page.getByRole("button", { name: /^Edit$|^Edit Paracetamol$/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Add medicine", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Add reminder", exact: true })
    .first()
    .click();
  await page
    .getByRole("textbox", { name: "Time 1", exact: true })
    .fill("10:00");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit reminder", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Time 1", exact: true })
    .fill("11:00");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByText(
      "Keep each reminder within 2 hours of its original time, on the same day.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).last().click();
  await page
    .getByRole("button", { name: "View my timeline", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Settings", exact: true })
    .filter({ visible: true })
    .click();
  await page
    .getByRole("button", { name: "Reset app data", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Switch prescription: Sample prescription",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reset app data", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reset this device", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Get started", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Get started", exact: true }),
  ).toBeVisible();
});

test("settings opens the medicine history page", async ({ page }) => {
  await onboard(page);
  await page.goto("/settings");
  await page
    .getByRole("button", { name: "Medicine history", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Medicine history", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("No medicines marked as taken yet", { exact: true }),
  ).toBeVisible();
});

test("hospital suggestions respond while typing and select coordinates", async ({
  page,
}) => {
  await page.route("**/health", (route) =>
    route.fulfill({ json: { google_places_configured: true } }),
  );
  await page.route("**/v1/ip-location", (route) =>
    route.fulfill({
      json: { lat: 28.6, lon: 77.2, city: "Delhi", country: "IN" },
    }),
  );
  await page.route("**/v1/hospital-suggestions?*", (route) =>
    route.fulfill({
      json: {
        suggestions: [
          {
            id: "test",
            name: "Delhi",
            address: "India",
            lat: 28.6,
            lon: 77.2,
            distance_km: 1.4,
          },
        ],
      },
    }),
  );
  await page.route("**/v1/hospitals?*", (route) =>
    route.fulfill({
      json: {
        hospitals: [
          {
            id: "hospital",
            name: "Test Hospital",
            lat: 28.6,
            lon: 77.2,
            distance_km: 0.2,
            address: "Delhi",
            phone: "+91 11 5555 0101",
            ownership: "public",
            emergency: true,
            facility_type: "General hospital",
            open_now: true,
            opening_hours: [
              "Monday: Open 24 hours",
              "Tuesday: 8:00 AM–8:00 PM",
            ],
            rating: 4.4,
            rating_count: 87,
          },
        ],
        lat: 28.6,
        lon: 77.2,
        source: "Google Places",
      },
    }),
  );
  await onboard(page);
  await page.getByRole("button", { name: "Nearby", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "City or area", exact: true })).toHaveValue("Delhi");
  await expect(page.getByText("Test Hospital", { exact: true })).toBeVisible();
  await page
    .getByRole("textbox", { name: "City or area", exact: true })
    .fill("Del");
  await page.getByRole("button", { name: "Delhi, India", exact: true }).click();
  await expect(page.getByText("Test Hospital", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Government", { exact: true }).last(),
  ).toBeVisible();
  await expect(page.getByText("Open now", { exact: true })).toBeVisible();
  await expect(
    page.getByText("General hospital", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Type not listed", { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "View hours", exact: true }).click();
  await expect(page.getByText(/Monday: Open 24 hours/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Directions", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Call", exact: true }),
  ).toBeEnabled();
  expect(page.url()).toContain("/hospitals");
});

test("nearby search explains when Google Places is missing", async ({ page }) => {
  await page.route("**/v1/ip-location", (route) =>
    route.fulfill({ json: { lat: 11.0168, lon: 76.9558, city: "Coimbatore", country: "IN" } }),
  );
  await page.route("**/health", (route) =>
    route.fulfill({ json: { google_places_configured: false } }),
  );
  let hospitalSearchRequested = false;
  await page.route("**/v1/hospitals?*", (route) => {
    hospitalSearchRequested = true;
    return route.fulfill({ json: { hospitals: [] } });
  });
  await onboard(page);
  await page.getByRole("button", { name: "Nearby", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "City or area", exact: true })).toHaveValue("Coimbatore");
  await expect(page.getByText(/Add the Google Places key to mediscan\/backend\/\.env/)).toBeVisible();
  expect(hospitalSearchRequested).toBe(false);
});

test("use my location requests GPS only after tap and searches that position", async ({ page }) => {
  await page.route("**/health", (route) =>
    route.fulfill({ json: { google_places_configured: true } }),
  );
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation({ latitude: 11.0168, longitude: 76.9558 });
  await page.route("**/v1/ip-location", (route) =>
    route.fulfill({ json: { lat: 28.6, lon: 77.2, city: "Delhi", country: "IN" } }),
  );
  await page.route("**/v1/hospitals?*", async (route) => {
    const query = new URL(route.request().url()).searchParams;
    const gpsRequest = query.get("lat") === "11.0168" && query.get("lon") === "76.9558";
    await route.fulfill({
      json: {
        hospitals: gpsRequest ? [{
          id: "coimbatore-hospital", name: "Coimbatore Hospital", lat: 11.0168,
          lon: 76.9558, distance_km: 0.4, address: "Coimbatore", ownership: "private",
          emergency: false, facility_type: "Hospital",
        }] : [],
        lat: Number(query.get("lat")), lon: Number(query.get("lon")), source: "Google Places",
      },
    });
  });
  await onboard(page);
  await page.getByRole("button", { name: "Nearby", exact: true }).click();
  await page.getByRole("button", { name: "Use my location", exact: true }).click();
  await expect(page.getByText("Coimbatore Hospital", { exact: true })).toBeVisible();
});

test("medicine details fetch live sources and expand without editing", async ({
  page,
}) => {
  test.setTimeout(60000);
  await demo(page);
  await page
    .getByRole("button", { name: "Medicine details: Cetirizine", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Common side effects", exact: true }),
  ).toBeVisible({ timeout: 45000 });
  await expect(page.getByText("Loading medicine information…")).toHaveCount(0);
  await expect(
    page.getByText("NHS · general side effects (UK guidance) ↗", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Common side effects", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Common side effects", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("button", { name: "Edit", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Common side effects", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Cetirizine", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/details.png" });
});
