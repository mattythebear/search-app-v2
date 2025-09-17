// app/api/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  getTypesenseClient,
  COLLECTION_NAME,
} from "@/app/lib/typesense-config";
import { SearchAnalyzer } from "@/app/lib/search-analyzer";
import type {
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

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const options: SearchOptions = {
      ...body,
      limit: Math.min(body.limit || DEFAULT_LIMIT, MAX_LIMIT),
    };

    // Analyze the query to determine search strategy
    const analysis = analyzer.analyze(options.query);
    console.log("Query analysis:", {
      query: options.query,
      strategy: analysis.strategy,
      confidence: analysis.confidence,
      identifierType: analysis.identifierType,
      collection: options.collection || "default",
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
      results.results[0].hits &&
      results.results[0].hits.length > 0
    ) {
      return results.results[0].hits.map((hit: any) => ({
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
    // Determine which collection to search
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

    // Add any additional filters (but not collection as filter since we're searching specific collection)
    if (options.filters) {
      searchParams.filter_by = options.filters;
    }

    // Use multi_search for consistency
    const searchRequests = {
      searches: [searchParams],
    };

    console.log(`Performing keyword search in collection: ${collectionName}`);
    const results = await client.multiSearch.perform(searchRequests);

    if (results.results && results.results[0] && results.results[0].hits) {
      return processSearchResults(
        results.results[0].hits,
        options.salesBoost || 0.5
      );
    }

    return [];
  } catch (error) {
    console.error("Keyword search error:", error);
    throw error;
  }
}

// app/api/search/route.ts - Enhanced semantic search functions

async function performSemanticSearch(
  options: SearchOptions
): Promise<Product[]> {
  // First check if we have embeddings
  if (!options.queryEmbedding || options.queryEmbedding.length === 0) {
    console.log("No embedding provided, falling back to keyword search");
    return performKeywordSearch(options);
  }

  try {
    // Analyze the query for semantic concepts
    const concepts = extractSemanticConcepts(options.query);
    console.log("Extracted semantic concepts:", concepts);

    // Perform multiple search strategies
    const searchPromises = [];

    // 1. Vector search with full query embedding
    searchPromises.push(performVectorSearch(options));

    // 2. Enhanced keyword search with concept boosting
    searchPromises.push(performConceptAwareKeywordSearch(options, concepts));

    // 3. If we have multiple concepts, search for products that match concept combinations
    if (concepts.dietary.length > 0 && concepts.occasions.length > 0) {
      searchPromises.push(performConceptCombinationSearch(options, concepts));
    }

    const results = await Promise.allSettled(searchPromises);

    const vectorResults =
      results[0].status === "fulfilled" ? results[0].value : [];
    const keywordResults =
      results[1].status === "fulfilled" ? results[1].value : [];
    const conceptResults =
      results[2]?.status === "fulfilled" ? results[2].value : [];

    // Merge with intelligent weighting based on query type
    return mergeSemanticResults(
      vectorResults,
      keywordResults,
      conceptResults,
      concepts,
      options.salesBoost || 0.5
    );
  } catch (error) {
    console.error("Enhanced semantic search error:", error);
    return performKeywordSearch(options);
  }
}

function extractSemanticConcepts(query: string): SemanticConcepts {
  const queryLower = query.toLowerCase();

  const concepts: SemanticConcepts = {
    dietary: [],
    occasions: [],
    productTypes: [],
    modifiers: [],
    traditionalFoods: [],
  };

  // Dietary restrictions/preferences
  const dietaryTerms = {
    vegan: ["plant-based", "dairy-free", "meatless", "animal-free"],
    vegetarian: ["meat-free", "veggie"],
    "gluten-free": ["gluten free", "celiac", "wheat-free"],
    keto: ["low-carb", "ketogenic"],
    organic: ["natural", "non-gmo"],
    kosher: ["kosher certified"],
    halal: ["halal certified"],
  };

  // Occasions and holidays
  const occasionTerms = {
    thanksgiving: ["turkey day", "harvest", "november feast", "fall feast"],
    christmas: ["xmas", "holiday", "festive", "december"],
    easter: ["spring holiday", "paschal"],
    halloween: ["october 31", "trick or treat"],
    bbq: ["barbecue", "cookout", "grilling"],
    party: ["celebration", "gathering", "event"],
  };

  // Traditional foods for occasions
  const traditionalFoods = {
    thanksgiving: [
      "turkey",
      "stuffing",
      "gravy",
      "cranberry sauce",
      "pumpkin pie",
      "mashed potatoes",
      "green bean casserole",
      "sweet potato",
      "corn",
    ],
    christmas: [
      "ham",
      "roast",
      "cookies",
      "gingerbread",
      "eggnog",
      "candy cane",
      "fruitcake",
      "prime rib",
    ],
    bbq: [
      "burgers",
      "hot dogs",
      "ribs",
      "chicken wings",
      "coleslaw",
      "potato salad",
      "corn on the cob",
    ],
    easter: ["ham", "lamb", "eggs", "chocolate", "candy", "carrots"],
  };

  // Extract dietary concepts
  for (const [key, synonyms] of Object.entries(dietaryTerms)) {
    if (
      queryLower.includes(key) ||
      synonyms.some((syn) => queryLower.includes(syn))
    ) {
      concepts.dietary.push(key);
    }
  }

  // Extract occasion concepts
  for (const [key, synonyms] of Object.entries(occasionTerms)) {
    if (
      queryLower.includes(key) ||
      synonyms.some((syn) => queryLower.includes(syn))
    ) {
      concepts.occasions.push(key);
      // Add associated traditional foods
      if (traditionalFoods[key as keyof typeof traditionalFoods]) {
        concepts.traditionalFoods.push(
          ...traditionalFoods[key as keyof typeof traditionalFoods]
        );
      }
    }
  }

  // Look for action words that indicate intent
  const intentModifiers = [
    "options",
    "alternatives",
    "substitutes",
    "ideas",
    "suggestions",
  ];
  concepts.modifiers = intentModifiers.filter((mod) =>
    queryLower.includes(mod)
  );

  return concepts;
}

async function performConceptAwareKeywordSearch(
  options: SearchOptions,
  concepts: SemanticConcepts
): Promise<Product[]> {
  try {
    const collectionName =
      options.collection && options.collection !== "all"
        ? options.collection
        : COLLECTION_NAME;

    // Build enhanced query with concept boosting
    let enhancedQuery = options.query;

    // If looking for dietary alternatives to traditional foods,
    // include the traditional food names in the search
    if (concepts.dietary.length > 0 && concepts.traditionalFoods.length > 0) {
      // Add traditional food terms to help find alternatives
      const foodTerms = concepts.traditionalFoods.slice(0, 3).join(" ");
      enhancedQuery = `${options.query} ${foodTerms}`;
    }

    const searchParams: any = {
      collection: collectionName,
      q: enhancedQuery,
      query_by: "name,category,description,brand,food_properties",
      // Prioritize products that match both dietary and occasion concepts
      sort_by: `_text_match:desc,sales_count:desc`,
      per_page: options.limit || 24,
      page: options.page || 1,
      exclude_fields: "embedding,embedding_text",
      prefix: true,
      infix: "fallback",
      drop_tokens_threshold: 0,
      // Increase weight for name field since product names often contain key terms
      query_by_weights: "3,1,1,2,2",
    };

    // Build filters for dietary restrictions if present
    if (concepts.dietary.length > 0) {
      const dietaryFilters = concepts.dietary
        .map((diet) => {
          switch (diet) {
            case "vegan":
              return "(food_properties:vegan || name:vegan || description:plant-based)";
            case "vegetarian":
              return "(food_properties:vegetarian || name:vegetarian || name:veggie)";
            case "gluten-free":
              return "(food_properties:gluten-free || name:gluten-free)";
            default:
              return `food_properties:${diet}`;
          }
        })
        .join(" && ");

      searchParams.filter_by = dietaryFilters;
    }

    const searchRequests = {
      searches: [searchParams],
    };

    const results = await client.multiSearch.perform(searchRequests);

    if (results.results && results.results[0] && results.results[0].hits) {
      // Post-process to boost products that match concept combinations
      return postProcessConceptMatches(
        results.results[0].hits,
        concepts,
        options.salesBoost || 0.5
      );
    }

    return [];
  } catch (error) {
    console.error("Concept-aware keyword search error:", error);
    return [];
  }
}

async function performConceptCombinationSearch(
  options: SearchOptions,
  concepts: SemanticConcepts
): Promise<Product[]> {
  try {
    const collectionName =
      options.collection && options.collection !== "all"
        ? options.collection
        : COLLECTION_NAME;

    // Search specifically for products that are alternatives
    // For example, for "vegan thanksgiving", search for products like "tofurky", "plant-based roast", etc.
    const alternativeSearchTerms = generateAlternativeSearchTerms(concepts);

    if (alternativeSearchTerms.length === 0) {
      return [];
    }

    const searchParams: any = {
      collection: collectionName,
      q: alternativeSearchTerms.join(" "),
      query_by: "name,brand,description",
      sort_by: `_text_match:desc,sales_count:desc`,
      per_page: Math.min(options.limit || 24, 10), // Limit these special results
      exclude_fields: "embedding,embedding_text",
      prefix: false, // Exact matching for specific products
      query_by_weights: "3,2,1", // Prioritize name and brand
    };

    const searchRequests = {
      searches: [searchParams],
    };

    const results = await client.multiSearch.perform(searchRequests);

    if (results.results && results.results[0] && results.results[0].hits) {
      // Boost these results since they're highly relevant concept matches
      return results.results[0].hits.map((hit: any) => ({
        ...(hit.document as Product),
        score: (hit.text_match || 0) * 1.5, // Boost score for concept matches
        conceptMatch: true,
      }));
    }

    return [];
  } catch (error) {
    console.error("Concept combination search error:", error);
    return [];
  }
}

function generateAlternativeSearchTerms(concepts: SemanticConcepts): string[] {
  const terms: string[] = [];

  // Map dietary + occasion to known alternative products
  const alternativeProducts: { [key: string]: string[] } = {
    "vegan-thanksgiving": [
      "tofurky",
      "plant-based roast",
      "field roast",
      "gardein turkey",
      "vegan stuffing",
      "mushroom gravy",
    ],
    "vegan-christmas": [
      "vegan ham",
      "nut roast",
      "wellington",
      "plant-based roast",
    ],
    "vegan-bbq": [
      "beyond burger",
      "impossible burger",
      "veggie burger",
      "plant-based sausage",
      "portobello",
    ],
    "vegetarian-thanksgiving": ["quorn roast", "vegetarian turkey", "nut loaf"],
    "gluten-free-thanksgiving": [
      "gluten-free stuffing",
      "rice stuffing",
      "gluten-free pie",
    ],
  };

  // Generate search terms based on concept combinations
  concepts.dietary.forEach((diet) => {
    concepts.occasions.forEach((occasion) => {
      const key = `${diet}-${occasion}`;
      if (alternativeProducts[key]) {
        terms.push(...alternativeProducts[key]);
      }
    });
  });

  // Add generic alternative terms
  if (
    concepts.dietary.includes("vegan") ||
    concepts.dietary.includes("vegetarian")
  ) {
    terms.push("plant-based", "meat alternative", "dairy-free");
  }

  return [...new Set(terms)]; // Remove duplicates
}

function postProcessConceptMatches(
  hits: any[],
  concepts: SemanticConcepts,
  salesBoost: number
): Product[] {
  return hits.map((hit) => {
    const product = hit.document as Product;
    let score = hit.text_match || 0;
    let conceptBoost = 1.0;

    const productNameLower = product.name?.toLowerCase() || "";
    const descriptionLower = product.description?.toLowerCase() || "";
    const brandLower = product.brand?.toLowerCase() || "";
    const combined = `${productNameLower} ${descriptionLower} ${brandLower}`;

    // Boost products that match dietary + traditional food combinations
    if (concepts.dietary.length > 0) {
      const hasDietaryMatch = concepts.dietary.some(
        (diet) =>
          combined.includes(diet) || combined.includes(diet.replace("-", " "))
      );

      if (hasDietaryMatch) {
        conceptBoost *= 1.3;

        // Extra boost for products that are alternatives to traditional foods
        const isAlternative = concepts.traditionalFoods.some((food) => {
          // Check if this is an alternative version (e.g., "vegan turkey", "plant-based ham")
          const alternativePatterns = [
            `${concepts.dietary[0]} ${food}`,
            `plant-based ${food}`,
            `meatless ${food}`,
            `dairy-free ${food}`,
          ];
          return alternativePatterns.some((pattern) =>
            combined.includes(pattern)
          );
        });

        if (isAlternative) {
          conceptBoost *= 1.5; // Strong boost for direct alternatives
        }

        // Boost known alternative brands
        const alternativeBrands = [
          "tofurky",
          "gardein",
          "field roast",
          "beyond",
          "impossible",
          "daiya",
          "quorn",
        ];
        if (alternativeBrands.some((brand) => brandLower.includes(brand))) {
          conceptBoost *= 1.3;
        }
      }
    }

    // Apply occasion-specific boosting
    if (concepts.occasions.length > 0) {
      const hasOccasionMatch = concepts.occasions.some((occasion) =>
        combined.includes(occasion)
      );

      if (hasOccasionMatch) {
        conceptBoost *= 1.2;
      }
    }

    // Apply sales boost
    const salesScore = Math.log10((product.sales_count || 0) + 1);
    const finalScore = score * conceptBoost * (1 + salesScore * salesBoost);

    return {
      ...product,
      score: finalScore,
      conceptBoost: conceptBoost > 1 ? conceptBoost : undefined,
    };
  });
}

function mergeSemanticResults(
  vectorResults: Product[],
  keywordResults: Product[],
  conceptResults: Product[],
  concepts: SemanticConcepts,
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

  // Weight based on query complexity
  const hasMultipleConcepts =
    concepts.dietary.length > 0 && concepts.occasions.length > 0;

  if (hasMultipleConcepts) {
    // For complex multi-concept queries, prioritize concept matches
    addProducts(conceptResults, "concept", 0.4);
    addProducts(keywordResults, "keyword", 0.35);
    addProducts(vectorResults, "vector", 0.25);
  } else {
    // For simpler queries, rely more on vector search
    addProducts(vectorResults, "vector", 0.5);
    addProducts(keywordResults, "keyword", 0.35);
    addProducts(conceptResults, "concept", 0.15);
  }

  // Boost products that appear in multiple search results
  productMap.forEach((product) => {
    if (product.sources.size > 1) {
      product.score = (product.score || 0) * (1 + 0.1 * product.sources.size);
    }
  });

  // Remove sources property and sort
  const finalResults = Array.from(productMap.values()).map(
    ({ sources, ...product }) => product
  );

  return finalResults.sort((a, b) => (b.score || 0) - (a.score || 0));
}

// Add type definition for semantic concepts
interface SemanticConcepts {
  dietary: string[];
  occasions: string[];
  productTypes: string[];
  modifiers: string[];
  traditionalFoods: string[];
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

    if (results.results && results.results[0] && results.results[0].hits) {
      return processSearchResults(
        results.results[0].hits,
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

    if (results.results && results.results[0] && results.results[0].hits) {
      return results.results[0].hits.map((hit: any) => ({
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
