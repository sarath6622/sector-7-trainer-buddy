'use client';

import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface DeleteExerciseDialogProps {
  exerciseId: string;
  exerciseName: string;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteExerciseDialog({
  exerciseId,
  exerciseName,
  open,
  onClose,
  onDeleted,
}: DeleteExerciseDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const deleteMutation = useMutation(
    trpc.exercise.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.exercise.list.queryKey() });
        toast.success(`"${exerciseName}" deleted`);
        onDeleted();
      },
      onError: (err) => {
        // Surfaces the "in use by workouts" conflict message from the router
        toast.error(err.message);
        onClose();
      },
    }),
  );

  return (
    <AlertDialog open={open} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Exercise?</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>&ldquo;{exerciseName}&rdquo;</strong> will be permanently deleted. This cannot
            be undone. Exercises used in existing workouts cannot be deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate({ id: exerciseId })}
          >
            {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
