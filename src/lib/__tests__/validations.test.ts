import { describe, it, expect } from 'vitest';
import { loginSchema, registerSchema } from '../validations';

describe('loginSchema', () => {
  it('accepts valid credentials', () => {
    const result = loginSchema.safeParse({ email: 'user@example.com', password: 'secret123' });
    expect(result.success).toBe(true);
  });

  it('rejects malformed email', () => {
    const result = loginSchema.safeParse({ email: 'not-an-email', password: 'secret123' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toContain('email');
  });

  it('rejects password shorter than 6 characters', () => {
    const result = loginSchema.safeParse({ email: 'user@example.com', password: '12345' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toContain('password');
  });

  it('rejects missing fields', () => {
    const result = loginSchema.safeParse({});
    expect(result.success).toBe(false);
    // Both fields should be required
    expect(result.error?.issues.length).toBeGreaterThanOrEqual(2);
  });
});

describe('registerSchema', () => {
  const validPayload = {
    name: 'Jane Doe',
    email: 'jane@example.com',
    password: 'strongpass1',
    confirmPassword: 'strongpass1',
  };

  it('accepts valid registration data', () => {
    const result = registerSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('rejects name shorter than 2 characters', () => {
    const result = registerSchema.safeParse({ ...validPayload, name: 'J' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toContain('name');
  });

  it('rejects password shorter than 8 characters', () => {
    const result = registerSchema.safeParse({
      ...validPayload,
      password: 'short',
      confirmPassword: 'short',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toContain('password');
  });

  it('rejects mismatched passwords', () => {
    const result = registerSchema.safeParse({
      ...validPayload,
      password: 'password123',
      confirmPassword: 'different456',
    });
    expect(result.success).toBe(false);
    // The refine error lands on confirmPassword
    expect(result.error?.issues[0].path).toContain('confirmPassword');
  });

  it('rejects invalid email in registration', () => {
    const result = registerSchema.safeParse({ ...validPayload, email: 'bad@' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toContain('email');
  });
});
