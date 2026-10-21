import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import { getAuth, updateAuth } from "./store.server";

const COOKIE = "wa_session";

const hash = (password: string, salt: string) => scryptSync(password, salt, 64).toString("hex");

function startSession(token: string) {
  setCookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function authState() {
  const auth = await getAuth();
  const token = getCookie(COOKIE);
  return {
    hasPassword: !!auth.passwordHash,
    loggedIn: !!token && auth.sessions.includes(token),
  };
}

export async function requireAdmin() {
  const s = await authState();
  if (!s.loggedIn) throw new Error("Não autorizado");
}

export async function setupPassword(password: string) {
  const token = randomBytes(32).toString("hex");
  let ok = false;
  await updateAuth((a) => {
    if (a.passwordHash) return;
    a.salt = randomBytes(16).toString("hex");
    a.passwordHash = hash(password, a.salt);
    a.sessions = [token];
    ok = true;
  });
  if (!ok) throw new Error("A senha já foi criada");
  startSession(token);
}

export async function login(password: string) {
  const auth = await getAuth();
  if (!auth.passwordHash) throw new Error("Crie a senha primeiro");
  const a = Buffer.from(hash(password, auth.salt), "hex");
  const b = Buffer.from(auth.passwordHash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Senha incorreta");
  const token = randomBytes(32).toString("hex");
  await updateAuth((d) => {
    d.sessions = [...d.sessions.slice(-9), token];
  });
  startSession(token);
}

export async function logout() {
  const token = getCookie(COOKIE);
  if (token) await updateAuth((d) => void (d.sessions = d.sessions.filter((s) => s !== token)));
  deleteCookie(COOKIE, { path: "/" });
}

export async function changePassword(current: string, next: string) {
  const auth = await getAuth();
  const a = Buffer.from(hash(current, auth.salt), "hex");
  const b = Buffer.from(auth.passwordHash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Senha atual incorreta");
  const token = randomBytes(32).toString("hex");
  await updateAuth((d) => {
    d.salt = randomBytes(16).toString("hex");
    d.passwordHash = hash(next, d.salt);
    d.sessions = [token];
  });
  startSession(token);
}
