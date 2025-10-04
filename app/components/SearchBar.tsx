'use client';

import { useState, useEffect } from 'react';
import { Search, Loader2 } from 'lucide-react';
import VoiceSearch from './VoiceSearch';

interface SearchBarProps {
  onSearch: (query: string) => void;
  onQueryChange: (query: string) => void;
  loading?: boolean;
  placeholder?: string;
}

export default function SearchBar({ 
  onSearch, 
  onQueryChange, 
  loading = false, 
  placeholder = "Search products..." 
}: SearchBarProps) {
  const [query, setQuery] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query);
    }
  };

  const handleVoiceTranscript = (transcript: string) => {
    // Update the search bar as user speaks
    setQuery(transcript);
  };

  const handleVoiceSearch = (transcript: string) => {
    // Execute search with final transcript
    setQuery(transcript);
    if (transcript.trim()) {
      onSearch(transcript);
    }
  };

  // Re-run search if switching search type
  useEffect(() => {
    onQueryChange(query.trim());
  }, [query, onQueryChange]);

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full px-4 py-3 pr-24 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={loading}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          <VoiceSearch 
            onTranscript={handleVoiceTranscript}
            onSearch={handleVoiceSearch}
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="p-2 text-gray-500 hover:text-blue-600 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <Search size={20} />
            )}
          </button>
        </div>
      </div>
    </form>
  );
}