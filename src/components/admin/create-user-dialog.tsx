'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTRPC } from '@/trpc/client';
import { toast } from 'sonner';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { UserPlus, Eye, EyeOff } from 'lucide-react';

const schema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    role: z.enum(['TRAINER', 'CLIENT']),
});

type FormValues = z.infer<typeof schema>;

interface CreateUserDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    defaultRole?: 'TRAINER' | 'CLIENT';
}

// Admin-only dialog: creates a trainer or client account with a role-appropriate profile stub
export function CreateUserDialog({ open, onOpenChange, defaultRole = 'CLIENT' }: CreateUserDialogProps) {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const [showPassword, setShowPassword] = useState(false);

    const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: { role: defaultRole, name: '', email: '', password: '' },
    });

    const role = watch('role');

    const create = useMutation(trpc.user.create.mutationOptions({
        onSuccess: (user) => {
            toast.success(`${user.role === 'TRAINER' ? 'Trainer' : 'Client'} account created for ${user.name}`);
            queryClient.invalidateQueries(trpc.user.list.queryFilter());
            queryClient.invalidateQueries(trpc.trainer.listAll.queryFilter());
            onOpenChange(false);
            reset();
        },
        onError: (err: { message: string }) => toast.error(err.message),
    }));

    function onSubmit(values: FormValues) {
        create.mutate(values);
    }

    return (
        <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <UserPlus className="h-5 w-5" />
                        Create User Account
                    </DialogTitle>
                    <DialogDescription>
                        The user can log in immediately with these credentials. Their profile is auto-created.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
                    {/* Role toggle */}
                    <div className="space-y-1.5">
                        <Label>Role</Label>
                        <div className="flex gap-2">
                            {(['TRAINER', 'CLIENT'] as const).map((r) => (
                                <button
                                    key={r}
                                    type="button"
                                    onClick={() => setValue('role', r)}
                                    className={`flex-1 py-2 rounded-md text-sm font-medium border transition-colors ${role === r
                                            ? 'border-primary bg-primary text-primary-foreground'
                                            : 'border-border bg-transparent text-muted-foreground hover:border-primary/50'
                                        }`}
                                >
                                    {r === 'TRAINER' ? '🏋️ Trainer' : '👤 Client'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Name */}
                    <div className="space-y-1.5">
                        <Label htmlFor="create-name">Full Name</Label>
                        <Input id="create-name" placeholder="e.g. John Smith" {...register('name')} />
                        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                    </div>

                    {/* Email */}
                    <div className="space-y-1.5">
                        <Label htmlFor="create-email">Email Address</Label>
                        <Input id="create-email" type="email" placeholder="john@example.com" {...register('email')} />
                        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                    </div>

                    {/* Password */}
                    <div className="space-y-1.5">
                        <Label htmlFor="create-password">Temporary Password</Label>
                        <div className="relative">
                            <Input
                                id="create-password"
                                type={showPassword ? 'text' : 'password'}
                                placeholder="Min 8 characters"
                                className="pr-10"
                                {...register('password')}
                            />
                            <button
                                type="button"
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                onClick={() => setShowPassword((p) => !p)}
                            >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                        {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
                        <p className="text-xs text-muted-foreground">Share this with the user so they can log in and change it later.</p>
                    </div>

                    {/* Summary badge */}
                    <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                        A <Badge variant="outline" className="text-xs py-0">{role}</Badge> account and profile will be created automatically.
                    </div>

                    <DialogFooter className="pt-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit" disabled={create.isPending}>
                            {create.isPending ? 'Creating…' : `Create ${role === 'TRAINER' ? 'Trainer' : 'Client'}`}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
