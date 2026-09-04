// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { useRegister } from "./useRegister.js";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { FormEvent } from "react";

vi.mock("next-auth/react", () => ({
  signIn: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
  useSearchParams: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: vi.fn(),
}));

describe("useRegister", () => {
  let mockRouterPush: ReturnType<typeof vi.fn>;
  let mockSearchParamsGet: ReturnType<typeof vi.fn>;
  let mockT: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockRouterPush = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push: mockRouterPush } as any);

    mockSearchParamsGet = vi.fn().mockReturnValue(null);
    vi.mocked(useSearchParams).mockReturnValue({ get: mockSearchParamsGet } as any);

    mockT = vi.fn().mockImplementation((k) => k);
    vi.mocked(useTranslations).mockReturnValue(mockT as any);

    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize with empty state", () => {
    const { result } = renderHook(() => useRegister());

    expect(result.current.name).toBe("");
    expect(result.current.email).toBe("");
    expect(result.current.password).toBe("");
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("should handle input changes", () => {
    const { result } = renderHook(() => useRegister());

    act(() => {
      result.current.setName("John");
      result.current.setEmail("john@example.com");
      result.current.setPassword("password123");
    });

    expect(result.current.name).toBe("John");
    expect(result.current.email).toBe("john@example.com");
    expect(result.current.password).toBe("password123");
  });

  describe("handleSubmit", () => {
    it("should handle successful registration and auto-signin", async () => {
      // Mock fetch success
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      // Mock signIn success
      vi.mocked(signIn).mockResolvedValue({ error: null } as any);

      const { result } = renderHook(() => useRegister());

      act(() => {
        result.current.setName("John");
        result.current.setEmail("john@example.com");
        result.current.setPassword("password123");
      });

      const e = { preventDefault: vi.fn() } as unknown as FormEvent;

      await act(async () => {
        await result.current.handleSubmit(e);
      });

      expect(e.preventDefault).toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalledWith("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "John", email: "john@example.com", password: "password123" }),
      });

      expect(signIn).toHaveBeenCalledWith("credentials", {
        email: "john@example.com",
        password: "password123",
        redirect: false,
      });

      expect(mockRouterPush).toHaveBeenCalledWith("/");
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it("should handle registration failure from API", async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Email already exists" }),
      });

      const { result } = renderHook(() => useRegister());

      const e = { preventDefault: vi.fn() } as unknown as FormEvent;

      await act(async () => {
        await result.current.handleSubmit(e);
      });

      expect(signIn).not.toHaveBeenCalled();
      expect(mockRouterPush).not.toHaveBeenCalled();
      expect(result.current.error).toBe("Email already exists");
      expect(result.current.loading).toBe(false);
    });

    it("should fallback to translation if registration fails without API error message", async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        json: async () => ({}),
      });

      const { result } = renderHook(() => useRegister());

      const e = { preventDefault: vi.fn() } as unknown as FormEvent;

      await act(async () => {
        await result.current.handleSubmit(e);
      });

      expect(result.current.error).toBe("auth.register.registrationFailed");
    });

    it("should handle auto-signin failure after successful registration", async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      vi.mocked(signIn).mockResolvedValue({ error: "Invalid credentials" } as any);

      const { result } = renderHook(() => useRegister());

      const e = { preventDefault: vi.fn() } as unknown as FormEvent;

      await act(async () => {
        await result.current.handleSubmit(e);
      });

      expect(result.current.error).toBe("auth.register.autoSignInFailed");
      expect(mockRouterPush).toHaveBeenCalledWith("/auth/signin");
    });

    it("should use validated callbackUrl", async () => {
      mockSearchParamsGet.mockReturnValue("/dashboard");

      (global.fetch as any).mockResolvedValue({ ok: true, json: async () => ({}) });
      vi.mocked(signIn).mockResolvedValue({ error: null } as any);

      const { result } = renderHook(() => useRegister());

      const e = { preventDefault: vi.fn() } as unknown as FormEvent;

      await act(async () => {
        await result.current.handleSubmit(e);
      });

      expect(mockRouterPush).toHaveBeenCalledWith("/dashboard");
    });

    it("should prevent open redirect in callbackUrl", async () => {
      mockSearchParamsGet.mockReturnValue("https://malicious.com");

      (global.fetch as any).mockResolvedValue({ ok: true, json: async () => ({}) });
      vi.mocked(signIn).mockResolvedValue({ error: null } as any);

      const { result } = renderHook(() => useRegister());

      const e = { preventDefault: vi.fn() } as unknown as FormEvent;

      await act(async () => {
        await result.current.handleSubmit(e);
      });

      expect(mockRouterPush).toHaveBeenCalledWith("/");
    });

    it("should prevent protocol relative open redirect", async () => {
      mockSearchParamsGet.mockReturnValue("//malicious.com");

      (global.fetch as any).mockResolvedValue({ ok: true, json: async () => ({}) });
      vi.mocked(signIn).mockResolvedValue({ error: null } as any);

      const { result } = renderHook(() => useRegister());

      const e = { preventDefault: vi.fn() } as unknown as FormEvent;

      await act(async () => {
        await result.current.handleSubmit(e);
      });

      expect(mockRouterPush).toHaveBeenCalledWith("/");
    });

    it("should prevent protocol relative open redirect with backslash", async () => {
      mockSearchParamsGet.mockReturnValue("/\\\\malicious.com");

      (global.fetch as any).mockResolvedValue({ ok: true, json: async () => ({}) });
      vi.mocked(signIn).mockResolvedValue({ error: null } as any);

      const { result } = renderHook(() => useRegister());

      const e = { preventDefault: vi.fn() } as unknown as FormEvent;

      await act(async () => {
        await result.current.handleSubmit(e);
      });

      expect(mockRouterPush).toHaveBeenCalledWith("/");
    });
  });

  describe("handleGitHub", () => {
    it("should sign in with github using validated callback url", async () => {
      mockSearchParamsGet.mockReturnValue("/settings");

      const { result } = renderHook(() => useRegister());

      await act(async () => {
        await result.current.handleGitHub();
      });

      expect(signIn).toHaveBeenCalledWith("github", { callbackUrl: "/settings" });
    });
  });
});
