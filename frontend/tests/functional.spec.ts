import { Buffer } from "node:buffer";
import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";

const profileId = "00000000-0000-4000-8000-000000000001";
const teamId = "00000000-0000-4000-8000-000000000002";
const tournamentId = "00000000-0000-4000-8000-000000000003";
const importId = "00000000-0000-4000-8000-000000000004";
const timestamp = "2026-11-17T12:00:00Z";

type TestRole = "player" | "organizer";

async function signInAs(context: BrowserContext, role: TestRole) {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const accessToken = [
    encode({ alg: "HS256", typ: "JWT" }),
    encode({
      aud: "authenticated",
      exp: expiresAt,
      iat: expiresAt - 3600,
      iss: "http://127.0.0.1:54321/auth/v1",
      role: "authenticated",
      sub: profileId
    }),
    "playwright-test-signature"
  ].join(".");
  const session = {
    access_token: accessToken,
    expires_at: expiresAt,
    expires_in: 3600,
    refresh_token: "playwright.test.refresh-token",
    token_type: "bearer",
    user: {
      app_metadata: { provider: "email", providers: ["email"] },
      aud: "authenticated",
      email: "playwright@example.test",
      id: profileId,
      user_metadata: { desired_role: role, nickname: "qa-player" }
    }
  };
  const value = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;

  await context.addCookies([
    {
      domain: "127.0.0.1",
      httpOnly: false,
      name: "sb-127-auth-token",
      path: "/",
      sameSite: "Lax",
      secure: false,
      value
    }
  ]);
}

async function fulfill(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: "application/json",
    status
  });
}

async function mockApi(page: Page, responder: (route: Route, path: string) => Promise<void>) {
  await page.route("http://127.0.0.1:8080/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, "");
    await responder(route, path);
  });
}

function profile(role: TestRole) {
  return {
    bio: null,
    countryCode: null,
    displayName: "QA Player",
    id: profileId,
    nickname: "qa-player",
    role
  };
}

function teamAggregate(team: Record<string, unknown> | null) {
  const owner = team !== null;

  return {
    canCreateTeam: !owner,
    canDisbandTeam: owner,
    canInvitePlayers: owner,
    canLeaveTeam: false,
    canManageRoster: owner,
    canManageTeam: owner,
    canTransferOwnership: owner,
    canViewAnalytics: false,
    capacity: 5,
    currentUserTeamRole: owner ? "owner" : null,
    isFull: false,
    isTeamOwner: owner,
    manualPlayers: [],
    members: owner
      ? [
          {
            active: true,
            id: "00000000-0000-4000-8000-000000000005",
            nickname: "qa-player",
            profileId,
            role: "carry",
            teamId,
            teamOwner: true
          }
        ]
      : [],
    participantsCount: owner ? 1 : 0,
    slotsFilled: owner ? 1 : 0,
    slotsRemaining: owner ? 4 : 5,
    team,
    teamResolution: owner ? "Team found." : "No team found for the current profile."
  };
}

function tournament(status: "draft" | "published") {
  return {
    checkInClosesAt: null,
    checkInOpensAt: null,
    createdAt: timestamp,
    description: "Test tournament",
    endsAt: "2026-12-01T00:00:00Z",
    format: "single_elimination",
    id: tournamentId,
    maxTeams: 8,
    organizerNickname: "qa-organizer",
    organizerProfileId: profileId,
    prizePool: null,
    publicVisible: status === "published",
    publishedAt: status === "published" ? timestamp : null,
    registrationClosesAt: "2026-11-25T00:00:00Z",
    registrationOpensAt: timestamp,
    registrationsCount: 0,
    rules: "Test rules",
    settings: {
      allowSubstitutes: true,
      bestOf: 3,
      checkInEnabled: false,
      format: "single_elimination",
      maxTeams: 8,
      minTeams: 2,
      teamSize: 5
    },
    slug: "mid-wars-open",
    startsAt: "2026-11-30T00:00:00Z",
    status,
    teamsCount: 0,
    timezone: "UTC",
    title: "Mid Wars Open",
    updatedAt: timestamp
  };
}

test("FT-01: create a team and remain its owner after reload", async ({ context, page }) => {
  await signInAs(context, "player");
  let createdTeam: Record<string, unknown> | null = null;

  await mockApi(page, async (route, path) => {
    if (path === "/me/profile") {
      await fulfill(route, profile("player"));
    } else if (path === "/me/team") {
      await fulfill(route, teamAggregate(createdTeam));
    } else if (path === "/teams" && route.request().method() === "POST") {
      const requestBody = route.request().postDataJSON() as Record<string, unknown>;
      createdTeam = {
        bannerUrl: null,
        captainNickname: "qa-player",
        captainProfileId: profileId,
        description: requestBody.description,
        id: teamId,
        logoUrl: null,
        manualPlayers: [],
        name: requestBody.name,
        region: requestBody.region,
        slug: "ancient-stack",
        tag: requestBody.tag
      };
      expect(requestBody).toMatchObject({
        description: "Tier two squad",
        name: "Ancient Stack",
        region: "EU",
        slug: null,
        tag: "AS"
      });
      await fulfill(route, createdTeam);
    } else if (path === "/teams") {
      await fulfill(route, []);
    } else if (path === "/me/team-invitations" || path === "/me/team-join-requests") {
      await fulfill(route, []);
    } else if (
      path === `/teams/${teamId}/invitations` ||
      path === `/teams/${teamId}/join-requests` ||
      path === `/teams/${teamId}/tournament-registrations`
    ) {
      await fulfill(route, []);
    } else {
      await fulfill(route, { message: `Unhandled mock API request: ${path}` }, 404);
    }
  });

  await page.goto("/ekipe");
  await expect(page.getByRole("heading", { name: "You are not currently in a team" })).toBeVisible();
  await page.getByRole("button", { name: "Create Team" }).first().click();

  await page.getByLabel("Team name").fill("  Ancient Stack  ");
  await page.getByLabel("Team tag").fill(" AS ");
  await page.getByLabel("Region").fill("  EU  ");
  await page.getByLabel("Description").fill("  Tier two squad  ");
  await page.getByRole("button", { name: "Create Team" }).last().click();

  await expect(page.getByText("Team created successfully.")).toBeVisible();
  await expect(page.getByText("Ancient Stack")).toBeVisible();
  await page.getByRole("button", { name: "Roster", exact: true }).click();
  await expect(page.getByText("Team owner").first()).toBeVisible();

  await page.reload();
  await expect(page.getByText("Ancient Stack")).toBeVisible();
  await page.getByRole("button", { name: "Roster", exact: true }).click();
  await expect(page.getByText("Team owner").first()).toBeVisible();
});

test("FT-02: publish a draft tournament and retain the status after reload", async ({ context, page }) => {
  await signInAs(context, "organizer");
  let status: "draft" | "published" = "draft";

  await mockApi(page, async (route, path) => {
    if (path === "/me/profile") {
      await fulfill(route, profile("organizer"));
    } else if (path === "/organizer/tournaments") {
      await fulfill(route, [tournament(status)]);
    } else if (path === `/organizer/tournaments/${tournamentId}`) {
      await fulfill(route, tournament(status));
    } else if (path === `/organizer/tournaments/${tournamentId}/publish`) {
      status = "published";
      await fulfill(route, tournament(status));
    } else if (
      path === `/organizer/tournaments/${tournamentId}/registrations` ||
      path === `/organizer/tournaments/${tournamentId}/matches`
    ) {
      await fulfill(route, []);
    } else {
      await fulfill(route, { message: `Unhandled mock API request: ${path}` }, 404);
    }
  });

  await page.goto("/organizator");
  await expect(page.getByRole("heading", { name: "Organizer Tournament Dashboard" })).toBeVisible();
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Details" }).click();
  await expect(page.getByRole("heading", { name: "Quick Actions" })).toBeVisible();
  await page.getByRole("button", { name: "Publish", exact: true }).click();

  await expect(page.getByText("Tournament published successfully.")).toBeVisible();
  await expect(page.getByText("Published", { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("Published", { exact: true }).first()).toBeVisible();
});

test("FT-03: import a match and show the completed job and event history", async ({ context, page }) => {
  await signInAs(context, "organizer");

  await mockApi(page, async (route, path) => {
    if (path === "/me/profile") {
      await fulfill(route, profile("organizer"));
    } else if (path === "/organizer/tournaments") {
      await fulfill(route, [tournament("published")]);
    } else if (path === `/organizer/tournaments/${tournamentId}`) {
      await fulfill(route, tournament("published"));
    } else if (
      path === `/organizer/tournaments/${tournamentId}/registrations` ||
      path === `/organizer/tournaments/${tournamentId}/matches`
    ) {
      await fulfill(route, []);
    } else if (path === "/match-imports" && route.request().method() === "POST") {
      await fulfill(route, {
        completedAt: timestamp,
        createdAt: timestamp,
        dotaMatchId: "7894561230",
        errorCode: null,
        errorMessage: null,
        events: [],
        id: importId,
        matchGameId: null,
        matchId: null,
        startedAt: timestamp,
        status: "ready",
        updatedAt: timestamp
      });
    } else if (path === `/match-imports/${importId}/events`) {
      await fulfill(route, [
        { createdAt: timestamp, errorCode: null, eventType: "queued", id: "queued", message: "Queued" },
        { createdAt: timestamp, errorCode: null, eventType: "processing", id: "processing", message: "Processing" },
        { createdAt: timestamp, errorCode: null, eventType: "ready", id: "ready", message: "Ready" }
      ]);
    } else {
      await fulfill(route, { message: `Unhandled mock API request: ${path}` }, 404);
    }
  });

  await page.goto(`/organizator?tournamentId=${tournamentId}&slug=mid-wars-open&view=import`);
  const importPanel = page.locator(".import-panel");
  await expect(importPanel.getByRole("heading", { name: "Match Data Import" })).toBeVisible();
  await importPanel.getByLabel("Match ID").fill("7894561230");
  await importPanel.getByRole("button", { name: "Import", exact: true }).click();

  await expect(importPanel.getByText("Import job accepted by backend.")).toBeVisible();
  await expect(importPanel.getByText("Ready", { exact: true }).first()).toBeVisible();
  await expect(importPanel.getByText("7894561230", { exact: true })).toBeVisible();
  await expect(importPanel.getByText("Queued", { exact: true })).toBeVisible();
  await expect(importPanel.getByText("Processing", { exact: true })).toBeVisible();
});
