// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CookieNotice } from './CookieNotice';
import React from 'react';

// Mock next-intl useTranslations
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      message: 'Cookie Notice Message',
      dismiss: 'Dismiss',
    };
    return translations[key] || key;
  },
}));

describe('CookieNotice', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders correctly when not dismissed', () => {
    render(<CookieNotice />);
    expect(screen.getByText('Cookie Notice Message')).toBeTruthy();
  });

  it('does not render if already dismissed', () => {
    localStorage.setItem('sketchgit_cookie_notice_dismissed', '1');
    render(<CookieNotice />);
    expect(screen.queryByText('Cookie Notice Message')).toBeFalsy();
  });

  it('hides when dismissed is clicked and sets localStorage', () => {
    render(<CookieNotice />);
    const dismissButton = screen.getByText('Dismiss');
    fireEvent.click(dismissButton);
    expect(screen.queryByText('Cookie Notice Message')).toBeFalsy();
    expect(localStorage.getItem('sketchgit_cookie_notice_dismissed')).toBe('1');
  });

  it('handles localStorage QuotaExceededError when setting item', () => {
    // Mock setItem to throw QuotaExceededError
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    render(<CookieNotice />);
    const dismissButton = screen.getByText('Dismiss');

    // Should not crash
    expect(() => fireEvent.click(dismissButton)).not.toThrow();

    // Should still hide visually
    expect(screen.queryByText('Cookie Notice Message')).toBeFalsy();

    setItemSpy.mockRestore();
  });

  it('handles localStorage throw when getting item on mount', () => {
    // Mock getItem to throw error (like in some strict private modes)
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Access denied');
    });

    render(<CookieNotice />);

    // If it errors reading on mount, it just doesn't show it as a fallback.
    expect(screen.queryByText('Cookie Notice Message')).toBeFalsy();

    getItemSpy.mockRestore();
  });
});
