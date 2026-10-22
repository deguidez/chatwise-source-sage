import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getCookie, setCookie, deleteCookie, getRequestHeader } from "@tanstack/react-start/server";
import { getAuth, getDbConfig, updateAuth } from "./store.server";

const COOKIE = "wa_session";
const SESSION_DAYS = 7;
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

const hash = (password: string, salt: string) => scryptSync(password, salt, 64).toString("hex");

function matches(password: string, salt: string, expected: string) {
  const a = Buffer.from(hash(password, salt), "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function clientIp() {
  return (getRequestHeader("x-forwarded-for") ?? "").split(",")[0]?.trim() || "local";
}

function isHttps() {
  if (process.env["COOKIE_SECURE"] === "true") return true;
  const proto = (getRequestHeader("x-forwarded-proto") ?? "").split(",")[0]?.trim();
  const origin = getRequestHeader("origin") ?? getRequestHeader("referer") ?? "";
  return proto === "https" || origin.startsWith("https://");
}

function startSession(token: string) {
  const https = isHttps();
  // Over HTTPS use SameSite=None so login also works inside embedded previews (iframes).
  setCookie(COOKIE, token, {
    httpOnly: true,
    sameSite: https ? "none" : "lax",
    secure: https,
    partitioned: https,
    path: "/",
    maxAge: 60 * 60 * 24 * SESSION_DAYS,
  });
}

export async function authState() {
  const cfg = await getDbConfig();
  if (!cfg) return { installed: false, loggedIn: false, username: "" };
  const auth = await getAuth();
  const token = getCookie(COOKIE);
  const s = token ? auth.sessions.find((x) => x.token === token && x.expires > Date.now()) : undefined;
  return { installed: true, loggedIn: !!s, username: s?.username ?? "" };
}

export async function requireAdmin() {
  const s = await authState();
  if (!s.loggedIn) throw new Error("Não autorizado");
  return s.username;
}

export async function login(username: string, password: string) {
  const user = username.trim().toLowerCase();
  const key = `${clientIp()}|${user}`;
  const auth = await getAuth();
  const att = auth.attempts[key];
  if (att && att.count >= MAX_ATTEMPTS && att.until > Date.now()) {
    const min = Math.ceil((att.until - Date.now()) / 60000);
    throw new Error(`Muitas tentativas. Tente novamente em ${min} min.`);
  }
  const found = auth.users.find((u) => u.username === user);
  const ok = !!found && matches(password, found.salt, found.hash);
  const token = randomBytes(32).toString("hex");
  await updateAuth((d) => {
    const now = Date.now();
    d.sessions = d.sessions.filter((s) => s.expires > now);
    for (const [k, v] of Object.entries(d.attempts)) if (v.until < now) delete d.attempts[k];
    if (ok) {
      delete d.attempts[key];
      d.sessions.push({ token, username: user, expires: now + SESSION_DAYS * 86400000 });
    } else {
      const cur = d.attempts[key] ?? { count: 0, until: 0 };
      d.attempts[key] = { count: cur.count + 1, until: now + LOCK_MINUTES * 60000 };
    }
  });
  if (!ok) throw new Error("Usuário ou senha incorretos");
  startSession(token);
}

export async function logout() {
  const token = getCookie(COOKIE);
  if (token) await updateAuth((d) => void (d.sessions = d.sessions.filter((s) => s.token !== token)));
  deleteCookie(COOKIE, { path: "/" });
}

export async function changePassword(current: string, next: string) {
  const username = await requireAdmin();
  const auth = await getAuth();
  const u = auth.users.find((x) => x.username === username);
  if (!u || !matches(current, u.salt, u.hash)) throw new Error("Senha atual incorreta");
  const token = randomBytes(32).toString("hex");
  await updateAuth((d) => {
    const user = d.users.find((x) => x.username === username)!;
    user.salt = randomBytes(16).toString("hex");
    user.hash = hash(next, user.salt);
    d.sessions = [{ token, username, expires: Date.now() + SESSION_DAYS * 86400000 }];
  });
  startSession(token);
}
