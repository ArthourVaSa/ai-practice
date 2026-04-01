// @vitest-environment node
import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockCookieStore = {
  set: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
};

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
}));

import {
  createSession,
  getSession,
  deleteSession,
  verifySession,
} from "@/lib/auth";
import { SignJWT, jwtVerify } from "jose";
import { NextRequest } from "next/server";

const JWT_SECRET = new TextEncoder().encode("development-secret-key");

async function createTestToken(
  payload: Record<string, unknown>,
  options?: { expired?: boolean }
) {
  const builder = new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt();

  if (options?.expired) {
    builder.setExpirationTime(0);
  } else {
    builder.setExpirationTime("7d");
  }

  return builder.sign(JWT_SECRET);
}

describe("auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createSession", () => {
    test("creates a JWT and sets it as an httpOnly cookie", async () => {
      await createSession("user-123", "test@example.com");

      expect(mockCookieStore.set).toHaveBeenCalledTimes(1);
      const [cookieName, token, options] = mockCookieStore.set.mock.calls[0];

      expect(cookieName).toBe("auth-token");
      expect(typeof token).toBe("string");
      expect(options.httpOnly).toBe(true);
      expect(options.sameSite).toBe("lax");
      expect(options.path).toBe("/");
    });

    test("sets secure flag based on NODE_ENV", async () => {
      await createSession("user-123", "test@example.com");
      const options = mockCookieStore.set.mock.calls[0][2];
      expect(options.secure).toBe(false);
    });

    test("sets cookie expiration to 7 days from now", async () => {
      const before = Date.now();
      await createSession("user-123", "test@example.com");
      const after = Date.now();

      const options = mockCookieStore.set.mock.calls[0][2];
      const expiresTime = options.expires.getTime();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

      expect(expiresTime).toBeGreaterThanOrEqual(before + sevenDaysMs);
      expect(expiresTime).toBeLessThanOrEqual(after + sevenDaysMs);
    });

    test("creates a token that can be verified", async () => {
      await createSession("user-123", "test@example.com");
      const token = mockCookieStore.set.mock.calls[0][1];

      const { payload } = await jwtVerify(token, JWT_SECRET);
      expect(payload.userId).toBe("user-123");
      expect(payload.email).toBe("test@example.com");
    });
  });

  describe("getSession", () => {
    test("returns null when no cookie is set", async () => {
      mockCookieStore.get.mockReturnValue(undefined);
      const session = await getSession();
      expect(session).toBeNull();
    });

    test("returns session payload for a valid token", async () => {
      const token = await createTestToken({
        userId: "user-456",
        email: "user@example.com",
        expiresAt: new Date().toISOString(),
      });
      mockCookieStore.get.mockReturnValue({ value: token });

      const session = await getSession();
      expect(session).not.toBeNull();
      expect(session!.userId).toBe("user-456");
      expect(session!.email).toBe("user@example.com");
    });

    test("returns null for an invalid token", async () => {
      mockCookieStore.get.mockReturnValue({ value: "invalid-token" });
      const session = await getSession();
      expect(session).toBeNull();
    });

    test("returns null for an expired token", async () => {
      const token = await createTestToken(
        { userId: "user-789", email: "expired@example.com" },
        { expired: true }
      );
      // Wait briefly so the token is actually expired
      await new Promise((r) => setTimeout(r, 1100));

      mockCookieStore.get.mockReturnValue({ value: token });
      const session = await getSession();
      expect(session).toBeNull();
    });

    test("reads from the auth-token cookie", async () => {
      mockCookieStore.get.mockReturnValue(undefined);
      await getSession();
      expect(mockCookieStore.get).toHaveBeenCalledWith("auth-token");
    });
  });

  describe("deleteSession", () => {
    test("deletes the auth-token cookie", async () => {
      await deleteSession();
      expect(mockCookieStore.delete).toHaveBeenCalledWith("auth-token");
    });
  });

  describe("verifySession", () => {
    function createMockRequest(token?: string) {
      const cookieMap = new Map<string, { value: string }>();
      if (token) {
        cookieMap.set("auth-token", { value: token });
      }
      return {
        cookies: {
          get: (name: string) => cookieMap.get(name),
        },
      } as unknown as NextRequest;
    }

    test("returns null when no cookie is present", async () => {
      const request = createMockRequest();
      const session = await verifySession(request);
      expect(session).toBeNull();
    });

    test("returns session payload for a valid token", async () => {
      const token = await createTestToken({
        userId: "user-abc",
        email: "abc@example.com",
      });
      const request = createMockRequest(token);

      const session = await verifySession(request);
      expect(session).not.toBeNull();
      expect(session!.userId).toBe("user-abc");
      expect(session!.email).toBe("abc@example.com");
    });

    test("returns null for an invalid token", async () => {
      const request = createMockRequest("garbage-token");
      const session = await verifySession(request);
      expect(session).toBeNull();
    });

    test("returns null for a token signed with a different secret", async () => {
      const wrongSecret = new TextEncoder().encode("wrong-secret");
      const token = await new SignJWT({ userId: "hacker", email: "h@x.com" })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("7d")
        .setIssuedAt()
        .sign(wrongSecret);

      const request = createMockRequest(token);
      const session = await verifySession(request);
      expect(session).toBeNull();
    });
  });
});
