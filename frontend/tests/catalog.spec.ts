import { expect, test } from "@playwright/test";

test("FT-01: obiskovalec odpre turnir iz kataloga in pregleda njegove podatke", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/turnirji");
  const card = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "DotaOps Demo Cup", exact: true }),
  });
  await expect(card.getByText("Live", { exact: true })).toBeVisible();
  await card.getByRole("link", { name: "Open Tournament" }).click();

  const title = page.getByRole("heading", { level: 1, name: "DotaOps Demo Cup" });
  await expect(page).toHaveURL(/\/turnirji\/dotaops-demo-cup\/?$/);
  await expect(title).toBeVisible();
  await expect(page.getByText(
    "End-to-end DotaOps demo tournament with registrations, groups, bracket, match games and analytics.",
    { exact: true },
  )).toBeVisible();

  await page.getByRole("button", { name: "Groups & Standings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Demo Group A", exact: true }).first()).toBeVisible();
  const leader = page.getByRole("row").filter({ hasText: "Radiant Wolves" });
  await expect(leader.getByRole("cell", { name: "#1", exact: true })).toBeVisible();
  await expect(leader.getByRole("cell", { name: "6", exact: true })).toBeVisible();
  for (const team of ["Ancient Titans", "Dire Ravens", "Roshan Hunters"]) {
    await expect(page.getByRole("row").filter({ hasText: team })).toBeVisible();
  }

  await page.getByRole("button", { name: "Schedule & Results", exact: true }).click();
  const result = page.locator(".schedule-results-match")
    .filter({ hasText: "Group Round 1" })
    .filter({ hasText: "Radiant Wolves" })
    .filter({ hasText: "Dire Ravens" });
  await expect(result).toContainText("Finished");
  await expect(result.locator(".schedule-results-score strong")).toHaveText("2:1");

  await page.getByRole("button", { name: "Bracket & Advancement", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Semifinals", exact: true })).toBeVisible();
  const final = page.locator(".tournament-bracket-round").filter({
    has: page.getByRole("heading", { name: "Final", exact: true }),
  });
  await expect(final).toContainText("Radiant Wolves");
  await expect(final).toContainText("Ancient Titans");

  await page.reload();
  await expect(title).toBeVisible();
  expect(errors).toEqual([]);
});
