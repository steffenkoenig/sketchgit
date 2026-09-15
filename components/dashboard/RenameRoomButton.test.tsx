// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RenameRoomButton } from './RenameRoomButton';
import React from 'react';

describe('RenameRoomButton', () => {
  const mockReload = vi.fn();
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { reload: mockReload },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockReload.mockClear();
    cleanup();
  });

  it('renders nothing if not owner', () => {
    const { container } = render(
      <RenameRoomButton roomId="room-1" currentSlug="old-slug" isOwner={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders edit button if owner', () => {
    render(<RenameRoomButton roomId="room-1" currentSlug="old-slug" isOwner={true} />);
    expect(screen.getByRole('button', { name: /rename room old-slug/i })).toBeTruthy();
  });

  it('enters editing mode and can be canceled', () => {
    render(<RenameRoomButton roomId="room-1" currentSlug="old-slug" isOwner={true} />);
    fireEvent.click(screen.getByRole('button', { name: /rename room old-slug/i }));

    expect(screen.getByPlaceholderText('e.g. my-project')).toBeTruthy();
    expect(screen.getByRole('button', { name: /save/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByPlaceholderText('e.g. my-project')).toBeFalsy();
  });

  it('submits successfully and reloads', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'success' }),
    });

    render(<RenameRoomButton roomId="room-1" currentSlug="old-slug" isOwner={true} />);
    fireEvent.click(screen.getByRole('button', { name: /rename room old-slug/i }));

    const input = screen.getByPlaceholderText('e.g. my-project');
    fireEvent.change(input, { target: { value: 'new-slug' } });

    fireEvent.click(screen.getByRole('button', { name: /^save/i }));

    expect(mockFetch).toHaveBeenCalledWith('/api/rooms/room-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'new-slug' }),
    });

    await waitFor(() => {
      expect(mockReload).toHaveBeenCalled();
    });
  });

  it('displays error on failed submission', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'Slug already taken' }),
    });

    render(<RenameRoomButton roomId="room-1" currentSlug="old-slug" isOwner={true} />);
    fireEvent.click(screen.getByRole('button', { name: /rename room old-slug/i }));

    const input = screen.getByPlaceholderText('e.g. my-project');
    fireEvent.change(input, { target: { value: 'new-slug' } });

    fireEvent.click(screen.getByRole('button', { name: /^save/i }));

    await waitFor(() => {
      expect(screen.getByText('Slug already taken')).toBeTruthy();
    });
    expect(mockReload).not.toHaveBeenCalled();
  });

  it('displays default error on failed submission with no message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    });

    render(<RenameRoomButton roomId="room-1" currentSlug="old-slug" isOwner={true} />);
    fireEvent.click(screen.getByRole('button', { name: /rename room old-slug/i }));

    const input = screen.getByPlaceholderText('e.g. my-project');
    fireEvent.change(input, { target: { value: 'new-slug' } });

    fireEvent.click(screen.getByRole('button', { name: /^save/i }));

    await waitFor(() => {
      expect(screen.getByText('Failed to save slug.')).toBeTruthy();
    });
    expect(mockReload).not.toHaveBeenCalled();
  });
});
