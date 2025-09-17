// app/components/PromptChips.tsx
'use client';

import { Plus } from 'lucide-react';

interface PromptChipsProps {
  chips: string[];
  onChipClick: (chip: string) => void;
}

export default function PromptChips({ chips, onChipClick }: PromptChipsProps) {
  if (chips.length === 0) return null;

  return (
    <div className="mt-4">
      <p className="text-xs text-gray-500 mb-2">Refine your search:</p>
      <div className="flex flex-wrap gap-2">
        {chips.map((chip, index) => (
          <button
            key={`${chip}-${index}`}
            onClick={() => onChipClick(chip)}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 text-sm rounded-full hover:bg-blue-100 transition-colors group"
          >
            <Plus className="w-3 h-3 text-blue-500 group-hover:text-blue-700" />
            <span>{chip}</span>
          </button>
        ))}
      </div>
    </div>
  );
}