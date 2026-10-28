import { test, expect } from "@playwright/test";
import fs from "node:fs";
// Run explicitly with an ephemeral, confirmed test account; never sends signup email.
const fixturePath = process.env.MEDIAPP_AUTH_FIXTURE;
test.use({ trace: "off", screenshot: "off", video: "off" });
test("live Supabase sign-in, backup, reload, sign-out isolation, restore", async ({
  page,
}) => {
  test.skip(!fixturePath, "Requires an ephemeral Supabase test account");
  test.setTimeout(90000);
  const fixture = JSON.parse(fs.readFileSync(fixturePath!, "utf8"));
  const login = async () => {
    await page
      .getByRole("textbox", { name: "Email", exact: true })
      .fill(fixture.email);
    await page
      .getByRole("textbox", { name: "Password", exact: true })
      .fill(fixture.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByText("Backup up to date", { exact: true }),
    ).toBeVisible({ timeout: 30000 });
  };
  await page.goto("/");
  await page.getByRole("button", { name: "Get started", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await login();
  await page.goto("/medicines");
  await page.getByRole("button", { name: "Add medicine", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Medicine name", exact: true })
    .fill("Development fixture only");
  await page
    .getByRole("textbox", { name: "Strength", exact: true })
    .fill("Test");
  await page.getByRole("textbox", { name: "Dose", exact: true }).fill("Test");
  await page
    .getByRole("button", {
      name: "I checked this with my prescription",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Medicine details: Development fixture only",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Back up now", exact: true }).click();
  await expect(
    page.getByText("Backup up to date", { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reset app data", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reset this device", exact: true })
    .click();
  await page.getByRole("button", { name: "Get started", exact: true }).click();
  await page
    .getByRole("button", { name: "Medicines", exact: true })
    .last()
    .click();
  await expect(page).toHaveURL(/\/medicines$/);
  await expect(
    page.getByRole("button", {
      name: "Medicine details: Development fixture only",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await login();
  await page.goto("/medicines");
  await expect(
    page.getByRole("button", {
      name: "Medicine details: Development fixture only",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
});
