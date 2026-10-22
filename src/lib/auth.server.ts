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

// The original "admin" account is always super admin, even in old data without a role.
export function userRole(u: { username: string; role?: string }): "super" | "attendant" {
  return u.role === "super" || u.username === "admin" ? "super" : "attendant";
}

export async function authState() {
  const cfg = await getDbConfig();
  if (!cfg) return { installed: false, loggedIn: false, username: "", role: "attendant" as const };
  const auth = await getAuth();
  const token = getCookie(COOKIE);
  const s = token ? auth.sessions.find((x) => x.token === token && x.expires > Date.now()) : undefined;
  const user = s ? auth.users.find((u) => u.username === s.username) : undefined;
  return {
    installed: true,
    loggedIn: !!s && !!user,
    username: s?.username ?? "",
    role: user ? userRole(user) : ("attendant" as const),
  };
}

export async function requireAdmin() {
  const s = await authState();
  if (!s.loggedIn) throw new Error("Não autorizado");
  return s.username;
}

export async function requireSuper() {
  const s = await authState();
  if (!s.loggedIn) throw new Error("Não autorizado");
  if (s.role !== "super") throw new Error("Apenas o super administrador pode fazer isso");
  return s.username;
}

// ---------- User management (super admin only) ----------

export async function listUsers() {
  await requireSuper();
  const auth = await getAuth();
  return auth.users.map((u) => ({ username: u.username, role: userRole(u) }));
}

const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;

export async function createUser(username: string, password: string, role: "super" | "attendant") {
  await requireSuper();
  const user = username.trim().toLowerCase();
  if (!USERNAME_RE.test(user)) throw new Error("Usuário inválido: use 3 a 30 letras, números, ponto, traço ou underline");
  if (password.length < 8) throw new Error("A senha precisa de pelo menos 8 caracteres");
  const auth = await getAuth();
  if (auth.users.some((u) => u.username === user)) throw new Error("Já existe um usuário com esse nome");
  const salt = randomBytes(16).toString("hex");
  await updateAuth((d) => {
    d.users.push({ username: user, salt, hash: hash(password, salt), role });
  });
}

export async function deleteUser(username: string) {
  const me = await requireSuper();
  const user = username.trim().toLowerCase();
  if (user === me) throw new Error("Você não pode excluir o seu próprio usuário");
  if (user === "admin") throw new Error("O usuário admin não pode ser excluído");
  await updateAuth((d) => {
    d.users = d.users.filter((u) => u.username !== user);
    d.sessions = d.sessions.filter((s) => s.username !== user);
  });
}

export async function resetUserPassword(username: string, password: string) {
  await requireSuper();
  const user = username.trim().toLowerCase();
  if (password.length < 8) throw new Error("A senha precisa de pelo menos 8 caracteres");
  const auth = await getAuth();
  if (!auth.users.some((u) => u.username === user)) throw new Error("Usuário não encontrado");
  const salt = randomBytes(16).toString("hex");
  await updateAuth((d) => {
    const u = d.users.find((x) => x.username === user)!;
    u.salt = salt;
    u.hash = hash(password, salt);
    d.sessions = d.sessions.filter((s) => s.username !== user);
  });
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
  const https = isHttps();
  deleteCookie(COOKIE, { path: "/", sameSite: https ? "none" : "lax", secure: https, partitioned: https });
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
