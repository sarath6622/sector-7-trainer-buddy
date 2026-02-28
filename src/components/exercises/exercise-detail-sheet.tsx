'use client';

import { useState } from 'react';
import { Dumbbell, Pencil, Trash2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { MUSCLE_GROUP_LABELS, EXERCISE_CATEGORY_LABELS, EQUIPMENT_LABELS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { useTRPC } from '@/trpc/client';
import { useQuery } from '@tanstack/react-query';
import type { DifficultyLevel } from '@/generated/prisma/enums';
import { ExerciseForm } from './exercise-form';
import { DeleteExerciseDialog } from './delete-exercise-dialog';

const DIFFICULTY_DOTS: Record<DifficultyLevel, number> = {
  BEGINNER: 1,
  INTERMEDIATE: 2,
  ADVANCED: 3,
};

// Extracts YouTube video ID from URL for embed and thumbnail
function getYoutubeId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
  return match ? match[1] : null;
}

interface ExerciseDetailSheetProps {
  exerciseId: string | null;
  onClose: () => void;
  // Admin-only — renders edit/delete actions when provided
  onEdit?: (id: string) => void;
  onDeleted?: () => void;
}

export function ExerciseDetailSheet({
  exerciseId,
  onClose,
  onEdit,
  onDeleted,
}: ExerciseDetailSheetProps) {
  const [showEditForm, setShowEditForm] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const trpc = useTRPC();

  const { data: exercise, isLoading } = useQuery({
    // Only fetch when a valid ID is selected
    ...trpc.exercise.getById.queryOptions({ id: exerciseId! }),
    enabled: !!exerciseId,
  });

  const isAdmin = !!onEdit && !!onDeleted;

  const handleEditSuccess = () => {
    setShowEditForm(false);
  };

  return (
    <>
      <Sheet open={!!exerciseId} onOpenChange={(open) => !open && onClose()}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg">
          {showEditForm && exercise ? (
            <>
              <SheetHeader className="flex-row items-center justify-between border-b px-4 py-3">
                <h2 className="text-base font-semibold">Edit Exercise</h2>
                <Button variant="ghost" size="icon-sm" onClick={() => setShowEditForm(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </SheetHeader>
              <div className="overflow-y-auto p-4">
                <ExerciseForm
                  exercise={exercise}
                  onSuccess={handleEditSuccess}
                  onCancel={() => setShowEditForm(false)}
                />
              </div>
            </>
          ) : (
            <>
              {/* Header */}
              <SheetHeader className="flex-row items-center justify-between border-b px-4 py-3">
                <div className="flex items-center gap-2">
                  {isAdmin && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => exercise && setShowEditForm(true)}
                        disabled={isLoading}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setShowDeleteDialog(true)}
                        disabled={isLoading}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </>
                  )}
                </div>
                <Button variant="ghost" size="icon-sm" onClick={onClose}>
                  <X className="h-4 w-4" />
                </Button>
              </SheetHeader>

              {isLoading ? (
                <ExerciseDetailSkeleton />
              ) : exercise ? (
                <div className="flex flex-col gap-4">
                  {/* Media */}
                  <div className="aspect-video w-full bg-muted">
                    {exercise.mediaType === 'youtube' && exercise.mediaUrl ? (
                      <iframe
                        src={`https://www.youtube.com/embed/${getYoutubeId(exercise.mediaUrl)}`}
                        className="h-full w-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        title={exercise.name}
                      />
                    ) : exercise.mediaType === 'video' && exercise.mediaUrl ? (
                      // eslint-disable-next-line jsx-a11y/media-has-caption
                      <video
                        src={exercise.mediaUrl}
                        controls
                        className="h-full w-full object-cover"
                      />
                    ) : exercise.mediaType === 'image' && exercise.mediaUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={exercise.mediaUrl}
                        alt={exercise.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <Dumbbell className="h-12 w-12 text-muted-foreground/30" />
                      </div>
                    )}
                  </div>

                  <div className="space-y-4 px-4 pb-6">
                    {/* Title + badges */}
                    <div className="space-y-2">
                      <h2 className="text-xl font-bold">{exercise.name}</h2>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge>{EXERCISE_CATEGORY_LABELS[exercise.category]}</Badge>
                        <Badge variant="secondary">
                          {exercise.difficulty.charAt(0) + exercise.difficulty.slice(1).toLowerCase()}
                        </Badge>
                      </div>
                    </div>

                    <Separator />

                    {/* Muscle groups */}
                    <div className="space-y-2 text-sm">
                      <div className="flex gap-2">
                        <span className="w-28 shrink-0 text-muted-foreground">Primary</span>
                        <span className="font-medium">
                          {MUSCLE_GROUP_LABELS[exercise.primaryMuscle]}
                        </span>
                      </div>
                      {exercise.secondaryMuscles.length > 0 && (
                        <div className="flex gap-2">
                          <span className="w-28 shrink-0 text-muted-foreground">Secondary</span>
                          <span>
                            {exercise.secondaryMuscles
                              .map((m) => MUSCLE_GROUP_LABELS[m])
                              .join(', ')}
                          </span>
                        </div>
                      )}
                      {exercise.equipment && (
                        <div className="flex gap-2">
                          <span className="w-28 shrink-0 text-muted-foreground">Equipment</span>
                          <span>{EQUIPMENT_LABELS[exercise.equipment]}</span>
                        </div>
                      )}
                      {/* Difficulty dots */}
                      <div className="flex items-center gap-2">
                        <span className="w-28 shrink-0 text-muted-foreground">Difficulty</span>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: 3 }).map((_, i) => (
                            <span
                              key={i}
                              className={cn(
                                'h-2.5 w-2.5 rounded-full',
                                i < DIFFICULTY_DOTS[exercise.difficulty]
                                  ? 'bg-primary'
                                  : 'bg-muted-foreground/25',
                              )}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Description */}
                    {exercise.description && (
                      <>
                        <Separator />
                        <div className="space-y-1.5">
                          <h3 className="text-sm font-semibold">Description</h3>
                          <p className="text-sm text-muted-foreground">{exercise.description}</p>
                        </div>
                      </>
                    )}

                    {/* Instructions */}
                    {exercise.instructions && (
                      <>
                        <Separator />
                        <div className="space-y-1.5">
                          <h3 className="text-sm font-semibold">Instructions</h3>
                          <p className="whitespace-pre-line text-sm text-muted-foreground">
                            {exercise.instructions}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete confirmation — rendered outside the Sheet so it stacks correctly */}
      {exercise && (
        <DeleteExerciseDialog
          exerciseId={exercise.id}
          exerciseName={exercise.name}
          open={showDeleteDialog}
          onClose={() => setShowDeleteDialog(false)}
          onDeleted={() => {
            setShowDeleteDialog(false);
            onClose();
            onDeleted?.();
          }}
        />
      )}
    </>
  );
}

function ExerciseDetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="aspect-video w-full" />
      <div className="space-y-3 px-4">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-px w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>
  );
}
