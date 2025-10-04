// app/api/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  getTypesenseClient,
  COLLECTION_NAME,
} from "@/app/lib/typesense-config";
import { SearchAnalyzer } from "@/app/lib/search-analyzer";
import type {
  ExtractedFilters,
  Product,
  SearchOptions,
  SearchResponse,
  AnalysisResult,
} from "@/app/lib/search-types";
import { SearchStrategy } from "@/app/lib/search-types";

const client = getTypesenseClient();
const analyzer = new SearchAnalyzer();
const DEFAULT_LIMIT = parseInt(process.env.DEFAULT_SEARCH_LIMIT || "24");
const MAX_LIMIT = parseInt(process.env.MAX_SEARCH_LIMIT || "100");

// Update your POST handler
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const options: SearchOptions = {
      ...body,
      limit: Math.min(body.limit || DEFAULT_LIMIT, MAX_LIMIT),
    };

    let analysis: AnalysisResult;
    let extractedFilters: ExtractedFilters = {};
    let cleanQuery = options.query;

    try {
      // Call the intent analysis endpoint
      const intentResponse = await fetch(
        `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/analyze-intent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: options.query }),
        }
      );

      if (intentResponse.ok) {
        const aiAnalysis = await intentResponse.json();
        
        // Extract filters from AI analysis
        extractedFilters = aiAnalysis.filters || {};
        cleanQuery = aiAnalysis.cleanQuery || options.query;

        analysis = {
          strategy: aiAnalysis.strategy as SearchStrategy,
          confidence: aiAnalysis.confidence,
          identifierType: aiAnalysis.strategy === "exact" ? "sku" : null,
          context: aiAnalysis.context,
          suggestedChips: aiAnalysis.suggestedTerms || [],
          queryTerms: cleanQuery.toLowerCase().split(/\s+/),
        };

        console.log("AI-powered query analysis:", {
          originalQuery: options.query,
          cleanQuery,
          extractedFilters,
          ...aiAnalysis,
        });
      } else {
        throw new Error("Intent analysis failed");
      }
    } catch (intentError) {
      console.error("Falling back to local analyzer:", intentError);
      analysis = analyzer.analyze(options.query);
    }

    // Build the filter string
    const filterString = buildFilterString(
      extractedFilters,
      options.filters,
      options.stockPriority
    );

    // Create updated options with clean query and filters
    const searchOptions: SearchOptions = {
      ...options,
      query: cleanQuery,
      filters: filterString, // This is the correct variable name
      extractedFilters, // Pass along for response
    };

    let results: Product[] = [];

    // Execute search based on determined strategy
    switch (analysis.strategy) {
      case SearchStrategy.EXACT_MATCH:
        results = await performExactMatchSearch(searchOptions, analysis);
        break;
      case SearchStrategy.SEMANTIC:
        results = await performSemanticSearch(searchOptions);
        break;
      case SearchStrategy.KEYWORD:
      default:
        results = await performKeywordSearch(searchOptions);
        break;
    }

    // Apply stock status sorting (out-of-stock items last)
    results = sortByStockStatus(results);

    const searchTime = (Date.now() - startTime) / 1000;

    const response: SearchResponse = {
      success: true,
      results,
      count: results.length,
      searchTime,
      strategy: analysis.strategy,
      suggestedChips: analysis.suggestedChips,
      appliedFilters: extractedFilters, // Include what filters were applied
    };

    if (analysis.context) {
      response.aiAnalysis = {
        strategy: analysis.strategy as string,
        confidence: analysis.confidence,
        context: analysis.context,
        suggestedTerms: analysis.suggestedChips,
        extractedFilters,
      };
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("Search API error:", error);
    return NextResponse.json(
      {
        success: false,
        results: [],
        count: 0,
        error: error.message,
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
    // Determine which collection to search
    const collectionName =
      options.collection && options.collection !== "all"
        ? options.collection
        : COLLECTION_NAME;

    const identifierFields = ["sku", "mpn", "gtin", "upc", "product_id"];
    const searchQuery = options.query.toUpperCase();

    // Build filter for exact match across identifier fields
    const filterParts = identifierFields
      .map((field) => `${field}:=${searchQuery}`)
      .join(" || ");

    const searchParams: any = {
      collection: collectionName,
      q: "*",
      query_by: "sku,gtin,upc,product_id,mpn",
      filter_by: filterParts,
      per_page: options.limit,
      page: options.page || 1,
      exclude_fields: "embedding,embedding_text",
    };

    // Add any additional filters
    if (options.filters) {
      searchParams.filter_by = `(${filterParts}) && ${options.filters}`;
    }

    // Use multi_search for consistency
    const searchRequests = {
      searches: [searchParams],
    };

    console.log(
      `Performing exact match search in collection: ${collectionName}`
    );
    const results = await client.multiSearch.perform(searchRequests);

    if (
      results.results &&
      results.results[0] &&
      (results.results[0] as any).hits &&
      (results.results[0] as any).hits.length > 0
    ) {
      return (results.results[0] as any).hits.map((hit: any) => ({
        ...(hit.document as Product),
        score: 100, // High score for exact matches
      }));
    }

    // If no exact match found, try partial match
    return performFallbackSearch(options);
  } catch (error) {
    console.error("Exact match search error:", error);
    return performFallbackSearch(options);
  }
}

async function performKeywordSearch(
  options: SearchOptions
): Promise<Product[]> {
  try {
    const collectionName =
      options.collection && options.collection !== "all"
        ? options.collection
        : COLLECTION_NAME;

    const searchParams: any = {
      collection: collectionName,
      q: options.query || "*",
      query_by:
        "name,category,description,category_l4,category_l3,category_l2,category_l1,manufacturer,brand,sku",
      sort_by: `is_in_stock:desc,sales_count:desc,_text_match:desc`,
      per_page: options.limit,
      page: options.page || 1,
      exclude_fields: "embedding,embedding_text",
      prefix: true,
      infix: "fallback",
      drop_tokens_threshold: 0,
    };

    // IMPORTANT: Apply the filters
    if (options.filters) {
      searchParams.filter_by = options.filters;
      console.log("Applying filters to keyword search:", options.filters);
    }

    const searchRequests = {
      searches: [searchParams],
    };

    console.log(
      `Performing keyword search in collection: ${collectionName} with params:`,
      searchParams
    );
    const results = await client.multiSearch.perform(searchRequests);

    if (
      results.results &&
      results.results[0] &&
      (results.results[0] as any).hits
    ) {
      const hits = (results.results[0] as any).hits;
      console.log(`Found ${hits.length} results`);
      return processSearchResults(hits, options.salesBoost || 0.5);
    }

    console.log("No results found");
    return [];
  } catch (error) {
    console.error("Keyword search error:", error);
    throw error;
  }
}

async function performSemanticSearch(
  options: SearchOptions
): Promise<Product[]> {
  // First check if we have embeddings
  if (!options.queryEmbedding || options.queryEmbedding.length === 0) {
    console.log("No embedding provided, falling back to keyword search");
    return performKeywordSearch(options);
  }

  try {
    console.log("Performing semantic search with AI-driven understanding");

    // Perform vector search
    const vectorResults = await performVectorSearch(options);

    // Perform enhanced keyword search (without concept extraction)
    const keywordResults = await performEnhancedKeywordSearch(options);

    // Merge results with simple weighting
    return mergeSemanticResults(
      vectorResults,
      keywordResults,
      options.salesBoost || 0.5
    );
  } catch (error) {
    console.error("Semantic search error:", error);
    return performKeywordSearch(options);
  }
}

async function performEnhancedKeywordSearch(
  options: SearchOptions
): Promise<Product[]> {
  try {
    const collectionName =
      options.collection && options.collection !== "all"
        ? options.collection
        : COLLECTION_NAME;

    const searchParams: any = {
      collection: collectionName,
      q: options.query,
      query_by: "name,category,description,brand,manufacturer",
      sort_by: `_text_match:desc,sales_count:desc`,
      per_page: options.limit || 24,
      page: options.page || 1,
      exclude_fields: "embedding,embedding_text",
      prefix: true,
      infix: "fallback",
      drop_tokens_threshold: 0,
      query_by_weights: "3,1,1,2,2", // Prioritize name and brand
    };

    // Add any filters
    if (options.filters) {
      searchParams.filter_by = options.filters;
    }

    const searchRequests = {
      searches: [searchParams],
    };

    const results = await client.multiSearch.perform(searchRequests);

    if (
      results.results &&
      results.results[0] &&
      (results.results[0] as any).hits
    ) {
      return processSearchResults(
        (results.results[0] as any).hits,
        options.salesBoost || 0.5
      );
    }

    return [];
  } catch (error) {
    console.error("Enhanced keyword search error:", error);
    return [];
  }
}

function mergeSemanticResults(
  vectorResults: Product[],
  keywordResults: Product[],
  salesBoost: number
): Product[] {
  const productMap = new Map<string, Product & { sources: Set<string> }>();

  // Helper to add products with source tracking
  const addProducts = (products: Product[], source: string, weight: number) => {
    products.forEach((product) => {
      const existing = productMap.get(product.sku);
      if (existing) {
        existing.score = (existing.score || 0) + (product.score || 0) * weight;
        existing.sources.add(source);
      } else {
        productMap.set(product.sku, {
          ...product,
          score: (product.score || 0) * weight,
          sources: new Set([source]),
        });
      }
    });
  };

  // Simple weighting: 60% vector, 40% keyword
  addProducts(vectorResults, "vector", 0.6);
  addProducts(keywordResults, "keyword", 0.4);

  // Boost products that appear in multiple search results
  productMap.forEach((product) => {
    if (product.sources.size > 1) {
      product.score = (product.score || 0) * 1.2; // 20% boost for appearing in both
    }
  });

  // Remove sources property and sort
  const finalResults = Array.from(productMap.values()).map(
    ({ sources, ...product }) => product
  );

  return finalResults.sort((a, b) => (b.score || 0) - (a.score || 0));
}

async function performVectorSearch(options: SearchOptions): Promise<Product[]> {
  if (!options.queryEmbedding) return [];

  try {
    const collectionName =
      options.collection && options.collection !== "all"
        ? options.collection
        : COLLECTION_NAME;

    console.log(
      `Performing vector search in collection: ${collectionName} with embedding length: ${options.queryEmbedding.length}`
    );

    // Option 1: Use string concatenation more efficiently
    // Instead of joining all at once, build the string in chunks
    const embedString = options.queryEmbedding
      .map((v) => v.toFixed(6)) // Use fixed precision to reduce size
      .join(",");

    // Build the search parameters for multi_search
    const searchParams: any = {
      collection: collectionName,
      q: "*",
      query_by: "name",
      // Don't build the vector_query as a string yet
      exclude_fields: "embedding,embedding_text",
      per_page: options.limit || 24,
    };

    // Add the vector query directly to avoid string building issues
    searchParams.vector_query = `embedding:([${embedString}], k:${
      options.limit || 24
    })`;

    if (options.filters) {
      searchParams.filter_by = options.filters;
    }

    const searchRequests = {
      searches: [searchParams],
    };

    const results = await client.multiSearch.perform(searchRequests);

    if (
      results.results &&
      results.results[0] &&
      (results.results[0] as any).hits
    ) {
      return processSearchResults(
        (results.results[0] as any).hits,
        options.salesBoost || 0.5
      );
    }

    return [];
  } catch (error: any) {
    console.error("Vector search failed:", error.message);

    // Only truncate as a last resort if the API absolutely can't handle it
    if (
      error.message &&
      error.message.includes("payload") &&
      options.queryEmbedding.length > 768
    ) {
      console.warn(
        "WARNING: Truncating embeddings due to API limitations - search quality will be degraded"
      );
      return performVectorSearch({
        ...options,
        queryEmbedding: options.queryEmbedding.slice(0, 768),
      });
    }

    return [];
  }
}

async function performFallbackSearch(
  options: SearchOptions
): Promise<Product[]> {
  try {
    // Determine which collection to search
    const collectionName =
      options.collection && options.collection !== "all"
        ? options.collection
        : COLLECTION_NAME;

    // Fallback to a more lenient search
    const searchParams: any = {
      collection: collectionName,
      q: options.query,
      query_by: "name,sku,mpn,manufacturer,brand",
      prefix: true,
      infix: "always",
      per_page: options.limit,
      page: options.page || 1,
      exclude_fields: "embedding,embedding_text",
    };

    // Add any additional filters
    if (options.filters) {
      searchParams.filter_by = options.filters;
    }

    // Use multi_search for consistency
    const searchRequests = {
      searches: [searchParams],
    };

    console.log(`Performing fallback search in collection: ${collectionName}`);
    const results = await client.multiSearch.perform(searchRequests);

    if (
      results.results &&
      results.results[0] &&
      (results.results[0] as any).hits
    ) {
      return (results.results[0] as any).hits.map((hit: any) => ({
        ...(hit.document as Product),
        score: hit.text_match || 0,
      }));
    }

    return [];
  } catch (error) {
    console.error("Fallback search error:", error);
    return [];
  }
}

function processSearchResults(hits: any[], salesBoost: number): Product[] {
  return hits.map((hit) => {
    const product = hit.document as Product;
    const baseScore = hit.text_match || hit.vector_distance || 0;
    const salesScore = Math.log10((product.sales_count || 0) + 1);
    const combinedScore = baseScore * (1 + salesScore * salesBoost);

    return {
      ...product,
      score: combinedScore,
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
  keyword.forEach((product) => {
    productMap.set(product.sku, {
      ...product,
      score: (product.score || 0) * 0.4,
    });
  });

  // Add or merge semantic results with 60% weight
  semantic.forEach((product) => {
    const existing = productMap.get(product.sku);
    if (existing) {
      existing.score = (existing.score || 0) + (product.score || 0) * 0.6;
    } else {
      productMap.set(product.sku, {
        ...product,
        score: (product.score || 0) * 0.6,
      });
    }
  });

  // Apply sales boost to final scores
  productMap.forEach((product) => {
    const salesScore = Math.log10((product.sales_count || 0) + 1);
    product.score = (product.score || 0) * (1 + salesScore * salesBoost);
  });

  return Array.from(productMap.values()).sort(
    (a, b) => (b.score || 0) - (a.score || 0)
  );
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

// Add this helper function
function buildFilterString(
  extractedFilters: ExtractedFilters | undefined,
  existingFilters?: string,
  stockPriority?: boolean
): string {
  const filterParts: string[] = [];

  if (extractedFilters) {
    // Price filters
    if (extractedFilters.minPrice !== undefined) {
      filterParts.push(`price:>=${extractedFilters.minPrice}`);
    }
    if (extractedFilters.maxPrice !== undefined) {
      filterParts.push(`price:<=${extractedFilters.maxPrice}`);
    }

    // Brand filter
    if (extractedFilters.brand) {
      filterParts.push(`brand:=${extractedFilters.brand}`);
    }

    // Category filter
    if (extractedFilters.category) {
      // Could match against any category level
      filterParts.push(
        `(category:=${extractedFilters.category} || category_l1:=${extractedFilters.category} || category_l2:=${extractedFilters.category} || category_l3:=${extractedFilters.category} || category_l4:=${extractedFilters.category})`
      );
    }

    // Stock filter
    if (extractedFilters.inStock) {
      filterParts.push(`is_in_stock:=true`);
    }

    // Sale filter
    if (extractedFilters.onSale) {
      filterParts.push(`sale_price:>0`);
    }

    // Attribute filters (e.g., organic, gluten-free)
    if (extractedFilters.attributes && extractedFilters.attributes.length > 0) {
      // Assuming these would be in food_properties or attributes field
      const attrFilters = extractedFilters.attributes
        .map((attr) => `food_properties:*${attr}*`)
        .join(" && ");
      if (attrFilters) filterParts.push(`(${attrFilters})`);
    }
  }

  // Add stock priority if enabled
  if (stockPriority && !extractedFilters?.inStock) {
    filterParts.push(`is_in_stock:=true`);
  }

  // Combine with existing filters
  if (existingFilters) {
    filterParts.push(existingFilters);
  }

  return filterParts.join(" && ");
}
