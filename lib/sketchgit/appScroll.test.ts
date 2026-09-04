// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { tlScrollLeft, tlScrollRight } from './appScroll.js';

describe('appScroll', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('tlScrollLeft decreases scrollLeft by 200 when element exists', () => {
    const el = document.createElement('div');
    el.id = 'tlscroll';
    el.scrollLeft = 500;
    document.body.appendChild(el);

    tlScrollLeft();

    expect(el.scrollLeft).toBe(300);
  });

  it('tlScrollRight increases scrollLeft by 200 when element exists', () => {
    const el = document.createElement('div');
    el.id = 'tlscroll';
    el.scrollLeft = 500;
    document.body.appendChild(el);

    tlScrollRight();

    expect(el.scrollLeft).toBe(700);
  });

  it('tlScrollLeft does not throw when element does not exist', () => {
    expect(() => tlScrollLeft()).not.toThrow();
  });

  it('tlScrollRight does not throw when element does not exist', () => {
    expect(() => tlScrollRight()).not.toThrow();
  });
});
