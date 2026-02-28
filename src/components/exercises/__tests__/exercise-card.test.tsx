import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExerciseCard } from '../exercise-card';
import type { ExerciseCardData } from '../exercise-card';

const baseExercise: ExerciseCardData = {
  id: 'ex-1',
  name: 'Bench Press',
  primaryMuscle: 'CHEST',
  secondaryMuscles: ['TRICEPS'],
  category: 'STRENGTH',
  difficulty: 'INTERMEDIATE',
  equipment: 'BARBELL',
  mediaUrl: null,
  mediaType: null,
};

describe('ExerciseCard', () => {
  it('renders exercise name', () => {
    render(<ExerciseCard exercise={baseExercise} onView={vi.fn()} />);
    expect(screen.getByText('Bench Press')).toBeInTheDocument();
  });

  it('renders primary muscle and equipment', () => {
    render(<ExerciseCard exercise={baseExercise} onView={vi.fn()} />);
    expect(screen.getByText(/Chest/)).toBeInTheDocument();
    expect(screen.getByText(/Barbell/)).toBeInTheDocument();
  });

  it('renders category badge', () => {
    render(<ExerciseCard exercise={baseExercise} onView={vi.fn()} />);
    expect(screen.getByText('Strength')).toBeInTheDocument();
  });

  it('renders difficulty as dots and label', () => {
    render(<ExerciseCard exercise={baseExercise} onView={vi.fn()} />);
    expect(screen.getByText('intermediate')).toBeInTheDocument();
    expect(screen.getByLabelText('Difficulty: INTERMEDIATE')).toBeInTheDocument();
  });

  it('shows dumbbell placeholder when no mediaUrl', () => {
    render(<ExerciseCard exercise={baseExercise} onView={vi.fn()} />);
    // No img tag present — placeholder icon rendered
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('shows image when mediaType is image', () => {
    const exercise = { ...baseExercise, mediaUrl: 'https://example.com/img.jpg', mediaType: 'image' };
    render(<ExerciseCard exercise={exercise} onView={vi.fn()} />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('calls onView with exercise id when card is clicked', () => {
    const onView = vi.fn();
    render(<ExerciseCard exercise={baseExercise} onView={onView} />);
    fireEvent.click(screen.getByText('Bench Press'));
    expect(onView).toHaveBeenCalledWith('ex-1');
  });

  it('does NOT render edit/delete buttons when admin props are absent', () => {
    render(<ExerciseCard exercise={baseExercise} onView={vi.fn()} />);
    expect(screen.queryByLabelText('Edit exercise')).toBeNull();
    expect(screen.queryByLabelText('Delete exercise')).toBeNull();
  });

  it('renders edit button when onEdit is provided', () => {
    render(<ExerciseCard exercise={baseExercise} onView={vi.fn()} onEdit={vi.fn()} />);
    expect(screen.getByLabelText('Edit exercise')).toBeInTheDocument();
  });

  it('renders delete button when onDelete is provided', () => {
    render(<ExerciseCard exercise={baseExercise} onView={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByLabelText('Delete exercise')).toBeInTheDocument();
  });

  it('calls onEdit and does NOT call onView when edit button clicked', () => {
    const onView = vi.fn();
    const onEdit = vi.fn();
    render(<ExerciseCard exercise={baseExercise} onView={onView} onEdit={onEdit} />);
    fireEvent.click(screen.getByLabelText('Edit exercise'));
    expect(onEdit).toHaveBeenCalledWith('ex-1');
    expect(onView).not.toHaveBeenCalled();
  });
});
