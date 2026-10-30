import { test, expect } from "@playwright/test";
import path from "node:path";

const screenshotsDir = path.resolve("../docs/screenshots");

test("generate README screenshots", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-26T07:00:00"));

  // Mock hospital routes for crisp nearby screenshot
  await page.route("**/health", (route) =>
    route.fulfill({ json: { google_places_configured: true } }),
  );
  await page.route("**/v1/ip-location", (route) =>
    route.fulfill({
      json: { lat: 28.6139, lon: 77.2090, city: "New Delhi", country: "IN" },
    }),
  );
  await page.route("**/v1/hospitals?*", (route) =>
    route.fulfill({
      json: {
        hospitals: [
          {
            id: "aiims-delhi",
            name: "AIIMS New Delhi (All India Institute of Medical Sciences)",
            lat: 28.5672,
            lon: 77.2100,
            distance_km: 1.2,
            address: "Sri Aurobindo Marg, Ansari Nagar, New Delhi",
            phone: "+91 11 2658 8500",
            ownership: "public",
            emergency: true,
            facility_type: "Government General Hospital",
            open_now: true,
            opening_hours: ["Open 24 hours"],
            rating: 4.8,
            rating_count: 2450,
          },
          {
            id: "safdarjung-hospital",
            name: "Safdarjung Hospital & Vardhman Mahavir Medical College",
            lat: 28.5701,
            lon: 77.2078,
            distance_km: 1.5,
            address: "Ring Road, opposite AIIMS, New Delhi",
            phone: "+91 11 2616 5060",
            ownership: "public",
            emergency: true,
            facility_type: "Central Government Hospital",
            open_now: true,
            opening_hours: ["Open 24 hours"],
            rating: 4.4,
            rating_count: 1280,
          },
        ],
        lat: 28.6139,
        lon: 77.2090,
        source: "Google Places",
      },
    }),
  );

  // 1. Onboarding & Scan screen
  await page.goto("/");
  await page.getByRole("button", { name: "Get started", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Let’s read your prescription" }),
  ).toBeVisible();
  await page.screenshot({ path: path.join(screenshotsDir, "01-scan-screen.png") });

  // 2. Demo Prescription Decode
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
  await expect(page.getByText("3 medicines found")).toBeVisible();
  await page.screenshot({ path: path.join(screenshotsDir, "02-decoded-medicines.png") });

  // 3. Clinical Details Drawer
  await page
    .getByRole("button", { name: "Medicine details: Cetirizine", exact: true })
    .click();
  await expect(page.getByText("High Confidence Extraction")).toBeVisible();
  await page.screenshot({ path: path.join(screenshotsDir, "03-clinical-details.png") });

  // 4. Add/Edit Reminder Sheet
  await page.getByRole("button", { name: "Set Medicine Reminder", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Add reminder" })).toBeVisible();
  await page.screenshot({ path: path.join(screenshotsDir, "04-reminder-schedule.png") });

  // 5. Save Reminder & Today Timeline
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Reminder saved" })).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "View my timeline", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your timeline", exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(screenshotsDir, "05-timeline-adherence.png") });

  // 6. Nearby Hospitals Screen
  await page.getByRole("button", { name: "Nearby", exact: true }).click();
  await expect(page.getByText("AIIMS New Delhi")).toBeVisible();
  await page.screenshot({ path: path.join(screenshotsDir, "06-nearby-hospitals.png") });
});

