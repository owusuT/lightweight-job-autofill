import { describe, it, expect } from 'vitest';
import { generateStrongPassword } from './password';

describe('generateStrongPassword', () => {
  it('generates a 16-character password', () => {
    const password = generateStrongPassword();
    expect(password).toHaveLength(16);
  });

  it('contains at least one uppercase letter', () => {
    const password = generateStrongPassword();
    expect(/[A-Z]/.test(password)).toBe(true);
  });

  it('contains at least one lowercase letter', () => {
    const password = generateStrongPassword();
    expect(/[a-z]/.test(password)).toBe(true);
  });

  it('contains at least one digit', () => {
    const password = generateStrongPassword();
    expect(/[0-9]/.test(password)).toBe(true);
  });

  it('contains at least one special character', () => {
    const password = generateStrongPassword();
    expect(/[!@#$%^&*_+\-=]/.test(password)).toBe(true);
  });

  it('generates different passwords on successive calls', () => {
    const passwords = new Set();
    for (let i = 0; i < 100; i++) {
      passwords.add(generateStrongPassword());
    }
    expect(passwords.size).toBeGreaterThan(90);
  });
});
