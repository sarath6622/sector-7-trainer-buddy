'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { ExerciseCard } from '@/components/exercises/exercise-card';
import { ExerciseFilters, DEFAULT_FILTERS } from '@/components/exercises/exercise-filters';
import { ExerciseForm } from '@/components/exercises/exercise-form';
import { ExerciseDetailSheet } from '@/components/exercises/exercise-detail-sheet';
import { useTRPC } from '@/trpc/client';
import type { ExerciseFiltersState } from '@/components/exercises/exercise-filters';
import type { MuscleGroup, ExerciseCategory, DifficultyLevel, Equipment } from '@/generated/prisma/enums';
import { Dumbbell } from 'lucide-react';

const PAGE_SIZE = 12;

export default function AdminExercisesPage() {
  const trpc = useTRPC();

  const [filters, setFilters] = useState<ExerciseFiltersState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // Reset to page 1 when filters change
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
        description="Manage exercises available to all trainers and clients"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Exercise
          </Button>
        }
      />

      <ExerciseFilters filters={filters} onChange={handleFilterChange} />

      {isLoading ? (
        <LoadingSpinner />
      ) : exercises.length === 0 ? (
        <EmptyState
          icon={<Dumbbell className="h-10 w-10" />}
          title="No exercises found"
          description={
            filters.search || filters.primaryMuscle || filters.category
              ? 'Try adjusting your filters'
              : 'Add the first exercise to get started'
          }
          action={
            !filters.search && !filters.primaryMuscle && !filters.category ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                Add Exercise
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {exercises.map((ex) => (
            <ExerciseCard
              key={ex.id}
              exercise={ex}
              onView={setSelectedId}
              onEdit={setEditId}
              onDelete={(id) => setSelectedId(id)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}

      {/* Detail sheet — shows view with admin edit/delete actions */}
      <ExerciseDetailSheet
        exerciseId={selectedId}
        onClose={() => setSelectedId(null)}
        onEdit={(id) => {
          setSelectedId(null);
          setEditId(id);
        }}
        onDeleted={() => setSelectedId(null)}
      />

      {/* Create sheet */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader className="mb-4">
            <SheetTitle>Add Exercise</SheetTitle>
          </SheetHeader>
          <ExerciseForm
            onSuccess={() => setCreateOpen(false)}
            onCancel={() => setCreateOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* Edit sheet — fetches exercise data via ExerciseForm in edit mode */}
      {editId && (
        <EditSheet
          exerciseId={editId}
          onClose={() => setEditId(null)}
        />
      )}
    </div>
  );
}

// Thin wrapper that loads exercise data before rendering the edit form
function EditSheet({ exerciseId, onClose }: { exerciseId: string; onClose: () => void }) {
  const trpc = useTRPC();
  const { data: exercise } = useQuery(
    trpc.exercise.getById.queryOptions({ id: exerciseId }),
  );

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader className="mb-4">
          <SheetTitle>Edit Exercise</SheetTitle>
        </SheetHeader>
        {exercise && (
          <ExerciseForm
            exercise={exercise}
            onSuccess={onClose}
            onCancel={onClose}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
