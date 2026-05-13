import { describe, expect, it } from 'vitest';
import { ARGUS_VERSION } from '../index.js';

describe('ARGUS_VERSION', () => {
  it('should be a string', () => {
    expect(typeof ARGUS_VERSION).toBe('string');
  });

  it('should be a valid semver-like version', () => {
    expect(ARGUS_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
