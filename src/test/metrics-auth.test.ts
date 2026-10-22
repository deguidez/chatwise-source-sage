import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ username: "admin", role: "super", session: true }));
vi.mock("@tanstack/react-start/server", () => ({ getCookie: () => state.session ? "test" : undefined, setCookie: vi.fn(), deleteCookie: vi.fn(), getRequestHeader: vi.fn() }));
vi.mock("@/lib/store.server", () => ({ getDbConfig: async () => ({ driver: "file" }), getAuth: async () => ({ users: [{ username: state.username, role: state.role }], sessions: [{ token: "test", username: state.username, expires: Date.now() + 60000 }] }), updateAuth: vi.fn() }));
import { requireSuper } from "@/lib/auth.server";
beforeEach(() => { state.username = "admin"; state.role = "super"; state.session = true; });
it("super admin pode acessar a autorização dos relatórios", async () => { await expect(requireSuper()).resolves.toBe("admin"); });
it("atendente não pode acessar a autorização dos relatórios", async () => { state.username = "staff"; state.role = "attendant"; await expect(requireSuper()).rejects.toThrow("super administrador"); });
it("visitante sem sessão não pode acessar os relatórios", async () => { state.session = false; await expect(requireSuper()).rejects.toThrow("Não autorizado"); });