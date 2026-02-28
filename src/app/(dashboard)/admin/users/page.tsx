'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/client';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { CreateUserDialog } from '@/components/admin/create-user-dialog';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel,
    AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
    AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { UserPlus, MoreVertical, CheckCircle2, XCircle, AlertCircle, Search } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
    ACTIVE: { label: 'Active', className: 'bg-green-500/10 text-green-400 border-green-500/20' },
    INACTIVE: { label: 'Inactive', className: 'bg-muted text-muted-foreground' },
    SUSPENDED: { label: 'Suspended', className: 'bg-destructive/10 text-destructive border-destructive/20' },
    PENDING: { label: 'Pending', className: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
};

const ROLE_BADGE: Record<string, string> = {
    ADMIN: 'bg-primary/10 text-primary border-primary/20',
    TRAINER: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    CLIENT: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
};

// Admin Users management page — list, search, filter by role, create, and manage status
export default function AdminUsersPage() {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const [createOpen, setCreateOpen] = useState(false);
    const [defaultRole, setDefaultRole] = useState<'TRAINER' | 'CLIENT'>('CLIENT');
    const [roleFilter, setRoleFilter] = useState<'ALL' | 'ADMIN' | 'TRAINER' | 'CLIENT'>('ALL');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [deactivateId, setDeactivateId] = useState<string | null>(null);

    const { data, isLoading } = useQuery(
        trpc.user.list.queryOptions({
            role: roleFilter === 'ALL' ? undefined : roleFilter,
            search: search || undefined,
            page,
            limit: 20,
        }),
    );

    const updateStatus = useMutation(trpc.user.updateStatus.mutationOptions({
        onSuccess: () => {
            toast.success('Status updated');
            queryClient.invalidateQueries(trpc.user.list.queryFilter());
        },
        onError: (err: { message: string }) => toast.error(err.message),
    }));

    const deactivate = useMutation(trpc.user.deactivate.mutationOptions({
        onSuccess: () => {
            toast.success('Account deactivated');
            queryClient.invalidateQueries(trpc.user.list.queryFilter());
            setDeactivateId(null);
        },
        onError: (err: { message: string }) => toast.error(err.message),
    }));

    function openCreate(role: 'TRAINER' | 'CLIENT') {
        setDefaultRole(role);
        setCreateOpen(true);
    }

    const users = data?.users ?? [];
    const totalPages = data?.totalPages ?? 1;
    const total = data?.total ?? 0;

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <PageHeader
                    title="Users"
                    description={`${total} total users`}
                />
                <div className="flex gap-2 shrink-0">
                    <Button
                        id="create-trainer-btn"
                        variant="outline"
                        onClick={() => openCreate('TRAINER')}
                        className="gap-2"
                    >
                        <UserPlus className="h-4 w-4" />
                        Add Trainer
                    </Button>
                    <Button
                        id="create-client-btn"
                        onClick={() => openCreate('CLIENT')}
                        className="gap-2"
                    >
                        <UserPlus className="h-4 w-4" />
                        Add Client
                    </Button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by name or email…"
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                        className="pl-9"
                    />
                </div>
                <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v as typeof roleFilter); setPage(1); }}>
                    <SelectTrigger className="w-full sm:w-40">
                        <SelectValue placeholder="All roles" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ALL">All Roles</SelectItem>
                        <SelectItem value="ADMIN">Admin</SelectItem>
                        <SelectItem value="TRAINER">Trainer</SelectItem>
                        <SelectItem value="CLIENT">Client</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Users table */}
            {isLoading ? (
                <div className="space-y-2">
                    {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
            ) : (
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>User</TableHead>
                                <TableHead>Role</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Profile</TableHead>
                                <TableHead>Joined</TableHead>
                                <TableHead className="w-10"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {users.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                                        {search ? `No users matching "${search}"` : 'No users found'}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                users.map((u) => {
                                    const statusCfg = STATUS_BADGE[u.status] ?? STATUS_BADGE.INACTIVE;
                                    const profileCompleted =
                                        u.role === 'TRAINER' ? u.trainerProfile?.profileCompleted :
                                            u.role === 'CLIENT' ? u.clientProfile?.profileCompleted : true;

                                    return (
                                        <TableRow key={u.id}>
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <Avatar className="h-8 w-8">
                                                        <AvatarImage src={u.image ?? undefined} />
                                                        <AvatarFallback className="text-xs font-semibold">
                                                            {u.name?.charAt(0)?.toUpperCase() ?? u.email.charAt(0).toUpperCase()}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-medium truncate">{u.name ?? '—'}</p>
                                                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={`text-xs ${ROLE_BADGE[u.role] ?? ''}`}>
                                                    {u.role}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={`text-xs ${statusCfg.className}`}>
                                                    {statusCfg.label}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {u.role === 'ADMIN' ? (
                                                    <span className="text-xs text-muted-foreground">—</span>
                                                ) : profileCompleted ? (
                                                    <span className="flex items-center gap-1 text-xs text-green-400">
                                                        <CheckCircle2 className="h-3.5 w-3.5" /> Complete
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-1 text-xs text-yellow-400">
                                                        <AlertCircle className="h-3.5 w-3.5" /> Pending
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {formatDistanceToNow(new Date(u.createdAt), { addSuffix: true })}
                                            </TableCell>
                                            <TableCell>
                                                {u.role !== 'ADMIN' && (
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                                                <MoreVertical className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            {u.status !== 'ACTIVE' && (
                                                                <DropdownMenuItem onClick={() => updateStatus.mutate({ id: u.id, status: 'ACTIVE' })}>
                                                                    <CheckCircle2 className="h-4 w-4 mr-2 text-green-400" /> Activate
                                                                </DropdownMenuItem>
                                                            )}
                                                            {u.status !== 'SUSPENDED' && (
                                                                <DropdownMenuItem onClick={() => updateStatus.mutate({ id: u.id, status: 'SUSPENDED' })}>
                                                                    <XCircle className="h-4 w-4 mr-2 text-destructive" /> Suspend
                                                                </DropdownMenuItem>
                                                            )}
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem
                                                                onClick={() => setDeactivateId(u.id)}
                                                                className="text-destructive focus:text-destructive"
                                                            >
                                                                Deactivate Account
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-4">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                        Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                        Next
                    </Button>
                </div>
            )}

            <CreateUserDialog
                open={createOpen}
                onOpenChange={setCreateOpen}
                defaultRole={defaultRole}
            />

            {/* Deactivate confirm */}
            <AlertDialog open={!!deactivateId} onOpenChange={(o) => !o && setDeactivateId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Deactivate Account</AlertDialogTitle>
                        <AlertDialogDescription>
                            This sets the account status to Inactive. The user will not be able to log in. Their data is preserved and can be reactivated.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => deactivateId && deactivate.mutate({ id: deactivateId })}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Deactivate
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
