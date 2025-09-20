'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import type { Collection } from '@/app/lib/search-types';

interface CollectionSelectorProps {
  collections: Collection[];
  selected: Collection;
  onChange: (collection: Collection) => void;
}

// Helper function to get flag emoji based on collection name
function getCollectionFlag(name: string): string {
  if (!name) return '🌐';
  if (name.includes('US')) return '🇺🇸';
  if (name.includes('CA')) return '🇨🇦';
  return '🌐'; // Generic globe for collections without country code
}

// Helper function to format collection name with flag
function formatCollectionName(name: string): string {
  if (!name) return 'Select Collection';
  return name;
}

export default function CollectionSelector({
  collections,
  selected,
  onChange
}: CollectionSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter collections to only show those with "_copy" in the name
  const filteredCollections = collections.filter(
    collection => collection.name?.includes('_copy')
  );

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

  // If no collections match the filter, show a message
  if (filteredCollections.length === 0) {
    return (
      <div className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm">
        No collections available
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <span className="text-lg">{getCollectionFlag(selected.name)}</span>
        <span className="text-sm font-medium text-gray-700">
          {formatCollectionName(selected.name)}
        </span>
        <ChevronDown 
          className={`w-4 h-4 text-gray-500 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`} 
        />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-96 overflow-y-auto">
          <div className="py-1">
            {filteredCollections.map((collection) => (
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
                <div className="flex items-center gap-2">
                  <span className="text-lg">{getCollectionFlag(collection.name)}</span>
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {formatCollectionName(collection.name)}
                    </span>
                    {collection.documentsCount !== undefined && (
                      <span className="text-xs text-gray-500">
                        {collection.documentsCount.toLocaleString()} products
                      </span>
                    )}
                  </div>
                </div>
                {selected.id === collection.id && (
                  <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}