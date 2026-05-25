"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// DataTableSkeleton
// ---------------------------------------------------------------------------

interface DataTableSkeletonProps {
  rows?: number;
  columns?: number;
  className?: string;
}

export function DataTableSkeleton({
  rows = 5,
  columns = 4,
  className,
}: DataTableSkeletonProps) {
  return (
    <div className={cn("border rounded-lg", className)}>
      {/* Search skeleton */}
      <div className="flex justify-between items-center p-3 gap-3 border-b">
        <div className="h-9 w-48 animate-pulse rounded-md bg-muted" />
        <div className="h-9 w-28 animate-pulse rounded-md bg-muted" />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            {Array.from({ length: columns }).map((_, i) => (
              <TableHead key={i}>
                <div className="h-4 w-20 animate-pulse rounded bg-muted" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }).map((_, rowIdx) => (
            <TableRow key={rowIdx}>
              {Array.from({ length: columns }).map((_, colIdx) => (
                <TableCell key={colIdx}>
                  <div className="h-4 animate-pulse rounded bg-muted" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {/* Pagination skeleton */}
      <div className="flex justify-between items-center p-3 border-t gap-3">
        <div className="h-8 w-40 animate-pulse rounded-md bg-muted" />
        <div className="h-8 w-32 animate-pulse rounded-md bg-muted" />
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 w-8 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DataTable
// ---------------------------------------------------------------------------

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  loading?: boolean;
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: React.ReactNode;
  headerActions?: React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  pageSizeOptions?: number[];
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  loading = false,
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Buscar...",
  filters,
  headerActions,
  emptyTitle = "Sin resultados",
  emptyDescription,
  emptyAction,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  className,
}: DataTableProps<T>) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  // pageIndex is 0-based internally, page prop is 1-based
  const pageIndex = page - 1;

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount,
    state: { pagination: { pageIndex, pageSize } },
    onPaginationChange: (updater) => {
      if (typeof updater === "function") {
        const next = updater({ pageIndex, pageSize });
        if (next.pageIndex !== pageIndex) onPageChange(next.pageIndex + 1);
        if (next.pageSize !== pageSize) onPageSizeChange(next.pageSize);
      } else {
        if (updater.pageIndex !== pageIndex) onPageChange(updater.pageIndex + 1);
        if (updater.pageSize !== pageSize) onPageSizeChange(updater.pageSize);
      }
    },
  });

  const hasSearch = onSearchChange !== undefined;
  const hasFiltersOrActions = filters !== undefined || headerActions !== undefined || hasSearch;

  // Render skeleton when loading
  if (loading) {
    return (
      <DataTableSkeleton
        rows={pageSize}
        columns={columns.length}
        className={className}
      />
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* Header: search + filters + actions */}
      {hasFiltersOrActions && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            {hasSearch && (
              <Input
                aria-label={searchPlaceholder}
                placeholder={searchPlaceholder}
                value={searchValue ?? ""}
                onChange={(e) => onSearchChange!(e.target.value)}
                className="w-56"
              />
            )}
            {filters}
          </div>
          {headerActions && (
            <div className="flex items-end gap-2">{headerActions}</div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="border rounded-lg overflow-x-auto">
        <Table aria-busy={loading} role="table">
          <TableHeader className="sticky top-0 bg-card z-10">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead key={header.id} className="whitespace-nowrap">
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="p-0">
                  <EmptyState
                    title={emptyTitle}
                    description={emptyDescription}
                    action={emptyAction}
                  />
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination footer */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Registros por página</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              onPageSizeChange(Number(v));
              onPageChange(1);
            }}
          >
            <SelectTrigger className="w-16">{pageSize}</SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <span className="text-sm text-muted-foreground">
          Página {page} de {pageCount}
        </span>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(1)}
            disabled={page <= 1}
            aria-label="Primera página"
          >
            «
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Página anterior"
          >
            ‹
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= pageCount}
            aria-label="Página siguiente"
          >
            ›
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(pageCount)}
            disabled={page >= pageCount}
            aria-label="Última página"
          >
            »
          </Button>
        </div>
      </div>
    </div>
  );
}
