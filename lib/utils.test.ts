import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('cn (class name utility)', () => {
  it('returns a single class name unchanged', () => {
    expect(cn('foo')).toBe('foo');
  });

  it('merges multiple class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('handles conditional classes (truthy)', () => {
    expect(cn('base', true && 'active')).toBe('base active');
  });

  it('handles conditional classes (falsy)', () => {
    expect(cn('base', false && 'active')).toBe('base');
  });

  it('deduplicates Tailwind classes (last wins)', () => {
    // twMerge deduplicates by category; p-4 wins over p-2
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });

  it('handles undefined/null/empty inputs', () => {
    expect(cn(undefined, null as never, '', 'visible')).toBe('visible');
  });

  it('handles object syntax from clsx', () => {
    expect(cn({ active: true, hidden: false })).toBe('active');
  });

  it('handles array syntax', () => {
    expect(cn(['a', 'b'])).toBe('a b');
  });
});
