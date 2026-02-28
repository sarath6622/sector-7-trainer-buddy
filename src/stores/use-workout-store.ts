import { create } from 'zustand';

interface WorkoutExercise {
  exerciseId: string;
  exerciseName: string;
  orderIndex: number;
  sets: Array<{
    setNumber: number;
    reps?: number;
    weightKg?: number;
    rpe?: number;
  }>;
}

interface WorkoutStore {
  isActive: boolean;
  title: string;
  exercises: WorkoutExercise[];
  startWorkout: () => void;
  setTitle: (title: string) => void;
  addExercise: (exercise: Omit<WorkoutExercise, 'orderIndex'>) => void;
  removeExercise: (index: number) => void;
  updateSet: (
    exerciseIndex: number,
    setIndex: number,
    data: Partial<WorkoutExercise['sets'][0]>,
  ) => void;
  addSet: (exerciseIndex: number) => void;
  reset: () => void;
}

export const useWorkoutStore = create<WorkoutStore>((set) => ({
  isActive: false,
  title: '',
  exercises: [],
  startWorkout: () => set({ isActive: true, exercises: [], title: '' }),
  setTitle: (title) => set({ title }),
  addExercise: (exercise) =>
    set((state) => ({
      exercises: [...state.exercises, { ...exercise, orderIndex: state.exercises.length }],
    })),
  removeExercise: (index) =>
    set((state) => ({
      exercises: state.exercises
        .filter((_, i) => i !== index)
        .map((e, i) => ({ ...e, orderIndex: i })),
    })),
  updateSet: (exerciseIndex, setIndex, data) =>
    set((state) => ({
      exercises: state.exercises.map((e, ei) =>
        ei === exerciseIndex
          ? {
              ...e,
              sets: e.sets.map((s, si) => (si === setIndex ? { ...s, ...data } : s)),
            }
          : e,
      ),
    })),
  addSet: (exerciseIndex) =>
    set((state) => ({
      exercises: state.exercises.map((e, ei) =>
        ei === exerciseIndex
          ? {
              ...e,
              sets: [...e.sets, { setNumber: e.sets.length + 1 }],
            }
          : e,
      ),
    })),
  reset: () => set({ isActive: false, title: '', exercises: [] }),
}));
