'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dumbbell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { ExerciseCard } from '@/components/exercises/exercise-card';
import { ExerciseFilters, DEFAULT_FILTERS } from '@/components/exercises/exercise-filters';
import { ExerciseDetailSheet } from '@/components/exercises/exercise-detail-sheet';
import { useTRPC } from '@/trpc/client';
import type { ExerciseFiltersState } from '@/components/exercises/exercise-filters';
import type { MuscleGroup, ExerciseCategory, DifficultyLevel, Equipment } from '@/generated/prisma/enums';

const PAGE_SIZE = 12;

// Trainers browse exercises in read-only mode — no create/edit/delete
export default function TrainerExercisesPage() {
  const trpc = useTRPC();

  const [filters, setFilters] = useState<ExerciseFiltersState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleFilterChange = (newFilters: ExerciseFiltersState) => {
    setFilters(newFilters);
    setPage(1);
  };

  const { data, isLoading } = useQuery(
    trpc.exercise.list.queryOptions({
      search: filters.search || undefined,
      primaryMuscle: (filters.primaryMuscle as MuscleGroup) || undefined,
      category: (filters.category as ExerciseCategory) || undefined,
      difficulty: (filters.difficulty as DifficultyLevel) || undefined,
      equipment: (filters.equipment as Equipment) || undefined,
      page,
      limit: PAGE_SIZE,
    }),
  );

  const exercises = data?.exercises ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Exercise Library"
        description="Browse exercises to use when building client workouts"
      />

      <ExerciseFilters filters={filters} onChange={handleFilterChange} />

      {isLoading ? (
        <LoadingSpinner />
      ) : exercises.length === 0 ? (
        <EmptyState
          icon={<Dumbbell className="h-10 w-10" />}
          title="No exercises found"
          description="Try adjusting your filters"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {exercises.map((ex) => (
            <ExerciseCard key={ex.id} exercise={ex} onView={setSelectedId} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}

      <ExerciseDetailSheet exerciseId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
