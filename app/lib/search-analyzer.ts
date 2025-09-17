// app/lib/search-analyzer.ts
import type { 
  AnalysisResult,
  SearchContext 
} from './search-types';
import { SearchStrategy } from './search-types';

export class SearchAnalyzer {
  // Patterns for exact product identifiers
  private readonly productIdPatterns = {
    sku: /^[A-Z0-9\-_]{3,20}$/i,
    mpn: /^[A-Z0-9\-]{6,20}$/i,
    gtin: /^\d{8,14}$/,
    upc: /^\d{12}$/,
    productId: /^(PROD|ID|P)[\-_]?\d{4,}$/i,
    // Add common e-commerce patterns
    alphanumeric: /^[A-Z0-9]{4,15}$/i,
  };

  // Context keywords for semantic understanding
  private readonly contextKeywords = {
    categories: [
      'chocolate', 'cookies', 'pasta', 'sauce', 'meat', 'chicken', 'beef', 
      'vegetables', 'fruit', 'dairy', 'cheese', 'milk', 'bread', 'bakery',
      'frozen', 'fresh', 'canned', 'snacks', 'beverages', 'coffee', 'tea',
      'paper', 'plates', 'cups', 'utensils', 'napkins', 'towels',
      'cleaning', 'supplies', 'equipment', 'kitchen', 'dessert', 'appetizer',
      'salad', 'soup', 'entree', 'side', 'dish', 'meal', 'food', 'drink'
    ],
    attributes: [
      'organic', 'gluten-free', 'vegan', 'vegetarian', 'plant-based', 'kosher', 
      'halal', 'sugar-free', 'low-fat', 'natural', 'fresh', 'frozen', 'dried', 
      'canned', 'disposable', 'recyclable', 'biodegradable', 'eco-friendly',
      'dairy-free', 'nut-free', 'non-gmo', 'whole', 'raw'
    ],
    intents: [
      'healthy', 'diet', 'party', 'catering', 'bulk', 'wholesale',
      'restaurant', 'commercial', 'industrial', 'premium', 'budget',
      'thanksgiving', 'christmas', 'holiday', 'dinner', 'lunch', 'breakfast',
      'event', 'celebration', 'gathering', 'meal', 'occasion', 'festive'
    ],
    descriptors: [
      'best', 'top', 'quality', 'cheap', 'expensive', 'large', 'small',
      'heavy-duty', 'light', 'strong', 'durable', 'single-use', 'good',
      'great', 'perfect', 'suitable', 'ideal', 'options', 'alternatives'
    ]
  };

  analyze(query: string): AnalysisResult {
    const cleanQuery = query.trim();
    
    // Check for exact match patterns (single token, no spaces)
    if (this.isProductIdentifier(cleanQuery)) {
      return {
        strategy: SearchStrategy.EXACT_MATCH,
        confidence: 1.0,
        identifierType: this.getIdentifierType(cleanQuery),
        context: null,
        suggestedChips: [],
        queryTerms: [cleanQuery]
      };
    }

    // Extract context from query
    const context = this.extractContext(cleanQuery);
    
    // Determine strategy based on context richness
    if (context.confidence > 0.4) {
      return {
        strategy: SearchStrategy.SEMANTIC,
        confidence: context.confidence,
        identifierType: null,
        context,
        suggestedChips: [],
        queryTerms: cleanQuery.toLowerCase().split(/\s+/)
      };
    }

    // Default to keyword with prompt chips for ambiguous queries
    return {
      strategy: SearchStrategy.KEYWORD,
      confidence: Math.max(0.3, context.confidence),
      identifierType: null,
      context: context.confidence > 0 ? context : null,
      suggestedChips: this.generatePromptChips(cleanQuery, context),
      queryTerms: cleanQuery.toLowerCase().split(/\s+/)
    };
  }

  private isProductIdentifier(query: string): boolean {
    // Must be a single token (no spaces)
    if (query.includes(' ')) return false;
    
    // Must not be a common word
    const commonWords = ['sale', 'new', 'all', 'best', 'top', 'food'];
    if (commonWords.includes(query.toLowerCase())) return false;
    
    // Check against all identifier patterns
    return Object.values(this.productIdPatterns).some(pattern => 
      pattern.test(query)
    );
  }

  private getIdentifierType(query: string): string {
    for (const [type, pattern] of Object.entries(this.productIdPatterns)) {
      if (pattern.test(query)) {
        return type;
      }
    }
    return 'alphanumeric';
  }

  private extractContext(query: string): SearchContext {
    const tokens = query.toLowerCase().split(/\s+/);
    const foundContext = {
      categories: [] as string[],
      attributes: [] as string[],
      intents: [] as string[],
      descriptors: [] as string[]
    };

    let contextScore = 0;
    const matchedTokens = new Set<string>();

    // Check each token against context keywords
    for (const token of tokens) {
      for (const [contextType, keywords] of Object.entries(this.contextKeywords)) {
        const matches = keywords.filter(keyword => {
          // Exact match
          if (token === keyword) return true;
          // Check if token is part of keyword (for compound words)
          if (keyword.includes(token) && token.length > 2) return true;
          // Check if keyword is part of token (for variations)
          if (token.includes(keyword) && keyword.length > 3) return true;
          // Check for common variations (e.g., "dinner" vs "diner")
          if (this.areSimilar(token, keyword)) return true;
          return false;
        });

        if (matches.length > 0) {
          foundContext[contextType as keyof typeof foundContext].push(...matches);
          matchedTokens.add(token);
          contextScore += 0.2;
        }
      }
    }

    // Check for question patterns that indicate semantic intent
    const questionPatterns = [
      'what are', 'where can', 'how to', 'which', 'what kind',
      'looking for', 'need', 'want', 'find', 'suggest', 'recommend',
      'options', 'alternatives', 'choices', 'ideas'
    ];
    
    const queryLower = query.toLowerCase();
    for (const pattern of questionPatterns) {
      if (queryLower.includes(pattern)) {
        contextScore += 0.15;
      }
    }

    // Check for intent phrases that strongly suggest semantic search
    const semanticPhrases = [
      'for a', 'for my', 'for the', 'suitable for', 'good for',
      'options for', 'alternatives', 'something', 'anything'
    ];
    
    for (const phrase of semanticPhrases) {
      if (queryLower.includes(phrase)) {
        contextScore += 0.1;
      }
    }

    // Boost score if query has multiple context indicators
    const contextTypeCount = Object.values(foundContext).filter(arr => arr.length > 0).length;
    if (contextTypeCount >= 2) {
      contextScore *= 1.3;
    }
    
    // Boost if it's a question or request
    if (queryLower.includes('?') || queryLower.startsWith('what') || 
        queryLower.startsWith('where') || queryLower.startsWith('how')) {
      contextScore *= 1.2;
    }

    return {
      categories: [...new Set(foundContext.categories)],
      attributes: [...new Set(foundContext.attributes)],
      intents: [...new Set(foundContext.intents)],
      descriptors: [...new Set(foundContext.descriptors)],
      confidence: Math.min(contextScore, 1.0),
      originalQuery: query,
      unmatchedTokens: tokens.filter(t => !matchedTokens.has(t))
    };
  }
  
  private areSimilar(word1: string, word2: string): boolean {
    // Handle common variations like "diner" vs "dinner"
    if (Math.abs(word1.length - word2.length) <= 1) {
      const longer = word1.length > word2.length ? word1 : word2;
      const shorter = word1.length > word2.length ? word2 : word1;
      if (longer.startsWith(shorter) || shorter.startsWith(longer.slice(0, -1))) {
        return true;
      }
    }
    return false;
  }

  private generatePromptChips(query: string, context: SearchContext): string[] {
    const chips: string[] = [];
    
    // Category suggestions if none detected
    if (!context?.categories?.length) {
      chips.push('in Snacks', 'in Beverages', 'in Paper Products', 'in Kitchen Equipment');
    }

    // Attribute refinements if none detected
    if (!context?.attributes?.length) {
      chips.push('Organic', 'Gluten-Free', 'Bulk Size');
    }

    // Intent clarifications
    if (!context?.intents?.length) {
      chips.push('for Restaurant', 'for Home', 'for Catering');
    }

    // Brand/price options
    chips.push('Premium Brands', 'Budget Options', 'On Sale');

    // If query is very generic, add more specific suggestions
    if (query.length < 10 && (!context || context.confidence < 0.3)) {
      chips.push('Most Popular', 'New Arrivals', 'Best Sellers');
    }

    return chips.slice(0, 8); // Return up to 8 chips
  }

  // Helper method to determine if semantic search should be used
  public shouldUseSemanticSearch(query: string): boolean {
    const analysis = this.analyze(query);
    return analysis.strategy === SearchStrategy.SEMANTIC || 
           (analysis.strategy === SearchStrategy.KEYWORD && analysis.confidence > 0.4);
  }
}