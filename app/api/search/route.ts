// app/api/search/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getTypesenseClient, COLLECTION_NAME } from '@/app/lib/typesense-config';
import { SearchAnalyzer } from '@/app/lib/search-analyzer';
import type { 
  Product, 
  SearchOptions, 
  SearchResponse,
  AnalysisResult 
} from '@/app/lib/search-types';
import { SearchStrategy } from '@/app/lib/search-types';

const client = getTypesenseClient();
const analyzer = new SearchAnalyzer();
const DEFAULT_LIMIT = parseInt(process.env.DEFAULT_SEARCH_LIMIT || '24');
const MAX_LIMIT = parseInt(process.env.MAX_SEARCH_LIMIT || '100');

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const body = await request.json();
    const options: SearchOptions = {
      ...body,
      limit: Math.min(body.limit || DEFAULT_LIMIT, MAX_LIMIT)
    };

    // Analyze the query to determine search strategy
    const analysis = analyzer.analyze(options.query);
    console.log('Query analysis:', {
      query: options.query,
      strategy: analysis.strategy,
      confidence: analysis.confidence,
      identifierType: analysis.identifierType
    });

    let results: Product[] = [];

    // Execute search based on determined strategy
    switch (analysis.strategy) {
      case SearchStrategy.EXACT_MATCH:
        results = await performExactMatchSearch(options, analysis);
        break;
      case SearchStrategy.SEMANTIC:
        results = await performSemanticSearch(options);
        break;
      case SearchStrategy.KEYWORD:
      default:
        results = await performKeywordSearch(options);
        break;
    }

    // Apply stock status sorting (out-of-stock items last)
    results = sortByStockStatus(results);

    const searchTime = (Date.now() - startTime) / 1000;

    return NextResponse.json({
      success: true,
      results,
      count: results.length,
      searchTime,
      strategy: analysis.strategy,
      suggestedChips: analysis.suggestedChips,
    } as SearchResponse);

  } catch (error: any) {
    console.error('Search API error:', error);
    return NextResponse.json(
      {
        success: false,
        results: [],
        count: 0,
        error: error.message
      } as SearchResponse,
      { status: 500 }
    );
  }
}

async function performExactMatchSearch(
  options: SearchOptions, 
  analysis: AnalysisResult
): Promise<Product[]> {
  try {
    const identifierFields = ['sku', 'mpn', 'gtin', 'upc', 'product_id'];
    const searchQuery = options.query.toUpperCase();
    
    // Build filter for exact match across identifier fields
    const filterParts = identifierFields.map(field => 
      `${field}:=${searchQuery}`
    ).join(' || ');

    const searchParams: any = {
      q: '*',
      query_by: 'name', // Required field
      filter_by: filterParts,
      per_page: options.limit,
      page: options.page || 1,
      exclude_fields: 'embedding,embedding_text'
    };

    // Apply collection filter if specified
    if (options.collection && options.collection !== 'all') {
      searchParams.filter_by = `(${filterParts}) && collection:=${options.collection}`;
    }

    const searchResult = await client
      .collections(COLLECTION_NAME)
      .documents()
      .search(searchParams);

    // If no exact match found, try partial match on SKU/product fields
    if (!searchResult.hits || searchResult.hits.length === 0) {
      return performFallbackSearch(options);
    }

    return searchResult.hits?.map(hit => ({
      ...(hit.document as Product),
      score: 100, // High score for exact matches
    })) || [];
  } catch (error) {
    console.error('Exact match search error:', error);
    return performFallbackSearch(options);
  }
}

async function performKeywordSearch(options: SearchOptions): Promise<Product[]> {
  try {
    const searchParams: any = {
      q: options.query || '*',
      query_by: 'name,category,description,category_l4,category_l3,category_l2,category_l1,manufacturer,brand,sku',
      sort_by: `is_in_stock:desc,sales_count:desc,_text_match:desc`,
      per_page: options.limit,
      page: options.page || 1,
      exclude_fields: 'embedding,embedding_text',
      prefix: true,
      infix: 'fallback',
      drop_tokens_threshold: 0
    };

    // Apply collection filter if specified
    if (options.collection && options.collection !== 'all') {
      searchParams.filter_by = `collection:=${options.collection}`;
    }

    // Add any additional filters
    if (options.filters) {
      searchParams.filter_by = searchParams.filter_by 
        ? `${searchParams.filter_by} && ${options.filters}`
        : options.filters;
    }

    const searchResult = await client
      .collections(COLLECTION_NAME)
      .documents()
      .search(searchParams);

    return processSearchResults(searchResult.hits || [], options.salesBoost || 0.5);
  } catch (error) {
    console.error('Keyword search error:', error);
    throw error;
  }
}

async function performSemanticSearch(options: SearchOptions): Promise<Product[]> {
  // First check if we have embeddings
  if (!options.queryEmbedding || options.queryEmbedding.length === 0) {
    console.log('No embedding provided, falling back to keyword search');
    return performKeywordSearch(options);
  }

  try {
    // Try hybrid approach - combine keyword and semantic
    const [keywordResults, semanticResults] = await Promise.allSettled([
      performKeywordSearch(options),
      performVectorSearch(options)
    ]);

    const keyword = keywordResults.status === 'fulfilled' ? keywordResults.value : [];
    const semantic = semanticResults.status === 'fulfilled' ? semanticResults.value : [];

    // Merge results with weighted scoring
    return mergeSearchResults(keyword, semantic, options.salesBoost || 0.5);
  } catch (error) {
    console.error('Semantic search error:', error);
    return performKeywordSearch(options);
  }
}

async function performVectorSearch(options: SearchOptions): Promise<Product[]> {
  if (!options.queryEmbedding) return [];

  try {
    console.log('Performing vector search with embedding length:', options.queryEmbedding.length);
    
    // First, try with reduced precision to make the embedding smaller
    const reducedPrecisionEmbedding = options.queryEmbedding.map(v => 
      Math.round(v * 1000) / 1000  // Keep only 3 decimal places
    );
    
    // If still too large, truncate to 768 dimensions (usually captures most information)
    const embedding = reducedPrecisionEmbedding.length > 768 
      ? reducedPrecisionEmbedding.slice(0, 768)
      : reducedPrecisionEmbedding;
    
    console.log('Using embedding with length:', embedding.length);
    
    // Build the vector query string
    const k = options.limit || 24;
    const vectorQuery = `embedding:([${embedding.join(',')}], k:${k})`;
    
    const searchParams: any = {
      q: '*',
      query_by: 'name',
      vector_query: vectorQuery,
      exclude_fields: 'embedding,embedding_text',
      per_page: k
    };

    if (options.collection && options.collection !== 'all') {
      searchParams.filter_by = `collection:=${options.collection}`;
    }

    const searchResult = await client
      .collections(COLLECTION_NAME)
      .documents()
      .search(searchParams);

    return processSearchResults(searchResult.hits || [], options.salesBoost || 0.5);
    
  } catch (error: any) {
    console.error('Vector search failed:', error.message);
    
    // If it still fails due to size, try direct API call with POST
    if (error.message && (error.message.includes('414') || error.message.includes('URI'))) {
      console.log('Falling back to direct API call with POST...');
      return performVectorSearchViaAPI(options);
    }
    
    return [];
  }
}

async function performVectorSearchViaAPI(options: SearchOptions): Promise<Product[]> {
  if (!options.queryEmbedding) return [];
  
  try {
    const protocol = process.env.TYPESENSE_PROTOCOL || 'http';
    const host = process.env.TYPESENSE_HOST || 'localhost';
    const port = process.env.TYPESENSE_PORT || '8108';
    const path = process.env.TYPESENSE_PATH || '';
    const apiKey = process.env.TYPESENSE_API_KEY || '';
    
    // Use multi-search endpoint which supports POST with body
    const url = `${protocol}://${host}:${port}${path}/multi_search`;
    
    // Reduce embedding to 768 dimensions for reliability
    const embedding = options.queryEmbedding.slice(0, 768);
    
    const searchRequests = {
      searches: [
        {
          collection: COLLECTION_NAME,
          q: '*',
          query_by: 'name',
          vector_query: `embedding:([${embedding.join(',')}], k:${options.limit || 24})`,
          exclude_fields: 'embedding,embedding_text',
          per_page: options.limit || 24
        }
      ]
    };
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-TYPESENSE-API-KEY': apiKey
      },
      body: JSON.stringify(searchRequests)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Direct API error:', response.status, errorText);
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.results && data.results[0] && data.results[0].hits) {
      return processSearchResults(data.results[0].hits, options.salesBoost || 0.5);
    }
    
    return [];
    
  } catch (error) {
    console.error('Direct API vector search failed:', error);
    return [];
  }
}

async function performFallbackSearch(options: SearchOptions): Promise<Product[]> {
  try {
    // Fallback to a more lenient search
    const searchParams: any = {
      q: options.query,
      query_by: 'name,sku,mpn,manufacturer,brand',
      prefix: true,
      infix: 'always',
      per_page: options.limit,
      page: options.page || 1
    };

    const searchResult = await client
      .collections(COLLECTION_NAME)
      .documents()
      .search(searchParams);

    return searchResult.hits?.map(hit => ({
      ...(hit.document as Product),
      score: hit.text_match || 0,
    })) || [];
  } catch (error) {
    console.error('Fallback search error:', error);
    return [];
  }
}

function processSearchResults(hits: any[], salesBoost: number): Product[] {
  return hits.map(hit => {
    const product = hit.document as Product;
    const baseScore = hit.text_match || hit.vector_distance || 0;
    const salesScore = Math.log10((product.sales_count || 0) + 1);
    const combinedScore = baseScore * (1 + salesScore * salesBoost);
    
    return {
      ...product,
      score: combinedScore
    };
  });
}

function mergeSearchResults(
  keyword: Product[], 
  semantic: Product[], 
  salesBoost: number
): Product[] {
  const productMap = new Map<string, Product>();
  
  // Add keyword results with 40% weight
  keyword.forEach(product => {
    productMap.set(product.sku, {
      ...product,
      score: (product.score || 0) * 0.4
    });
  });

  // Add or merge semantic results with 60% weight
  semantic.forEach(product => {
    const existing = productMap.get(product.sku);
    if (existing) {
      existing.score = (existing.score || 0) + ((product.score || 0) * 0.6);
    } else {
      productMap.set(product.sku, {
        ...product,
        score: (product.score || 0) * 0.6
      });
    }
  });

  // Apply sales boost to final scores
  productMap.forEach(product => {
    const salesScore = Math.log10((product.sales_count || 0) + 1);
    product.score = (product.score || 0) * (1 + salesScore * salesBoost);
  });

  return Array.from(productMap.values())
    .sort((a, b) => (b.score || 0) - (a.score || 0));
}

function sortByStockStatus(products: Product[]): Product[] {
  return products.sort((a, b) => {
    // First sort by stock status
    if (a.is_in_stock !== b.is_in_stock) {
      return a.is_in_stock === false ? 1 : -1;
    }
    // Then by score
    return (b.score || 0) - (a.score || 0);
  });
}