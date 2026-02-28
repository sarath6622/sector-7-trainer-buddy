import { describe, it, expect } from 'vitest';
import { cn } from '../utils';

describe('cn()', () => {
  it('returns a single class unchanged', () => {
    expect(cn('text-red-500')).toBe('text-red-500');
  });

  it('merges multiple classes', () => {
    expect(cn('px-4', 'py-2')).toBe('px-4 py-2');
  });

  it('deduplicates conflicting Tailwind classes — last one wins', () => {
    // tailwind-merge resolves conflicts: px-2 should be dropped in favour of px-4
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('handles conditional classes via clsx object syntax', () => {
    const isActive = true;
    const isDisabled = false;
    const result = cn('base', { 'text-blue-500': isActive, 'opacity-50': isDisabled });
    expect(result).toContain('text-blue-500');
    expect(result).not.toContain('opacity-50');
  });

  it('filters out falsy values', () => {
    expect(cn('base', undefined, null, false, '')).toBe('base');
  });

  it('handles arrays of classes', () => {
    expect(cn(['px-4', 'py-2'], 'font-bold')).toBe('px-4 py-2 font-bold');
  });

  it('returns empty string when no classes provided', () => {
    expect(cn()).toBe('');
  });
});
