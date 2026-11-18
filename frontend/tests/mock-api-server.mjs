import { readFileSync } from "node:fs";
import http from "node:http";

function fixture(name) {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));
}

const catalog = fixture("catalog");
const demo = catalog[0];
const registrationTournament = fixture("registration-tournament");
const publicRoutes = new Map([
  ["/tournaments", catalog],
  [`/tournaments/${demo.slug}`, demo],
  ...["groups", "matches", "standings", "bracket"].map((view) => [
    `/public/tournaments/${demo.id}/${view}`,
    fixture(view)
  ]),
  // FT-02: turnir odprt za prijave; javni pogledi so prazni (bracket še ne obstaja).
  [`/tournaments/${registrationTournament.slug}`, registrationTournament],
  ...["groups", "matches", "standings"].map((view) => [
    `/public/tournaments/${registrationTournament.id}/${view}`,
    []
  ])
]);

const server = http.createServer((request, response) => {
  const { pathname } = new URL(request.url, "http://127.0.0.1");
  response.setHeader("content-type", "application/json");
  response.setHeader("access-control-allow-origin", "http://127.0.0.1:3100");
  response.setHeader("access-control-allow-methods", "GET, POST, PATCH, DELETE, OPTIONS");
  response.setHeader("access-control-allow-headers", "authorization, content-type");

  if (request.method === "OPTIONS") {
    response.writeHead(204).end();
    return;
  }
  if (pathname === "/health") {
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }

  const path = pathname.replace(/^\/api(?=\/)/, "");
  if (request.method === "GET" && publicRoutes.has(path)) {
    response.end(JSON.stringify(publicRoutes.get(path)));
    return;
  }
  // Zaščitene poti (prijava, odobritev, check-in) prestreže test sam prek context.route().
  response.writeHead(404).end(JSON.stringify({ message: `Unknown test route: ${path}` }));
});

server.listen(18080, "127.0.0.1");
