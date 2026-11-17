import http from "node:http";

const user = {
  app_metadata: { provider: "email", providers: ["email"] },
  aud: "authenticated",
  created_at: "2026-01-01T00:00:00.000Z",
  email: "playwright@example.test",
  id: "00000000-0000-4000-8000-000000000001",
  role: "authenticated",
  user_metadata: { desired_role: "player", nickname: "qa-player" }
};

const server = http.createServer((request, response) => {
  const path = new URL(request.url, "http://127.0.0.1").pathname;
  response.setHeader("content-type", "application/json");
  response.setHeader("access-control-allow-origin", "http://127.0.0.1:3100");
  response.setHeader("access-control-allow-headers", "apikey, authorization, content-type, x-client-info");
  response.setHeader("access-control-allow-methods", "GET, OPTIONS");

  if (request.method === "OPTIONS") {
    response.writeHead(204).end();
    return;
  }

  if (path === "/health") {
    response.writeHead(200).end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (path === "/auth/v1/user") {
    response.writeHead(200).end(JSON.stringify(user));
    return;
  }

  response.writeHead(404).end(JSON.stringify({ message: "Not found" }));
});

server.listen(54321, "127.0.0.1");

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
