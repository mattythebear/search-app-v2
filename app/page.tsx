'use client';

import { useState, useCallback, useEffect } from 'react';
import { Search, Sparkles, Zap, Shuffle, AlertCircle, Info } from 'lucide-react';
import SearchBar from './components/SearchBar';
import ProductCard from './components/ProductCard';
import type { Product, SearchResponse } from './lib/search-types';

export default function SearchPage() {
  const [results, setResults] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchType, setSearchType] = useState<'keyword' | 'semantic' | 'hybrid'>('hybrid');
  const [salesBoost, setSalesBoost] = useState(0.5);
  const [showScores, setShowScores] = useState(false);
  const [searchTime, setSearchTime] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [healthStatus, setHealthStatus] = useState<'checking' | 'healthy' | 'unhealthy'>('checking');

  // Check health on mount
  useEffect(() => {
    fetch('/api/health')
      .then(res => res.json())
      .then(data => setHealthStatus(data.status === 'healthy' ? 'healthy' : 'unhealthy'))
      .catch(() => setHealthStatus('unhealthy'));
  }, []);

  // Re-run search if switching search type
  useEffect(() => {
    handleSearch(searchTerm);
  }, [searchType, salesBoost]);

  const handleSearch = useCallback(async (query: string) => {
    setLoading(true);
    setError('');
    setHasSearched(true);
    setSearchTerm(query);

    try {
      let queryEmbedding: number[] | undefined;

      // Generate embedding for semantic/hybrid search
      if (searchType === 'semantic' || searchType === 'hybrid') {
        try {
          const embeddingResponse = await fetch('/api/embeddings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query }),
          });

          if (embeddingResponse.ok) {
            const embeddingData = await embeddingResponse.json();
            queryEmbedding = embeddingData.embedding;
          }
        } catch (err) {
          console.error('Failed to generate embedding:', err);
        }
      }

      // Perform search
      const searchResponse = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          queryEmbedding,
          searchType,
          salesBoost,
          limit: 24,
        }),
      });

      const data: SearchResponse = await searchResponse.json();

      if (data.success) {
        setResults(data.results);
        setSearchTime(data.searchTime || 0);
      } else {
        throw new Error(data.error || 'Search failed');
      }
    } catch (err: any) {
      setError(err.message || 'Search failed');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [searchType, salesBoost]);

  const exampleSearches = [
    'organic snacks',
    'chocolate chip cookies',
    'gluten free pasta',
    'coffee beans',
    'kitchen equipment',
    'paper plates',
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">FSD Quick-N-Dirty AI Search Test</h1>
              <p className="text-gray-600 mt-2">AI-powered semantic search with variable (sales-kitch 24/7) boost vs what we currently have</p>
            </div>
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${
                healthStatus === 'healthy' ? 'bg-green-500' : 
                healthStatus === 'unhealthy' ? 'bg-red-500' : 
                'bg-yellow-500'
              }`} />
              <span className="text-sm text-gray-600">
                {healthStatus === 'healthy' ? 'Connected' : 
                 healthStatus === 'unhealthy' ? 'Disconnected' : 
                 'Checking...'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Search Controls */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <SearchBar onSearch={handleSearch} onQueryChange={setSearchTerm} loading={loading} />
          
          {/* Example searches */}
          {!hasSearched && (
            <div className="mt-4">
              <p className="text-sm text-gray-600 mb-2">Try searching for:</p>
              <div className="flex flex-wrap gap-2">
                {exampleSearches.map((example) => (
                  <button
                    key={example}
                    onClick={() => handleSearch(example)}
                    className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-full hover:bg-gray-200 transition-colors"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Search Settings */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Search Settings</h3>
          
          <div className="space-y-4">
            {/* Search Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search Type
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setSearchType('keyword')}
                  className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                    searchType === 'keyword'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <Search size={16} />
                  <span className="text-sm">Keyword (Current)</span>
                </button>
                
                <button
                  onClick={() => setSearchType('semantic')}
                  className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                    searchType === 'semantic'
                      ? 'bg-green-600 text-white border-green-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <Sparkles size={16} />
                  <span className="text-sm">Semantic (AI overlord)</span>
                </button>
                
                <button
                  onClick={() => setSearchType('hybrid')}
                  className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                    searchType === 'hybrid'
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <Shuffle size={16} />
                  <span className="text-sm">Hybrid (Best? or Worst? of both)</span>
                </button>
              </div>
            </div>

            {/* Sales Boost */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Sales Boost: {salesBoost.toFixed(1)}x
              </label>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={salesBoost}
                onChange={(e) => setSalesBoost(parseFloat(e.target.value))}
                className="w-full"
                disabled={searchType === 'keyword'}
              />
              <p className="text-xs text-gray-500 mt-1">
                {searchType === 'keyword' 
                  ? 'Sales boost is built into keyword search'
                  : salesBoost === 0 
                  ? 'Pure relevance ranking'
                  : salesBoost < 1 
                  ? 'Slightly favor popular items'
                  : salesBoost === 1 
                  ? 'Balance relevance and popularity'
                  : 'Strongly favor best-sellers'}
              </p>
            </div>

            {/* Show Scores */}
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">
                Show Relevance Scores
              </label>
              <button
                onClick={() => setShowScores(!showScores)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  showScores ? 'bg-blue-600' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    showScores ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Info Box */}
          <div className="mt-4 p-3 bg-blue-50 rounded-lg flex gap-2">
            <Info size={16} className="text-blue-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-blue-700">
              {searchType === 'keyword' && (
                <>Traditional text matching on product names, brands, and descriptions. Results sorted by relevance and sales. (remember that Kitch 24/7 get artificial sales boost)</>
              )}
              {searchType === 'semantic' && (
                <>AI-powered understanding using embeddings. Finds conceptually similar products without exact keyword matches.</>
              )}
              {searchType === 'hybrid' && (
                <>Combines keyword and semantic search for an attempt at the best of both worlds. Tries to balance exact matches with conceptual similarity.</>
              )}
            </p>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-center gap-2">
            <AlertCircle className="text-red-600" size={20} />
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* Search Stats */}
        {hasSearched && !loading && !error && (
          <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
              <span>
                Found <strong>{results.length}</strong> results
              </span>
              {searchTime > 0 && (
                <span>
                  in <strong>{searchTime.toFixed(2)}</strong> seconds
                </span>
              )}
              <span>
                using <strong>{searchType}</strong> search
              </span>
            </div>
          </div>
        )}

        {/* Results Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="bg-white rounded-lg shadow-md p-4 animate-pulse">
                <div className="bg-gray-200 h-48 rounded mb-3"></div>
                <div className="h-4 bg-gray-200 rounded mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-2/3"></div>
              </div>
            ))}
          </div>
        ) : results.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {results.map((product) => (
              <ProductCard
                key={product.sku}
                product={product}
                showScore={showScores}
              />
            ))}
          </div>
        ) : hasSearched && !error ? (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <Search size={48} className="mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">
              No results found
            </h3>
            <p className="text-gray-500">
              Try adjusting your search query or changing the search type
            </p>
          </div>
        ) : !hasSearched ? (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <Sparkles size={48} className="mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">
              Ready to Search
            </h3>
            <p className="text-gray-500">
              Enter a search query above or try one of the examples
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
