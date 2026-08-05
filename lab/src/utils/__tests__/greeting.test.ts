import { describe, expect, it } from 'vitest';
import { greeting } from '../greeting.js';

describe('greeting', () => {
  it('should return a greeting message', () => {
    const name = 'Tom';
    const expectedGreeting = `Hello, ${name}!`;
    expect(greeting(name)).toBe(expectedGreeting);
  });
});
