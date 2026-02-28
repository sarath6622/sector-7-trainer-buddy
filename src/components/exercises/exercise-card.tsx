'use client';

import { Dumbbell, Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { MUSCLE_GROUP_LABELS, EXERCISE_CATEGORY_LABELS, EQUIPMENT_LABELS } from '@/lib/constants';
import type { MuscleGroup, ExerciseCategory, DifficultyLevel, Equipment } from '@/generated/prisma/enums';

// Dots rendered for difficulty — filled count maps to BEGINNER=1, INTERMEDIATE=2, ADVANCED=3
const DIFFICULTY_DOTS: Record<DifficultyLevel, number> = {
  BEGINNER: 1,
  INTERMEDIATE: 2,
  ADVANCED: 3,
};

// Extracts YouTube video ID to build a thumbnail URL
function getYoutubeThumbnail(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
  return match ? `https://img.youtube.com/vi/${match[1]}/mqdefault.jpg` : null;
}

export type ExerciseCardData = {
  id: string;
  name: string;
  primaryMuscle: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  category: ExerciseCategory;
  difficulty: DifficultyLevel;
  equipment: Equipment | null;
  mediaUrl: string | null;
  mediaType: string | null;
};

interface ExerciseCardProps {
  exercise: ExerciseCardData;
  onView: (id: string) => void;
  // Admin-only props — card renders edit/delete only when these are provided
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function ExerciseCard({ exercise, onView, onEdit, onDelete }: ExerciseCardProps) {
  const filledDots = DIFFICULTY_DOTS[exercise.difficulty];
  const thumbnailUrl =
    exercise.mediaType === 'youtube' && exercise.mediaUrl
      ? getYoutubeThumbnail(exercise.mediaUrl)
      : exercise.mediaType === 'image'
        ? exercise.mediaUrl
        : null;

  return (
    <Card
      className="cursor-pointer overflow-hidden p-0 transition-shadow hover:shadow-md"
      onClick={() => onView(exercise.id)}
    >
      {/* Media thumbnail — 16:9 aspect ratio */}
      <div className="relative aspect-video w-full bg-muted">
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailUrl}
            alt={exercise.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Dumbbell className="h-10 w-10 text-muted-foreground/40" />
          </div>
        )}

        {/* Admin action buttons overlay — stop propagation so card click doesn't fire */}
        {(onEdit || onDelete) && (
          <div
            className="absolute right-2 top-2 flex gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            {onEdit && (
              <Button
                size="icon-sm"
                variant="secondary"
                className="h-7 w-7 shadow"
                onClick={() => onEdit(exercise.id)}
                aria-label="Edit exercise"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
            {onDelete && (
              <Button
                size="icon-sm"
                variant="destructive"
                className="h-7 w-7 shadow"
                onClick={() => onDelete(exercise.id)}
                aria-label="Delete exercise"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>

      <CardContent className="space-y-2 p-3">
        {/* Name */}
        <p className="truncate font-semibold leading-tight">{exercise.name}</p>

        {/* Muscle + Equipment */}
        <p className="truncate text-xs text-muted-foreground">
          {MUSCLE_GROUP_LABELS[exercise.primaryMuscle]}
          {exercise.equipment && ` · ${EQUIPMENT_LABELS[exercise.equipment]}`}
        </p>

        {/* Difficulty dots + category badge */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-0.5" aria-label={`Difficulty: ${exercise.difficulty}`}>
            {Array.from({ length: 3 }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  'h-2 w-2 rounded-full',
                  i < filledDots ? 'bg-primary' : 'bg-muted-foreground/25',
                )}
              />
            ))}
            <span className="ml-1 text-xs text-muted-foreground capitalize">
              {exercise.difficulty.toLowerCase()}
            </span>
          </div>
          <Badge variant="secondary" className="text-xs">
            {EXERCISE_CATEGORY_LABELS[exercise.category]}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
