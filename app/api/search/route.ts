import { NextRequest, NextResponse } from 'next/server';
import { getTypesenseClient, COLLECTION_NAME } from '@/app/lib/typesense-config';
import type { Product, SearchOptions, SearchResponse } from '@/app/lib/search-types';

const client = getTypesenseClient();
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

    let results: Product[] = [];

    switch (options.searchType) {
      case 'keyword':
        results = await performKeywordSearch(options);
        break;
      case 'semantic':
        results = await performSemanticSearch(options);
        break;
      case 'hybrid':
        results = await performHybridSearch(options);
        break;
      default:
        results = await performKeywordSearch(options);
    }

    const searchTime = (Date.now() - startTime) / 1000;

    return NextResponse.json({
      success: true,
      results,
      count: results.length,
      searchTime
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

async function performKeywordSearch(options: SearchOptions): Promise<Product[]> {
  try {
    const searchParams: any = {
      q: options.query || '*',
      query_by: 'name,category,description,category_l4,category_l3,category_l2,category_l1,manufacturer,brand',
      sort_by: '_eval(is_in_stock:true):desc,sales_count:desc,_text_match:desc',
      per_page: options.limit,
      page: options.page || 1,
      exclude_fields: 'embedding,embedding_text'
    };

    if (options.filters) {
      searchParams.filter_by = options.filters;
    }

    const searchResult = await client
      .collections(COLLECTION_NAME)
      .documents()
      .search(searchParams);

    return searchResult.hits?.map(hit => ({
      ...(hit.document as Product),
      score: hit.text_match || 0,
    })) || [];
  } catch (error) {
    console.error('Keyword search error:', error);
    throw error;
  }
}

async function performSemanticSearch(options: SearchOptions): Promise<Product[]> {
  if (!options.queryEmbedding || options.queryEmbedding.length === 0) {
    console.log('No embedding provided, falling back to keyword search');
    return performKeywordSearch(options);
  }

  try {
    console.log('Performing semantic search with embedding dimensions:', options.queryEmbedding.length);
    
    // Method 1: Try using the Typesense client's multiSearch with proper format
    try {
      const searchRequests = {
        searches: [
          {
            collection: COLLECTION_NAME,
            q: '*',
            query_by: 'name',  // Required even for vector search
            vector_query: `embedding:([${options.queryEmbedding.join(',')}], k:${options.limit || 24})`,
            exclude_fields: 'embedding,embedding_text',
            per_page: options.limit || 24,
            filter_by: options.filters || undefined
          }
        ]
      };

      // Use the Typesense client's multiSearch method
      const results = await client.multiSearch.perform(searchRequests, {});
      
      if (results.results && results.results[0] && (results.results[0] as any).hits) {
        const searchResult = results.results[0];
        
        // Apply sales boost
        const products = (searchResult as any).hits.map((hit: any) => {
          const product = hit.document as Product;
          const vectorScore = hit.vector_distance || 0;
          const salesScore = product.sales_count || 0;
          const normalizedSales = Math.log10(salesScore + 1);
          const combinedScore = (1 / (1 + vectorScore)) * (1 + (normalizedSales * options.salesBoost));
          
          return {
            ...product,
            vector_distance: vectorScore,
            score: combinedScore,
          };
        });

        // Re-sort by combined score
        products.sort((a: Product, b: Product) => (b.score || 0) - (a.score || 0));
        return products;
      }
      
      return [];
      
    } catch (error1: any) {
      console.error('Multi-search failed:', error1.message);
      
      // Method 2: Try direct API call with compressed embedding
      try {
        console.log('Trying compressed embedding approach...');
        
        // Compress embedding to reduce size (reduce precision)
        const compressedEmbedding = options.queryEmbedding.map(v => 
          Math.round(v * 10000) / 10000  // Keep 4 decimal places
        );
        
        // Build the vector query string in chunks to avoid issues
        const vectorStr = compressedEmbedding.join(',');
        
        // Try chunked approach if still too large
        if (vectorStr.length > 7000) {
          console.log('Embedding too large, using truncated version');
          // Use only first 768 dimensions (usually captures most information)
          const truncatedEmbedding = compressedEmbedding.slice(0, 768);
          
          const searchParams: any = {
            q: '*',
            query_by: 'name',  // Required field
            vector_query: `embedding:([${truncatedEmbedding.join(',')}], k:${options.limit || 24})`,
            exclude_fields: 'embedding,embedding_text',
            per_page: options.limit || 24
          };

          if (options.filters) {
            searchParams.filter_by = options.filters;
          }

          const searchResult = await client
            .collections(COLLECTION_NAME)
            .documents()
            .search(searchParams);

          return searchResult.hits?.map(hit => ({
            ...(hit.document as Product),
            score: (hit as any).vector_distance || 0,
          })) || [];
        }
        
        // Try with compressed full embedding
        const searchParams: any = {
          q: '*',
          query_by: 'name',
          vector_query: `embedding:([${compressedEmbedding.join(',')}], k:${options.limit || 24})`,
          exclude_fields: 'embedding,embedding_text',
          per_page: options.limit || 24
        };

        if (options.filters) {
          searchParams.filter_by = options.filters;
        }

        const searchResult = await client
          .collections(COLLECTION_NAME)
          .documents()
          .search(searchParams);

        return searchResult.hits?.map(hit => ({
          ...(hit.document as Product),
          score: (hit as any).vector_distance || 0,
        })) || [];
        
      } catch (error2: any) {
        console.error('Compressed embedding search failed:', error2.message);
        
        // Method 3: Final fallback - use HTTP API directly with POST body
        try {
          console.log('Trying direct HTTP API with POST body...');
          
          const protocol = process.env.TYPESENSE_PROTOCOL || 'http';
          const host = process.env.TYPESENSE_HOST || 'localhost';
          const port = process.env.TYPESENSE_PORT || '8108';
          const path = process.env.TYPESENSE_PATH || '';
          const apiKey = process.env.TYPESENSE_API_KEY || '';
          
          // Use single collection search endpoint with POST
          const url = `${protocol}://${host}:${port}${path}/collections/${COLLECTION_NAME}/documents/search`;
          
          const searchBody = {
            q: '*',
            query_by: 'name',
            vector_query: {
              'embedding': options.queryEmbedding,  // Send full array in body
              'k': options.limit || 24
            },
            exclude_fields: 'embedding,embedding_text',
            per_page: options.limit || 24,
            filter_by: options.filters || undefined
          };
          
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-TYPESENSE-API-KEY': apiKey
            },
            body: JSON.stringify(searchBody)
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error('Direct API error:', response.status, errorText);
            throw new Error(`API error: ${response.status}`);
          }
          
          const searchResult = await response.json();
          
          if (searchResult.hits) {
            const products = searchResult.hits.map((hit: any) => {
              const product = hit.document as Product;
              const vectorScore = hit.vector_distance || 0;
              const salesScore = product.sales_count || 0;
              const normalizedSales = Math.log10(salesScore + 1);
              const combinedScore = (1 / (1 + vectorScore)) * (1 + (normalizedSales * options.salesBoost));
              
              return {
                ...product,
                vector_distance: vectorScore,
                score: combinedScore,
              };
            });
            
            products.sort((a: Product, b: Product) => (b.score || 0) - (a.score || 0));
            return products;
          }
          
          return [];
          
        } catch (error3: any) {
          console.error('Direct API search failed:', error3.message);
          
          // Final fallback to keyword search
          console.log('All vector search methods failed, falling back to keyword search');
          return performKeywordSearch(options);
        }
      }
    }
    
  } catch (error: any) {
    console.error('Semantic search error:', error);
    return performKeywordSearch(options);
  }
}

async function performHybridSearch(options: SearchOptions): Promise<Product[]> {
  try {
    // Run both searches in parallel
    const [keywordResults, semanticResults] = await Promise.allSettled([
      performKeywordSearch(options),
      options.queryEmbedding && options.queryEmbedding.length > 0
        ? performSemanticSearch(options)
        : Promise.resolve([])
    ]);

    const keywordData = keywordResults.status === 'fulfilled' ? keywordResults.value : [];
    const semanticData = semanticResults.status === 'fulfilled' ? semanticResults.value : [];

    // If semantic search failed, just return keyword results
    if (semanticData.length === 0) {
      console.log('No semantic results, returning keyword results only');
      return keywordData;
    }
    
    if (keywordData.length === 0) {
      console.log('No keyword results, returning semantic results only');
      return semanticData;
    }

    // Combine results
    const productMap = new Map<string, Product>();
    
    // Add keyword results (50% weight)
    keywordData.forEach(product => {
      productMap.set(product.sku, {
        ...product,
        score: (product.score || 0) * 0.5,
      });
    });

    // Add or merge semantic results (50% weight)
    semanticData.forEach(product => {
      const existing = productMap.get(product.sku);
      if (existing) {
        existing.score = (existing.score || 0) + ((product.score || 0) * 0.5);
      } else {
        productMap.set(product.sku, {
          ...product,
          score: (product.score || 0) * 0.5,
        });
      }
    });

    // Convert to array and sort
    const results = Array.from(productMap.values());
    results.sort((a, b) => (b.score || 0) - (a.score || 0));

    return results.slice(0, options.limit);
  } catch (error) {
    console.error('Hybrid search error:', error);
    return performKeywordSearch(options);
  }
}

// // ===== Utility: Test Vector Search Configuration =====
// export async function testVectorSearch() {
//   try {
//     // Get a sample product with embedding
//     const sampleResult = await client
//       .collections(COLLECTION_NAME)
//       .documents()
//       .search({
//         q: '*',
//         query_by: 'name',
//         per_page: 1,
//         include_fields: 'sku,name,embedding'
//       });
    
//     if (sampleResult.hits.length > 0 && sampleResult.hits[0].document.embedding) {
//       const testEmbedding = sampleResult.hits[0].document.embedding;
//       console.log('Test embedding dimensions:', testEmbedding.length);
      
//       // Try a simple vector search
//       const testSearch = await client
//         .collections(COLLECTION_NAME)
//         .documents()
//         .search({
//           q: '*',
//           query_by: 'name',
//           vector_query: `embedding:([${testEmbedding.slice(0, 100).join(',')}...], k:5)`,
//           per_page: 5
//         });
      
//       console.log('Vector search test successful, found:', testSearch.hits.length);
//       return true;
//     }
    
//     console.log('No products with embeddings found');
//     return false;
    
//   } catch (error: any) {
//     console.error('Vector search test failed:', error.message);
//     return false;
//   }
// }