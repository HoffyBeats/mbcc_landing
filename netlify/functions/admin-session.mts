import {
  acceptInvite,
  getUser,
  login,
  logout,
  recoverPassword,
  requestPasswordRecovery,
} from "@netlify/identity";
import type { Config } from "@netlify/functions";

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export default async (request: Request) => {
  try {
    const pathname = new URL(request.url).pathname;

    if (pathname === "/api/admin/invite" && request.method === "POST") {
      const { token, password } = await request.json();
      if (typeof token !== "string" || typeof password !== "string" || password.length < 8) {
        return json({ error: "Adgangskoden skal være på mindst 8 tegn." }, 400);
      }

      const user = await acceptInvite(token, password.slice(0, 128));
      const authenticated = Boolean(user.roles?.includes("admin"));
      if (!authenticated) await logout();

      return json({ authenticated, accountReady: true });
    }

    if (pathname === "/api/admin/recovery" && request.method === "POST") {
      const payload = await request.json();

      if (typeof payload.token === "string") {
        if (typeof payload.password !== "string" || payload.password.length < 8) {
          return json({ error: "Adgangskoden skal være på mindst 8 tegn." }, 400);
        }

        const user = await recoverPassword(payload.token, payload.password.slice(0, 128));
        const authenticated = Boolean(user.roles?.includes("admin"));
        if (!authenticated) await logout();

        return json({ authenticated, accountReady: true });
      }

      if (typeof payload.email !== "string" || !payload.email.includes("@")) {
        return json({ error: "Indtast en gyldig e-mailadresse." }, 400);
      }

      try {
        await requestPasswordRecovery(payload.email.trim().slice(0, 254));
      } catch {}

      return json({ requested: true }, 202);
    }

    if (request.method === "GET") {
      const user = await getUser();
      return json({ authenticated: Boolean(user?.roles?.includes("admin")) });
    }

    if (request.method === "POST") {
      const { email, password } = await request.json();
      if (typeof email !== "string" || typeof password !== "string") {
        return json({ error: "Udfyld e-mail og adgangskode." }, 400);
      }

      const user = await login(email.trim(), password);
      if (!user.roles?.includes("admin")) {
        await logout();
        return json({ error: "Brugeren har ikke administratoradgang." }, 403);
      }

      return json({ authenticated: true });
    }

    if (request.method === "DELETE") {
      await logout();
      return new Response(null, { status: 204 });
    }

    return json({ error: "Metoden understøttes ikke." }, 405);
  } catch {
    const pathname = new URL(request.url).pathname;
    if (pathname === "/api/admin/invite") {
      return json({ error: "Invitationslinket er ugyldigt eller udløbet." }, 400);
    }
    if (pathname === "/api/admin/recovery") {
      return json({ error: "Nulstillingslinket er ugyldigt eller udløbet." }, 400);
    }
    return json({ error: "Login mislykkedes. Kontrollér dine oplysninger." }, 401);
  }
};

export const config: Config = {
  path: ["/api/admin/session", "/api/admin/invite", "/api/admin/recovery"],
};
