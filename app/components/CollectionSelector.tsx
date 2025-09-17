// app/components/CollectionSelector.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import type { Collection } from '@/app/lib/search-types';

interface CollectionSelectorProps {
  collections: Collection[];
  selected: Collection;
  onChange: (collection: Collection) => void;
}

export default function CollectionSelector({
  collections,
  selected,
  onChange
}: CollectionSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <span className="text-sm font-medium text-gray-700">{selected.name}</span>
        <ChevronDown 
          className={`w-4 h-4 text-gray-500 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`} 
        />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
          <div className="py-1">
            {collections.map((collection) => (
              <button
                key={collection.id}
                onClick={() => {
                  onChange(collection);
                  setIsOpen(false);
                }}
                className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 transition-colors flex items-center justify-between ${
                  selected.id === collection.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                }`}
              >
                <span>{collection.name}</span>
                {selected.id === collection.id && (
                  <Check className="w-4 h-4 text-blue-600" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}