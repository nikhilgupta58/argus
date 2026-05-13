import { describe, expect, it } from 'vitest';
import type { Event } from '../index.js';

describe('Event', () => {
  it('placeholder test', () => {
    const event: Event = { id: '1', contractId: 'c1', timestamp: Date.now() };
    expect(typeof event.id).toBe('string');
  });
});
