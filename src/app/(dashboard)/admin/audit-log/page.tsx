'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/client';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

// ── Action badge colouring ─────────────────────────────────────────────────────

const ACTION_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  USER_CREATE: 'default',
  USER_STATUS_UPDATE: 'secondary',
  USER_DEACTIVATE: 'destructive',
  CLIENT_ASSIGN: 'default',
  CLIENT_UNASSIGN: 'destructive',
  CHALLENGE_ACTIVATE: 'default',
  CHALLENGE_CANCEL: 'destructive',
};

const ACTION_LABEL: Record<string, string> = {
  USER_CREATE: 'User Created',
  USER_STATUS_UPDATE: 'Status Updated',
  USER_DEACTIVATE: 'User Deactivated',
  CLIENT_ASSIGN: 'Client Assigned',
  CLIENT_UNASSIGN: 'Client Unassigned',
  CHALLENGE_ACTIVATE: 'Challenge Activated',
  CHALLENGE_CANCEL: 'Challenge Cancelled',
};

const ACTION_GROUPS = [
  { label: 'All actions', value: '' },
  { label: 'User actions', value: 'USER_' },
  { label: 'Client assignments', value: 'CLIENT_' },
  { label: 'Challenge actions', value: 'CHALLENGE_' },
];

// ── Details expander ───────────────────────────────────────────────────────────

function DetailsCell({ details }: { details: unknown }) {
  const [open, setOpen] = useState(false);
  if (!details || typeof details !== 'object' || Object.keys(details as object).length === 0) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }
  return (
    <div>
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {open ? 'Hide' : 'Show'}
      </button>
      {open && (
        <pre className="mt-1 rounded bg-muted px-2 py-1 text-xs font-mono whitespace-pre-wrap break-all">
          {JSON.stringify(details, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AuditLogPage() {
  const trpc = useTRPC();

  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data, isLoading } = useQuery(
    trpc.auditLog.list.queryOptions({
      action: actionFilter || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      page,
      limit: 25,
    }),
  );

  const handleFilterChange = () => setPage(1);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Log"
        description="A record of all admin actions taken on the platform"
      />

      {/* ── Filters ──────────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[160px] max-w-xs space-y-1">
              <p className="text-xs text-muted-foreground">Action type</p>
              <Select
                value={actionFilter}
                onValueChange={(v) => { setActionFilter(v); handleFilterChange(); }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All actions" />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_GROUPS.map((g) => (
                    <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">From</p>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); handleFilterChange(); }}
                className="w-38"
              />
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">To</p>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); handleFilterChange(); }}
                className="w-38"
              />
            </div>

            {(actionFilter || dateFrom || dateTo) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setActionFilter('');
                  setDateFrom('');
                  setDateTo('');
                  setPage(1);
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Table ────────────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Details</TableHead>
                <TableHead className="text-right">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : !data || data.logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                    No audit events found
                  </TableCell>
                </TableRow>
              ) : (
                data.logs.map((log) => (
                  <TableRow key={log.id}>
                    {/* Actor */}
                    <TableCell>
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar className="h-7 w-7 shrink-0">
                          <AvatarImage src={log.user.image ?? undefined} />
                          <AvatarFallback className="text-xs">
                            {(log.user.name ?? '?')[0]?.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{log.user.name ?? '—'}</p>
                          <p className="text-xs text-muted-foreground truncate">{log.user.email}</p>
                        </div>
                      </div>
                    </TableCell>

                    {/* Action */}
                    <TableCell>
                      <Badge variant={ACTION_VARIANT[log.action] ?? 'outline'} className="whitespace-nowrap">
                        {ACTION_LABEL[log.action] ?? log.action}
                      </Badge>
                    </TableCell>

                    {/* Entity */}
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">{log.entity}</p>
                        <p className="text-xs text-muted-foreground font-mono truncate max-w-[120px]">
                          {log.entityId}
                        </p>
                      </div>
                    </TableCell>

                    {/* Details */}
                    <TableCell className="max-w-[200px]">
                      <DetailsCell details={log.details} />
                    </TableCell>

                    {/* Timestamp */}
                    <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Pagination ───────────────────────────────────────────────────────── */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {data.page} of {data.totalPages} — {data.total} events
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
