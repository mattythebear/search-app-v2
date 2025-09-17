// app/lib/search-types.ts
export interface Product {
  id: number;
  sku: string;
  name: string;
  brand?: string;
  price?: number;
  sale_price?: number;
  sales_count?: number;
  rating_avg?: number;
  category?: string;
  category_l1?: string;
  category_l2?: string;
  category_l3?: string;
  category_l4?: string;
  gallery?: any[];
  description?: string;
  manufacturer?: string;
  food_properties?: string;
  is_in_stock?: boolean;
  score?: number;
  slug?: string;
  vector_distance?: number;
  mpn?: string;
  gtin?: string;
  upc?: string;
  product_id?: string;
}

export enum SearchStrategy {
  EXACT_MATCH = 'exact',
  SEMANTIC = 'semantic',
  KEYWORD = 'keyword'
}

export interface SearchContext {
  categories: string[];
  attributes: string[];
  intents: string[];
  descriptors: string[];
  confidence: number;
  originalQuery: string;
  unmatchedTokens?: string[];
}

export interface AnalysisResult {
  strategy: SearchStrategy;
  confidence: number;
  identifierType: string | null;
  context: SearchContext | null;
  suggestedChips: string[];
  queryTerms: string[];
}

export interface SearchOptions {
  query: string;
  queryEmbedding?: number[];
  salesBoost: number;
  limit?: number;
  filters?: string;
  page?: number;
  collection?: string;
  exactFields?: string[];
}

export interface SearchResponse {
  success: boolean;
  results: Product[];
  count: number;
  searchTime?: number;
  strategy?: SearchStrategy;
  suggestedChips?: string[];
  error?: string;
}

export interface Collection {
  id: string;
  name: string;
  documentsCount?: number;
  fields?: number;
}

export interface SearchParameters {
  salesBoost: number;
  relevanceThreshold: number;
  stockPriority: boolean;
  priceConsideration: number;
  brandBoost: number;
  recencyFactor: number;
}