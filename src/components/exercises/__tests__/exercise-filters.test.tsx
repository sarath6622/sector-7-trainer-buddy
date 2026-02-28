import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ExerciseFilters, DEFAULT_FILTERS } from '../exercise-filters';
import type { ExerciseFiltersState } from '../exercise-filters';

// Use fake timers to test the 300ms search debounce
import { afterEach, beforeEach } from 'vitest';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ExerciseFilters', () => {
  it('renders search input and all filter dropdowns', () => {
    render(<ExerciseFilters filters={DEFAULT_FILTERS} onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText('Search exercises...')).toBeInTheDocument();
    expect(screen.getByText('All Muscles')).toBeInTheDocument();
    expect(screen.getByText('All Categories')).toBeInTheDocument();
    expect(screen.getByText('All Equipment')).toBeInTheDocument();
    expect(screen.getByText('All Levels')).toBeInTheDocument();
  });

  it('does NOT show the Clear button when all filters are empty', () => {
    render(<ExerciseFilters filters={DEFAULT_FILTERS} onChange={vi.fn()} />);
    expect(screen.queryByText('Clear')).toBeNull();
  });

  it('shows the Clear button when search is active', () => {
    const filters: ExerciseFiltersState = { ...DEFAULT_FILTERS, search: 'squat' };
    render(<ExerciseFilters filters={filters} onChange={vi.fn()} />);
    expect(screen.getByText('Clear')).toBeInTheDocument();
  });

  it('shows the Clear button when a dropdown filter is active', () => {
    const filters: ExerciseFiltersState = { ...DEFAULT_FILTERS, category: 'STRENGTH' };
    render(<ExerciseFilters filters={filters} onChange={vi.fn()} />);
    expect(screen.getByText('Clear')).toBeInTheDocument();
  });

  it('calls onChange with reset filters when Clear is clicked', () => {
    const onChange = vi.fn();
    const filters: ExerciseFiltersState = { ...DEFAULT_FILTERS, search: 'squat' };
    render(<ExerciseFilters filters={filters} onChange={onChange} />);
    fireEvent.click(screen.getByText('Clear'));
    expect(onChange).toHaveBeenCalledWith(DEFAULT_FILTERS);
  });

  it('debounces search input and calls onChange after 300ms', async () => {
    const onChange = vi.fn();
    render(<ExerciseFilters filters={DEFAULT_FILTERS} onChange={onChange} />);

    fireEvent.change(screen.getByPlaceholderText('Search exercises...'), {
      target: { value: 'bench' },
    });

    // onChange should NOT have been called immediately
    expect(onChange).not.toHaveBeenCalled();

    // Advance timers past the 300ms debounce window and flush React state updates
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ search: 'bench' }));
  });

  it('does not call onChange during rapid typing (debounce in effect)', () => {
    const onChange = vi.fn();
    render(<ExerciseFilters filters={DEFAULT_FILTERS} onChange={onChange} />);
    const input = screen.getByPlaceholderText('Search exercises...');

    fireEvent.change(input, { target: { value: 'b' } });
    vi.advanceTimersByTime(100);
    fireEvent.change(input, { target: { value: 'be' } });
    vi.advanceTimersByTime(100);
    fireEvent.change(input, { target: { value: 'ben' } });
    vi.advanceTimersByTime(100);

    // Still within the debounce window — no call yet
    expect(onChange).not.toHaveBeenCalled();
  });
});
