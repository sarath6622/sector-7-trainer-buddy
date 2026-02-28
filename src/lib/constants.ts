import type { UserRole, MuscleGroup, ExerciseCategory, Equipment } from '@/generated/prisma/enums';

export const APP_NAME = 'Sector 7';
export const APP_DESCRIPTION = 'Comprehensive fitness management platform';

export const ROLES: Record<UserRole, { label: string; dashboardPath: string }> = {
  ADMIN: { label: 'Admin', dashboardPath: '/admin' },
  TRAINER: { label: 'Trainer', dashboardPath: '/trainer' },
  CLIENT: { label: 'Client', dashboardPath: '/client' },
};

export const NAV_ITEMS: Record<UserRole, Array<{ label: string; href: string; icon: string }>> = {
  ADMIN: [
    { label: 'Dashboard', href: '/admin', icon: 'LayoutDashboard' },
    { label: 'Users', href: '/admin/users', icon: 'Users' },
    { label: 'Exercises', href: '/admin/exercises', icon: 'Dumbbell' },
    { label: 'Challenges', href: '/admin/challenges', icon: 'Trophy' },
  ],
  TRAINER: [
    { label: 'Dashboard', href: '/trainer', icon: 'LayoutDashboard' },
    { label: 'Clients', href: '/trainer/clients', icon: 'Users' },
    { label: 'Exercises', href: '/trainer/exercises', icon: 'Dumbbell' },
    { label: 'Schedule', href: '/trainer/schedule', icon: 'Calendar' },
  ],
  CLIENT: [
    { label: 'Dashboard', href: '/client', icon: 'LayoutDashboard' },
    { label: 'Workouts', href: '/client/workouts', icon: 'Dumbbell' },
    { label: 'Exercises', href: '/client/exercises', icon: 'Library' },
    { label: 'Habits', href: '/client/habits', icon: 'Heart' },
    { label: 'Community', href: '/client/community', icon: 'Users' },
  ],
};

// Display labels for the Equipment enum — used in forms and filter dropdowns
export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  BARBELL: 'Barbell',
  DUMBBELL: 'Dumbbell',
  CABLE_MACHINE: 'Cable Machine',
  SMITH_MACHINE: 'Smith Machine',
  RESISTANCE_BAND: 'Resistance Band',
  KETTLEBELL: 'Kettlebell',
  BODYWEIGHT: 'Bodyweight',
  PULLUP_BAR: 'Pull-up Bar',
  BENCH: 'Bench',
  CARDIO_MACHINE: 'Cardio Machine',
  OTHER: 'Other',
};

// Display labels for the MuscleGroup enum
export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  CHEST: 'Chest',
  BACK: 'Back',
  SHOULDERS: 'Shoulders',
  BICEPS: 'Biceps',
  TRICEPS: 'Triceps',
  FOREARMS: 'Forearms',
  QUADRICEPS: 'Quadriceps',
  HAMSTRINGS: 'Hamstrings',
  GLUTES: 'Glutes',
  CALVES: 'Calves',
  ABS: 'Abs',
  OBLIQUES: 'Obliques',
  TRAPS: 'Traps',
  LATS: 'Lats',
  FULL_BODY: 'Full Body',
  CARDIO: 'Cardio',
};

// Display labels for the ExerciseCategory enum
export const EXERCISE_CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  HYPERTROPHY: 'Hypertrophy',
  STRENGTH: 'Strength',
  CARDIO: 'Cardio',
  FLEXIBILITY: 'Flexibility',
  BALANCE: 'Balance',
  PLYOMETRIC: 'Plyometric',
  COMPOUND: 'Compound',
};
