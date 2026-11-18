import { expect, test, type Locator, type Page } from "@playwright/test";

async function openBracket(page: Page) {
  await expect(page.getByRole("heading", { name: "DotaOps Demo Cup", exact: true })).toBeVisible();
  await expect(page.getByText("Live", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Bracket & Advancement" }).click();
}

async function checkMatch(
  match: Locator,
  code: string,
  teams: [string, string],
  format: string,
  score: string,
  status: string,
  advancement: string,
) {
  for (const value of [code, format, score, status, advancement]) {
    await expect(match.getByText(value, { exact: true })).toBeVisible();
  }
  await expect(match.locator(".tournament-bracket-slot strong")).toHaveText(teams);
}

async function checkPublicBracket(page: Page) {
  const summary = page.locator(".tournament-bracket-summary-card");
  for (const [label, value] of [
    ["Bracket Type", "Single Elimination"],
    ["Bracket Size", "4"],
    ["Rounds", "2"],
    ["Finished Matches", "2"],
  ]) {
    const card = summary.filter({ has: page.getByText(label, { exact: true }) });
    await expect(card.locator("strong")).toHaveText(value);
  }

  const rounds = page.locator(".tournament-bracket-round");
  await expect(rounds.locator("h3")).toHaveText(["Semifinals", "Final"]);
  const semifinals = rounds.nth(0).locator(".tournament-bracket-match");
  const final = rounds.nth(1).locator(".tournament-bracket-match");
  await expect(semifinals).toHaveCount(2);
  await expect(final).toHaveCount(1);
  await checkMatch(semifinals.nth(0), "R1-M1", ["Radiant Wolves", "Roshan Hunters"], "BO3", "2:0", "Finished", "Radiant Wolves advanced");
  await checkMatch(semifinals.nth(1), "R1-M2", ["Ancient Titans", "Dire Ravens"], "BO3", "2:1", "Finished", "Ancient Titans advanced");
  await checkMatch(final, "R2-M1", ["Radiant Wolves", "Ancient Titans"], "BO5", "0:0", "Scheduled", "Awaiting result");
}

test("FT-03: anonymous visitor sees the playoff bracket and advancing teams after refresh", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) &&
        /\/(tournaments|matches|brackets)(\/|$)/.test(new URL(request.url()).pathname)) {
      writes.push(request.method() + " " + request.url());
    }
  });

  await page.goto("/turnirji/dotaops-demo-cup");
  await openBracket(page);
  await checkPublicBracket(page);
  await page.reload();
  await openBracket(page);
  await checkPublicBracket(page);
  expect(writes).toEqual([]);
});
