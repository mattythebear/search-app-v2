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
}

export interface SearchOptions {
  query: string;
  queryEmbedding?: number[];
  searchType: 'keyword' | 'semantic' | 'hybrid';
  salesBoost: number;
  limit?: number;
  filters?: string;
  page?: number;
}

export interface SearchResponse {
  success: boolean;
  results: Product[];
  count: number;
  searchTime?: number;
  error?: string;
}
