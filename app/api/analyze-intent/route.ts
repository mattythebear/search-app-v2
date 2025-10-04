import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  const { query } = await request.json();
  try {
    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "Invalid query" }, { status: 400 });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are a search intent analyzer for a food service/restaurant supply website. 
      Analyze the user's search query and return a JSON response with:
      - strategy: "exact" (ONLY for SKU/product IDs like "SKU123456"), "semantic" (for conceptual queries), or "keyword" (for product name searches)
      - confidence: 0-1 score
      - context: extracted context about the search
      - suggestedTerms: additional search terms
      - filters: extracted filters including price ranges
      - cleanQuery: the search query with filter terms removed
      
      IMPORTANT: Only use "exact" strategy for actual product codes/SKUs that look like identifiers (e.g., "SKU123456", "P-12345", alphanumeric codes).
      For product names like "cookie dough", "paper plates", etc., use "keyword" or "semantic" strategy.
      
      Extract price filters from phrases like:
      - "under $X", "less than $X", "below $X" → maxPrice: X
      - "over $X", "above $X", "more than $X" → minPrice: X
      - "between $X and $Y", "$X-$Y" → minPrice: X, maxPrice: Y
      - "around $X", "about $X" → minPrice: X*0.8, maxPrice: X*1.2
      
      Also extract other filters:
      - Brand mentions → brand
      - Category mentions → category
      - Stock requirements ("in stock", "available") → inStock: true
      - Special flags ("on sale", "discounted") → onSale: true
      
      Return ONLY valid JSON.`,
        },
        {
          role: "user",
          content: `Analyze this query: "${query}"
      
      Remember:
      - "cookie dough" is a product name, NOT a product ID → use "keyword" or "semantic"
      - Only use "exact" for things that look like codes: "SKU123", "P-4567", etc.
      
      Extract:
      1. Price constraints (under/over/between amounts)
      2. Brand names if mentioned
      3. Categories if mentioned
      4. Stock/availability requirements
      5. The core search terms (with filter words removed)
      
      Example response for "cookie dough under $100":
      {
        "strategy": "keyword",
        "confidence": 0.9,
        "context": "User looking for cookie dough products with price constraint",
        "suggestedTerms": ["chocolate chip", "sugar cookie", "edible"],
        "filters": {
          "maxPrice": 100
        },
        "cleanQuery": "cookie dough"
      }`,
        },
      ],
      temperature: 0.3,
      max_tokens: 300,
    });

    const response = completion.choices[0].message.content;

    try {
      const analysis = JSON.parse(response || "{}");
      return NextResponse.json(analysis);
    } catch (parseError) {
      console.error("Failed to parse GPT response:", response);
      return NextResponse.json({
        strategy: "keyword",
        confidence: 0.5,
        context: { error: "Failed to parse AI analysis" },
        suggestedTerms: [],
        filters: {},
        cleanQuery: query,
      });
    }
  } catch (error: any) {
    console.error("Error analyzing intent:", error);
    return NextResponse.json({
      strategy: "keyword",
      confidence: 0.5,
      context: { error: error.message },
      suggestedTerms: [],
      filters: {},
      cleanQuery: query,
    });
  }
}
