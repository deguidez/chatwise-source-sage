import { describe, expect, it } from "vitest";
import { userRole } from "@/lib/auth.server";

describe("userRole", () => {
  it("admin é sempre super admin, mesmo sem role salvo", () => {
    expect(userRole({ username: "admin" })).toBe("super");
  });

  it("respeita o role salvo como super", () => {
    expect(userRole({ username: "maria", role: "super" })).toBe("super");
  });

  it("usuário comum sem role é atendente", () => {
    expect(userRole({ username: "maria" })).toBe("attendant");
    expect(userRole({ username: "maria", role: "attendant" })).toBe("attendant");
  });
});
