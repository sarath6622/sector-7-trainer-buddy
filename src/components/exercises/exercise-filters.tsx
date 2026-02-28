'use client';

import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  MUSCLE_GROUP_LABELS,
  EXERCISE_CATEGORY_LABELS,
  EQUIPMENT_LABELS,
} from '@/lib/constants';
import type { MuscleGroup, ExerciseCategory, DifficultyLevel, Equipment } from '@/generated/prisma/enums';

export type ExerciseFiltersState = {
  search: string;
  primaryMuscle: MuscleGroup | '';
  category: ExerciseCategory | '';
  difficulty: DifficultyLevel | '';
  equipment: Equipment | '';
};

export const DEFAULT_FILTERS: ExerciseFiltersState = {
  search: '',
  primaryMuscle: '',
  category: '',
  difficulty: '',
  equipment: '',
};

interface ExerciseFiltersProps {
  filters: ExerciseFiltersState;
  onChange: (filters: ExerciseFiltersState) => void;
}

export function ExerciseFilters({ filters, onChange }: ExerciseFiltersProps) {
  // Local search state so we can debounce before calling onChange
  const [searchInput, setSearchInput] = useState(filters.search);

  // Sync internal search state if filters are reset externally
  useEffect(() => {
    setSearchInput(filters.search);
  }, [filters.search]);

  // Debounce search by 300ms to avoid spamming queries on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== filters.search) {
        onChange({ ...filters, search: searchInput });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasActiveFilters =
    filters.search || filters.primaryMuscle || filters.category || filters.difficulty || filters.equipment;

  const handleDropdown = (key: keyof ExerciseFiltersState, value: string) => {
    onChange({ ...filters, [key]: value });
  };

  const handleClear = () => {
    setSearchInput('');
    onChange(DEFAULT_FILTERS);
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      {/* Search */}
      <div className="relative flex-1 sm:min-w-52">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search exercises..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="pl-8"
        />
      </div>

      {/* Muscle Group */}
      <Select
        value={filters.primaryMuscle || 'all'}
        onValueChange={(v) => handleDropdown('primaryMuscle', v === 'all' ? '' : v)}
      >
        <SelectTrigger className="w-full sm:w-40">
          <SelectValue placeholder="Muscle Group" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Muscles</SelectItem>
          {(Object.keys(MUSCLE_GROUP_LABELS) as MuscleGroup[]).map((key) => (
            <SelectItem key={key} value={key}>
              {MUSCLE_GROUP_LABELS[key]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Category */}
      <Select
        value={filters.category || 'all'}
        onValueChange={(v) => handleDropdown('category', v === 'all' ? '' : v)}
      >
        <SelectTrigger className="w-full sm:w-36">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Categories</SelectItem>
          {(Object.keys(EXERCISE_CATEGORY_LABELS) as ExerciseCategory[]).map((key) => (
            <SelectItem key={key} value={key}>
              {EXERCISE_CATEGORY_LABELS[key]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Equipment */}
      <Select
        value={filters.equipment || 'all'}
        onValueChange={(v) => handleDropdown('equipment', v === 'all' ? '' : v)}
      >
        <SelectTrigger className="w-full sm:w-40">
          <SelectValue placeholder="Equipment" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Equipment</SelectItem>
          {(Object.keys(EQUIPMENT_LABELS) as Equipment[]).map((key) => (
            <SelectItem key={key} value={key}>
              {EQUIPMENT_LABELS[key]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Difficulty */}
      <Select
        value={filters.difficulty || 'all'}
        onValueChange={(v) => handleDropdown('difficulty', v === 'all' ? '' : v)}
      >
        <SelectTrigger className="w-full sm:w-36">
          <SelectValue placeholder="Difficulty" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Levels</SelectItem>
          <SelectItem value="BEGINNER">Beginner</SelectItem>
          <SelectItem value="INTERMEDIATE">Intermediate</SelectItem>
          <SelectItem value="ADVANCED">Advanced</SelectItem>
        </SelectContent>
      </Select>

      {/* Clear — only visible when at least one filter is active */}
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={handleClear} className="gap-1.5">
          <X className="h-3.5 w-3.5" />
          Clear
        </Button>
      )}
    </div>
  );
}
