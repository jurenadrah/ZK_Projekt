import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type BrowserContext, type Page, type Route } from "@playwright/test";

// FT-02 — Prijava ekipe, odobritev in check-in
// (docs/funkcionalni-pregled-in-testni-scenariji.md, poglavje 4).
// Kapetan in organizator delata v dveh ločenih brskalniških sejah. Zaščiteni API je
// nadomeščen z deljenim stanjem v testu, zato lahko preverimo, da organizator vidi
// točno prijavo, ki jo je kapetan oddal, in da kapetan vidi organizatorjevo odločitev.

const tournament = JSON.parse(
  readFileSync(path.join(__dirname, "fixtures", "registration-tournament.json"), "utf8")
) as Record<string, unknown> & { id: string; slug: string; title: string };

const profileId = "00000000-0000-4000-8000-000000000001";
const teamId = "00000000-0000-4000-8000-0000000000a1";
const registrationId = "00000000-0000-4000-8000-0000000000b1";
const contactEmail = "captain@qa-ft02.test";
const teamName = "QA-FT02 Squad";
const rosterNicknames = ["qa-captain", "qa-mid", "qa-offlane", "qa-support", "qa-hardsupport"];

type Role = "player" | "organizer";
type Registration = Record<string, unknown> & { status: string; checkedInAt: string | null };

function accessToken() {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return {
    exp,
    token: [
      encode({ alg: "HS256", typ: "JWT" }),
      encode({ aud: "authenticated", exp, iat: exp - 3600, iss: "http://127.0.0.1:54321/auth/v1", role: "authenticated", sub: profileId }),
      "playwright-test-signature"
    ].join(".")
  };
}

async function newSession(browser: Browser, role: Role) {
  const context = await browser.newContext();
  const { exp, token } = accessToken();
  const session = {
    access_token: token,
    expires_at: exp,
    expires_in: 3600,
    refresh_token: "playwright.test.refresh-token",
    token_type: "bearer",
    user: {
      app_metadata: { provider: "email", providers: ["email"] },
      aud: "authenticated",
      email: "playwright@example.test",
      id: profileId,
      user_metadata: { desired_role: role, nickname: `qa-${role}` }
    }
  };
  await context.addCookies([{
    domain: "127.0.0.1",
    httpOnly: false,
    name: "sb-127-auth-token",
    path: "/",
    sameSite: "Lax",
    secure: false,
    value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`
  }]);
  return context;
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ body: JSON.stringify(body), contentType: "application/json", status });
}

function profile(role: Role) {
  return { bio: null, countryCode: null, displayName: `QA ${role}`, id: profileId, nickname: `qa-${role}`, role };
}

function captainTeam() {
  const team = {
    captainNickname: "qa-captain",
    captainProfileId: profileId,
    description: null,
    id: teamId,
    manualPlayers: [],
    name: teamName,
    region: "EU",
    slug: "qa-ft02-squad",
    tag: "QA2"
  };
  return {
    canCreateTeam: false,
    canDisbandTeam: true,
    canInvitePlayers: false,
    canLeaveTeam: false,
    canManageRoster: true,
    canManageTeam: true,
    canTransferOwnership: true,
    canViewAnalytics: false,
    capacity: 5,
    currentUserTeamRole: "owner",
    isFull: true,
    isTeamOwner: true,
    manualPlayers: [],
    members: rosterNicknames.map((nickname, index) => ({
      active: true,
      id: `00000000-0000-4000-8000-0000000000c${index}`,
      nickname,
      profileId: index === 0 ? profileId : `00000000-0000-4000-8000-0000000000d${index}`,
      role: "core",
      teamId,
      teamOwner: index === 0
    })),
    participantsCount: 5,
    slotsFilled: 5,
    slotsRemaining: 0,
    team,
    teamResolution: "Team found."
  };
}

function organizerTournament(registrationsCount: number) {
  return {
    ...tournament,
    createdAt: "2026-11-01T00:00:00Z",
    organizerProfileId: profileId,
    publishedAt: "2026-11-01T00:00:00Z",
    registrationsCount,
    settings: { allowSubstitutes: true, bestOf: 3, checkInEnabled: true, format: "single_elimination", maxTeams: 8, minTeams: 2, teamSize: 5 },
    updatedAt: "2026-11-01T00:00:00Z"
  };
}

/** Deljeno stanje "backenda" za obe seji. */
class RegistrationBackend {
  registration: Registration | null = null;
  readonly writes: string[] = [];

  async attach(context: BrowserContext, role: Role) {
    await context.route("http://127.0.0.1:18080/api/**", async (route) => {
      const request = route.request();
      const method = request.method();
      const path = new URL(request.url()).pathname.replace(/^\/api/, "");
      if (method !== "GET") this.writes.push(`${role} ${method} ${path}`);
      if (!(await this.handle(route, role, method, path))) await route.continue();
    });
  }

  private async handle(route: Route, role: Role, method: string, path: string) {
    const list = this.registration ? [this.registration] : [];
    const regPath = `/tournaments/${tournament.id}/registrations`;
    const orgPath = `/organizer/tournaments/${tournament.id}`;

    if (path === "/me/profile") return json(route, profile(role)).then(() => true);

    if (role === "player") {
      if (path === "/me/team") return json(route, captainTeam()).then(() => true);
      if (method === "GET" && [
        "/teams", "/me/team-invitations", "/me/team-join-requests",
        `/teams/${teamId}/manual-players`, `/teams/${teamId}/invitations`, `/teams/${teamId}/join-requests`
      ].includes(path)) return json(route, []).then(() => true);
      if (path === `/teams/${teamId}/tournament-registrations`) return json(route, list).then(() => true);

      if (method === "POST" && path === regPath) {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        if (this.registration) return json(route, { message: "This team is already registered." }, 409).then(() => true);
        this.registration = {
          captainNickname: "qa-captain",
          captainProfileId: profileId,
          checkedInAt: null,
          contactEmail: body.contactEmail,
          createdAt: new Date().toISOString(),
          id: registrationId,
          members: rosterNicknames.map((nickname, index) => ({ id: `m${index}`, nickname, starter: true })),
          message: body.message,
          reviewedAt: null,
          status: "pending",
          teamId: body.teamId,
          teamName,
          teamSlug: "qa-ft02-squad",
          teamTag: "QA2",
          tournamentId: tournament.id,
          tournamentSlug: tournament.slug,
          tournamentTitle: tournament.title
        };
        return json(route, this.registration, 201).then(() => true);
      }

      if (method === "POST" && path === `${regPath}/${registrationId}/check-in`) {
        // Poslovno pravilo backenda: check-in je dovoljen samo za odobreno prijavo.
        if (this.registration?.status !== "approved") {
          return json(route, { message: "Only approved registrations can check in." }, 409).then(() => true);
        }
        this.registration.checkedInAt = new Date().toISOString();
        return json(route, this.registration).then(() => true);
      }
    }

    if (role === "organizer") {
      if (path === "/organizer/tournaments") return json(route, [organizerTournament(list.length)]).then(() => true);
      if (path === orgPath) return json(route, organizerTournament(list.length)).then(() => true);
      if (path === `${orgPath}/registrations`) return json(route, list).then(() => true);
      if (path === `${orgPath}/matches`) return json(route, []).then(() => true);
      if (method === "POST" && path === `${orgPath}/registrations/${registrationId}/approve` && this.registration) {
        this.registration.status = "approved";
        this.registration.reviewedAt = new Date().toISOString();
        this.registration.reviewedByNickname = "qa-organizer";
        return json(route, this.registration).then(() => true);
      }
    }

    return false;
  }
}

async function openSubmission(page: Page) {
  await page.goto(`/turnirji/${tournament.slug}`);
  await expect(page.getByRole("heading", { level: 1, name: tournament.title })).toBeVisible();
  await page.getByRole("button", { name: "Team Submission", exact: true }).click();
}

test("FT-02: kapetan prijavi ekipo, organizator jo odobri, kapetan opravi check-in", async ({ browser }) => {
  const backend = new RegistrationBackend();
  const captainContext = await newSession(browser, "player");
  const organizerContext = await newSession(browser, "organizer");
  await backend.attach(captainContext, "player");
  await backend.attach(organizerContext, "organizer");
  const captain = await captainContext.newPage();
  const organizer = await organizerContext.newPage();

  await test.step("1. Kapetan odpre turnir; aplikacija prepozna ekipo in kapetansko pravico", async () => {
    await openSubmission(captain);
    await expect(captain.getByRole("heading", { name: "Team Submission" })).toBeVisible();
    await expect(captain.getByText("Captain permission confirmed.")).toBeVisible();
    await expect(captain.getByText("Roster matches required team size (5/5).")).toBeVisible();
    await expect(captain.getByText("Tournament backend id is available.")).toBeVisible();
  });

  await test.step("2. Kapetan odda prijavo; status je pending, check-in je onemogočen", async () => {
    await captain.getByLabel("Captain Contact Email").fill(contactEmail);
    await captain.getByLabel("Registration Message").fill("QA-FT02 registration");
    await captain.getByRole("button", { name: "Submit Registration" }).click();

    await expect(captain.getByText("Registration submitted. Status is pending organizer review.")).toBeVisible();
    await expect(captain.locator(".tournament-registration-status-orb")).toHaveText("Pending");
    // Negativni kontrolni primer: check-in ni dovoljen, dokler je prijava pending.
    await expect(captain.getByRole("button", { name: "Check In" })).toBeDisabled();
    expect(backend.registration).toMatchObject({ contactEmail, status: "pending", teamId });
  });

  const card = organizer.locator(".org-tournament-registration-card").filter({ hasText: teamName });

  await test.step("3. Organizator v ločeni seji vidi oddano prijavo", async () => {
    await organizer.goto(`/organizator?tournamentId=${tournament.id}&slug=${tournament.slug}&view=registrations`);
    await expect(organizer.getByRole("heading", { name: "Team Submissions" })).toBeVisible();
    await expect(card).toHaveCount(1);
    await expect(card.locator(".org-tournament-status")).toHaveText("Pending");
    await expect(card).toContainText("Captain: qa-captain");
  });

  await test.step("4. Organizator odobri prijavo; stanje ostane po osvežitvi", async () => {
    await card.getByRole("button", { name: "Approve" }).click();
    await expect(organizer.getByText("Registration approved.")).toBeVisible();
    await expect(card.locator(".org-tournament-status")).toHaveText("Approved");
    await organizer.reload();
    await expect(card.locator(".org-tournament-status")).toHaveText("Approved");
    await expect(card.getByRole("button", { name: "Approve" })).toBeDisabled();
  });

  await test.step("5. Kapetan ponovno odpre turnir in vidi odobreno prijavo", async () => {
    await openSubmission(captain);
    await expect(captain.locator(".tournament-registration-status-orb")).toHaveText("Approved");
    await expect(captain.getByRole("button", { name: "Check In" })).toBeEnabled();
  });

  await test.step("6. Kapetan opravi check-in; stanje ostane po osvežitvi", async () => {
    await captain.getByRole("button", { name: "Check In" }).click();
    await expect(captain.getByText("Team checked in successfully.")).toBeVisible();
    await expect(captain.locator(".tournament-registration-status-orb")).toHaveText("Checked In");
    await openSubmission(captain);
    await expect(captain.locator(".tournament-registration-status-orb")).toHaveText("Checked In");
    await expect(captain.getByRole("button", { name: "Checked In" })).toBeDisabled();
  });

  expect(backend.registration?.checkedInAt).toBeTruthy();
  expect(backend.writes).toEqual([
    `player POST /tournaments/${tournament.id}/registrations`,
    `organizer POST /organizer/tournaments/${tournament.id}/registrations/${registrationId}/approve`,
    `player POST /tournaments/${tournament.id}/registrations/${registrationId}/check-in`
  ]);

  await captainContext.close();
  await organizerContext.close();
});
