// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TwoFactorSettings } from './TwoFactorSettings';
import '@testing-library/jest-dom/vitest';

describe('TwoFactorSettings', () => {
  it('renders disabled state correctly', () => {
    render(<TwoFactorSettings initialEnabled={false} />);
    expect(screen.getByText('Enable 2FA')).toBeInTheDocument();
  });

  it('renders enabled state correctly', () => {
    render(<TwoFactorSettings initialEnabled={true} />);
    expect(screen.getByText('Disable 2FA')).toBeInTheDocument();
  });
});
