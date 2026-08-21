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

  it('should handle values with multiple equal signs', () => {
    const cookies = parseCookies('name=value=123');
    expect(cookies).toEqual({ name: 'value=123' });
  });

  it('should handle empty keys', () => {
    const cookies = parseCookies('=value; foo=bar');
    expect(cookies).toEqual({ '': 'value', foo: 'bar' });
  });

  it('should handle empty values', () => {
    const cookies = parseCookies('name=; foo=bar');
    expect(cookies).toEqual({ name: '', foo: 'bar' });
  });

  it('should handle consecutive semicolons and only semicolons', () => {
    const cookies = parseCookies('name=1;;foo=2;;;');
    expect(cookies).toEqual({ name: '1', foo: '2' });
  });

  it('should handle whitespace around keys and values', () => {
    const cookies = parseCookies('  name  =  value  ;  foo  =  bar  ');
    expect(cookies).toEqual({ name: 'value', foo: 'bar' });
  });
});
