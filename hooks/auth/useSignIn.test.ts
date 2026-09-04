// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSignIn } from './useSignIn';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';

vi.mock('next-auth/react', () => ({
  signIn: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  useSearchParams: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => `translated_${key}`,
}));

describe('useSignIn', () => {
  const mockPush = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as any).mockReturnValue({ push: mockPush });
    (useSearchParams as any).mockReturnValue({
      get: vi.fn().mockReturnValue(null),
    });
  });

  it('initializes with default values', () => {
    const { result } = renderHook(() => useSignIn());

    expect(result.current.email).toBe('');
    expect(result.current.password).toBe('');
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.callbackUrl).toBe('/');
  });

  it('handles custom callback url correctly', () => {
    (useSearchParams as any).mockReturnValue({
      get: vi.fn().mockReturnValue('/dashboard'),
    });
    const { result } = renderHook(() => useSignIn());
    expect(result.current.callbackUrl).toBe('/dashboard');
  });

  it('rejects invalid callback urls (absolute or protocol-relative)', () => {
    (useSearchParams as any).mockReturnValue({
      get: vi.fn().mockReturnValue('https://malicious.com'),
    });
    let { result } = renderHook(() => useSignIn());
    expect(result.current.callbackUrl).toBe('/');

    (useSearchParams as any).mockReturnValue({
      get: vi.fn().mockReturnValue('//malicious.com'),
    });
    result = renderHook(() => useSignIn()).result;
    expect(result.current.callbackUrl).toBe('/');

    (useSearchParams as any).mockReturnValue({
      get: vi.fn().mockReturnValue('/\\malicious.com'),
    });
    result = renderHook(() => useSignIn()).result;
    expect(result.current.callbackUrl).toBe('/');
  });

  it('updates email and password', () => {
    const { result } = renderHook(() => useSignIn());

    act(() => {
      result.current.setEmail('test@example.com');
      result.current.setPassword('password123');
    });

    expect(result.current.email).toBe('test@example.com');
    expect(result.current.password).toBe('password123');
  });

  it('handles successful sign in', async () => {
    (signIn as any).mockResolvedValue({ error: null });
    const { result } = renderHook(() => useSignIn());

    act(() => {
      result.current.setEmail('test@example.com');
      result.current.setPassword('password123');
    });

    const preventDefault = vi.fn();
    const event = { preventDefault } as any;

    await act(async () => {
      await result.current.handleSubmit(event);
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(signIn).toHaveBeenCalledWith('credentials', {
      email: 'test@example.com',
      password: 'password123',
      redirect: false,
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(mockPush).toHaveBeenCalledWith('/');
  });

  it('handles sign in failure', async () => {
    (signIn as any).mockResolvedValue({ error: 'Invalid credentials' });
    const { result } = renderHook(() => useSignIn());

    const preventDefault = vi.fn();
    const event = { preventDefault } as any;

    await act(async () => {
      await result.current.handleSubmit(event);
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('translated_auth.signIn.invalidCredentials');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('handles github sign in', async () => {
    const { result } = renderHook(() => useSignIn());

    await act(async () => {
      await result.current.handleGitHub();
    });

    expect(signIn).toHaveBeenCalledWith('github', { callbackUrl: '/' });
  });
});
