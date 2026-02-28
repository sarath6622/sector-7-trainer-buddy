'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dumbbell, Flame, Target } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { TRAINER_SPECIALTY_LABELS } from '@/lib/constants';
import type { TrainerSpecialty } from '@/generated/prisma/enums';

interface ClientCardProps {
    clientProfileId: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    fitnessGoals?: string[];
    lastWorkout?: { title?: string | null; date: Date } | null;
    profileCompleted?: boolean;
    onView: (clientProfileId: string) => void;
    onAssignWorkout?: (clientProfileId: string) => void;
}

// Summary card for a single mapped client — used in the trainer Clients page grid
export function ClientCard({
    clientProfileId,
    name,
    email,
    image,
    fitnessGoals = [],
    lastWorkout,
    profileCompleted = false,
    onView,
    onAssignWorkout,
}: ClientCardProps) {
    const lastWorkoutLabel = lastWorkout
        ? formatDistanceToNow(new Date(lastWorkout.date), { addSuffix: true })
        : 'No workouts yet';

    return (
        <Card
            className="transition-all duration-200 hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 cursor-pointer"
            onClick={() => onView(clientProfileId)}
        >
            <CardHeader className="pb-2">
                <div className="flex items-start gap-3">
                    <Avatar className="h-11 w-11 ring-2 ring-border">
                        <AvatarImage src={image ?? undefined} />
                        <AvatarFallback className="text-sm font-semibold">
                            {name?.charAt(0)?.toUpperCase() ?? '?'}
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{name ?? 'Unnamed Client'}</p>
                        <p className="text-xs text-muted-foreground truncate">{email}</p>
                    </div>
                    {!profileCompleted && (
                        <Badge variant="outline" className="text-xs shrink-0 border-yellow-500/30 text-yellow-400 bg-yellow-500/5">
                            Setup pending
                        </Badge>
                    )}
                </div>
            </CardHeader>

            <CardContent className="space-y-3">
                {fitnessGoals.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                        {fitnessGoals.slice(0, 3).map((g) => (
                            <span key={g} className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                {g.replace(/_/g, ' ')}
                            </span>
                        ))}
                    </div>
                )}

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                        <Dumbbell className="h-3 w-3" />
                        {lastWorkoutLabel}
                    </span>
                </div>

                {onAssignWorkout && (
                    <Button
                        size="sm"
                        variant="outline"
                        className="w-full h-7 text-xs"
                        onClick={(e) => {
                            e.stopPropagation();
                            onAssignWorkout(clientProfileId);
                        }}
                    >
                        Assign Workout
                    </Button>
                )}
            </CardContent>
        </Card>
    );
}
