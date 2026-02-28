'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { MUSCLE_GROUP_LABELS, EXERCISE_CATEGORY_LABELS, EQUIPMENT_LABELS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { useTRPC } from '@/trpc/client';
import type { MuscleGroup, ExerciseCategory, DifficultyLevel, Equipment } from '@/generated/prisma/enums';

// Mirrors the tRPC create/update input schema — uses explicit types instead of
// .default() to avoid react-hook-form inference conflicts with optional fields
const exerciseFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  instructions: z.string().optional(),
  primaryMuscle: z.string().min(1, 'Primary muscle is required'),
  secondaryMuscles: z.array(z.string()),
  equipment: z.string().optional(),
  category: z.string().min(1, 'Category is required'),
  difficulty: z.string(),
  mediaUrl: z.string().url('Must be a valid URL').optional().or(z.literal('')),
});

type ExerciseFormValues = z.infer<typeof exerciseFormSchema>;

export type ExerciseFormData = {
  id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  primaryMuscle: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  equipment: Equipment | null;
  category: ExerciseCategory;
  difficulty: DifficultyLevel;
  mediaUrl: string | null;
  mediaType: string | null;
};

interface ExerciseFormProps {
  // When provided, form is in edit mode; otherwise create mode
  exercise?: ExerciseFormData;
  onSuccess: () => void;
  onCancel: () => void;
}

export function ExerciseForm({ exercise, onSuccess, onCancel }: ExerciseFormProps) {
  const isEdit = !!exercise;
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const form = useForm<ExerciseFormValues>({
    resolver: zodResolver(exerciseFormSchema),
    defaultValues: {
      name: exercise?.name ?? '',
      description: exercise?.description ?? '',
      instructions: exercise?.instructions ?? '',
      primaryMuscle: exercise?.primaryMuscle ?? '',
      secondaryMuscles: exercise?.secondaryMuscles ?? [],
      equipment: exercise?.equipment ?? '',
      category: exercise?.category ?? '',
      difficulty: exercise?.difficulty ?? 'INTERMEDIATE',
      mediaUrl: exercise?.mediaUrl ?? '',
    },
  });

  const createMutation = useMutation(
    trpc.exercise.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.exercise.list.queryKey() });
        toast.success('Exercise created');
        onSuccess();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const updateMutation = useMutation(
    trpc.exercise.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.exercise.list.queryKey() });
        queryClient.invalidateQueries({
          queryKey: trpc.exercise.getById.queryKey({ id: exercise!.id }),
        });
        toast.success('Exercise updated');
        onSuccess();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const isPending = createMutation.isPending || updateMutation.isPending;

  const onSubmit = (values: ExerciseFormValues) => {
    const payload = {
      ...values,
      primaryMuscle: values.primaryMuscle as MuscleGroup,
      secondaryMuscles: values.secondaryMuscles as MuscleGroup[],
      equipment: values.equipment ? (values.equipment as Equipment) : undefined,
      category: values.category as ExerciseCategory,
      difficulty: values.difficulty as DifficultyLevel,
      mediaUrl: values.mediaUrl || undefined,
    };

    if (isEdit) {
      updateMutation.mutate({ id: exercise.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  // Toggles a muscle group in/out of the secondaryMuscles array
  const toggleSecondaryMuscle = (muscle: MuscleGroup) => {
    const current = form.getValues('secondaryMuscles');
    const updated = current.includes(muscle)
      ? current.filter((m) => m !== muscle)
      : [...current, muscle];
    form.setValue('secondaryMuscles', updated);
  };

  const secondaryMuscles = form.watch('secondaryMuscles');
  const mediaUrl = form.watch('mediaUrl');

  // Live preview thumbnail based on pasted URL
  const previewThumbnail = (() => {
    if (!mediaUrl) return null;
    const ytMatch = mediaUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
    if (ytMatch) return `https://img.youtube.com/vi/${ytMatch[1]}/mqdefault.jpg`;
    if (/\.(jpg|jpeg|png|gif|webp|avif)(\?.*)?$/i.test(mediaUrl)) return mediaUrl;
    return null;
  })();

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        {/* Name */}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Exercise Name *</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Barbell Back Squat" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Primary Muscle + Category (side by side on larger screens) */}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="primaryMuscle"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Primary Muscle *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select muscle group" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {(Object.keys(MUSCLE_GROUP_LABELS) as MuscleGroup[]).map((key) => (
                      <SelectItem key={key} value={key}>
                        {MUSCLE_GROUP_LABELS[key]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {(Object.keys(EXERCISE_CATEGORY_LABELS) as ExerciseCategory[]).map((key) => (
                      <SelectItem key={key} value={key}>
                        {EXERCISE_CATEGORY_LABELS[key]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Equipment + Difficulty */}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="equipment"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Equipment</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || 'none'}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="No equipment" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {(Object.keys(EQUIPMENT_LABELS) as Equipment[]).map((key) => (
                      <SelectItem key={key} value={key}>
                        {EQUIPMENT_LABELS[key]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="difficulty"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Difficulty *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="BEGINNER">Beginner</SelectItem>
                    <SelectItem value="INTERMEDIATE">Intermediate</SelectItem>
                    <SelectItem value="ADVANCED">Advanced</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Secondary Muscles — toggle badge grid */}
        <div className="space-y-2">
          <Label>Secondary Muscles</Label>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(MUSCLE_GROUP_LABELS) as MuscleGroup[]).map((muscle) => {
              const selected = secondaryMuscles.includes(muscle);
              return (
                <button
                  key={muscle}
                  type="button"
                  onClick={() => toggleSecondaryMuscle(muscle)}
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                    selected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input bg-background text-muted-foreground hover:border-primary hover:text-primary',
                  )}
                >
                  {MUSCLE_GROUP_LABELS[muscle]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Description */}
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea placeholder="Brief overview of the exercise..." rows={2} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Instructions */}
        <FormField
          control={form.control}
          name="instructions"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Instructions</FormLabel>
              <FormControl>
                <Textarea placeholder="Step-by-step instructions..." rows={4} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Media URL with live preview */}
        <FormField
          control={form.control}
          name="mediaUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Media URL</FormLabel>
              <FormControl>
                <Input
                  placeholder="Paste image URL, video URL, or YouTube link..."
                  {...field}
                />
              </FormControl>
              <FormMessage />
              {previewThumbnail && (
                <div className="mt-2 overflow-hidden rounded-md border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewThumbnail}
                    alt="Media preview"
                    className="aspect-video w-full object-cover"
                  />
                </div>
              )}
            </FormItem>
          )}
        />

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? 'Save Changes' : 'Create Exercise'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
