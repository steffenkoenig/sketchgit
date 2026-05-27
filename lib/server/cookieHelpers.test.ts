import { describe, it, expect } from 'vitest';
import { parseCookies } from './cookieHelpers';

describe('parseCookies', () => {
  it('should parse basic cookies', () => {
    const cookies = parseCookies('name=value; foo=bar');
    expect(cookies).toEqual({ name: 'value', foo: 'bar' });
  });

  it('should handle undefined cookie header', () => {
    const cookies = parseCookies(undefined);
    expect(cookies).toEqual({});
  });

  it('should handle empty cookie header', () => {
    const cookies = parseCookies('');
    expect(cookies).toEqual({});
  });

  it('should ignore parts without equals sign', () => {
    const cookies = parseCookies('name=value; invalidpart; foo=bar');
    expect(cookies).toEqual({ name: 'value', foo: 'bar' });
  });

  it('should decode URI encoded values', () => {
    const cookies = parseCookies('name=hello%20world');
    expect(cookies).toEqual({ name: 'hello world' });
  });

  it('should fallback to raw value if decodeURIComponent throws (error path)', () => {
    // decodeURIComponent throws on malformed URI components like %FF
    const cookies = parseCookies('name=%FF; foo=bar');
    expect(cookies).toEqual({ name: '%FF', foo: 'bar' });
  });
});
