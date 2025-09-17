// app/page.tsx
'use client';

import { useState, useCallback, useEffect } from 'react';
import { 
  Search, 
  Sparkles, 
  AlertCircle, 
  Info, 
  TrendingUp,
  Sliders,
  ChevronDown,
  Package,
  Zap
} from 'lucide-react';
import SearchBar from './components/SearchBar';
import ProductCard from './components/ProductCard';
import PromptChips from './components/PromptChips';
import CollectionSelector from './components/CollectionSelector';
import type { Product, SearchResponse, Collection } from './lib/search-types';
import { SearchStrategy } from './lib/search-types';

const COLLECTIONS: Collection[] = [
  { id: 'all', name: 'All Products' },
  { id: 'food', name: 'Food & Beverages' },
  { id: 'paper', name: 'Paper Products' },
  { id: 'equipment', name: 'Kitchen Equipment' },
  { id: 'cleaning', name: 'Cleaning Supplies' },
  { id: 'disposables', name: 'Disposables' },
  { id: 'sale', name: 'On Sale' },
];

export default function SearchPage() {
  const [results, setResults] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [salesBoost, setSalesBoost] = useState(0.5);
  const [showScores, setShowScores] = useState(false);
  const [searchTime, setSearchTime] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [healthStatus, setHealthStatus] = useState<'checking' | 'healthy' | 'unhealthy'>('checking');
  const [selectedCollection, setSelectedCollection] = useState<Collection>(COLLECTIONS[0]);
  const [searchStrategy, setSearchStrategy] = useState<SearchStrategy | null>(null);
  const [suggestedChips, setSuggestedChips] = useState<string[]>([]);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  
  // Additional advanced parameters
  const [stockPriority, setStockPriority] = useState(true);
  const [relevanceThreshold, setRelevanceThreshold] = useState(0.3);

  // Check health on mount
  useEffect(() => {
    fetch('/api/health')
      .then(res => res.json())
      .then(data => setHealthStatus(data.status === 'healthy' ? 'healthy' : 'unhealthy'))
      .catch(() => setHealthStatus('unhealthy'));
  }, []);

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) return;

    setLoading(true);
    setError('');
    setHasSearched(true);
    setSearchTerm(query);

    try {
      let queryEmbedding: number[] | undefined;

      // Generate embedding for potential semantic search
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

      // Perform intelligent search
      const searchResponse = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          queryEmbedding,
          salesBoost,
          limit: 24,
          collection: selectedCollection.id,
          filters: stockPriority ? undefined : null
        }),
      });

      const data: SearchResponse = await searchResponse.json();

      if (data.success) {
        setResults(data.results);
        setSearchTime(data.searchTime || 0);
        setSearchStrategy(data.strategy || null);
        setSuggestedChips(data.suggestedChips || []);
      } else {
        throw new Error(data.error || 'Search failed');
      }
    } catch (err: any) {
      setError(err.message || 'Search failed');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [salesBoost, selectedCollection, stockPriority]);

  const handleChipClick = (chip: string) => {
    const newQuery = `${searchTerm} ${chip}`.trim();
    setSearchTerm(newQuery);
    handleSearch(newQuery);
  };

  const exampleSearches = [
    'chocolate chip cookies',
    'SKU123456',
    'organic pasta',
    'paper plates bulk',
    'coffee beans',
    'P-12345',
  ];

  const getStrategyIcon = () => {
    switch (searchStrategy) {
      case 'exact':
        return <Zap className="w-4 h-4 text-blue-600" />;
      case 'semantic':
        return <Sparkles className="w-4 h-4 text-purple-600" />;
      case 'keyword':
        return <Search className="w-4 h-4 text-green-600" />;
      default:
        return null;
    }
  };

  const getStrategyLabel = () => {
    switch (searchStrategy) {
      case 'exact':
        return 'Exact Match';
      case 'semantic':
        return 'AI Search';
      case 'keyword':
        return 'Text Search';
      default:
        return '';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold text-gray-900">Smart Product Search</h1>
              <CollectionSelector
                collections={COLLECTIONS}
                selected={selectedCollection}
                onChange={setSelectedCollection}
              />
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
        {/* Search Bar and Examples */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <SearchBar 
            onSearch={handleSearch} 
            onQueryChange={setSearchTerm} 
            loading={loading} 
          />
          
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

          {/* Suggested refinements */}
          {hasSearched && suggestedChips.length > 0 && (
            <PromptChips 
              chips={suggestedChips} 
              onChipClick={handleChipClick} 
            />
          )}
        </div>

        {/* Advanced Settings */}
        <div className="bg-white rounded-lg shadow-md mb-6 overflow-hidden">
          <button
            onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Sliders className="w-5 h-5 text-gray-600" />
              <span className="font-semibold text-gray-900">Search Settings</span>
            </div>
            <ChevronDown 
              className={`w-5 h-5 text-gray-600 transition-transform ${
                showAdvancedSettings ? 'rotate-180' : ''
              }`} 
            />
          </button>
          
          {showAdvancedSettings && (
            <div className="px-6 pb-6 space-y-4 border-t">
              {/* Sales Boost */}
              <div className="pt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sales Popularity Weight: {salesBoost.toFixed(1)}x
                </label>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={salesBoost}
                  onChange={(e) => setSalesBoost(parseFloat(e.target.value))}
                  className="w-full"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {salesBoost === 0 
                    ? 'Pure relevance ranking'
                    : salesBoost < 1 
                    ? 'Slightly favor popular items'
                    : salesBoost === 1 
                    ? 'Balance relevance and popularity'
                    : 'Strongly favor best-sellers'}
                </p>
              </div>

              {/* Stock Priority */}
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">
                  Show Out-of-Stock Items Last
                </label>
                <button
                  onClick={() => setStockPriority(!stockPriority)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    stockPriority ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      stockPriority ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
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
          )}
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
              {searchStrategy && (
                <div className="flex items-center gap-1">
                  {getStrategyIcon()}
                  <span>
                    using <strong>{getStrategyLabel()}</strong>
                  </span>
                </div>
              )}
              {selectedCollection.id !== 'all' && (
                <span>
                  in <strong>{selectedCollection.name}</strong>
                </span>
              )}
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
            <Package size={48} className="mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">
              No results found
            </h3>
            <p className="text-gray-500">
              Try adjusting your search or selecting a different collection
            </p>
          </div>
        ) : !hasSearched ? (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <Sparkles size={48} className="mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">
              Intelligent Search Ready
            </h3>
            <p className="text-gray-500 mb-4">
              Our smart search automatically understands product codes, descriptions, and context
            </p>
            <div className="flex items-center justify-center gap-6 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-blue-600" />
                <span>Exact Match</span>
              </div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-600" />
                <span>AI Understanding</span>
              </div>
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-green-600" />
                <span>Text Search</span>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}