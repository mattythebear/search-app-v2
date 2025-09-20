import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Invalid query' },
        { status: 400 }
      );
    }

    // Use GPT to analyze the search intent
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo", // Faster and cheaper for intent analysis
      messages: [
        {
          role: "system",
          content: `You are a search intent analyzer for a food service/restaurant supply website. 
          Analyze the user's search query and return a JSON response with:
          - strategy: "exact" (for SKU/product IDs), "semantic" (for conceptual queries), or "keyword" (for simple product name searches)
          - confidence: 0-1 score of your confidence in the strategy
          - context: extracted context about the search
          - suggestedTerms: additional search terms that might help
          
          Return ONLY valid JSON, no additional text.`
        },
        {
          role: "user",
          content: `Analyze this search query: "${query}"
          
          Consider:
          - Is this looking for specific products by name/ID or asking a conceptual question?
          - Does it need understanding of relationships (like "healthy alternatives to X")?
          - Are they asking about use cases, occasions, or dietary needs?
          - Would semantic search better understand their intent?
          
          Examples:
          - "SKU123456" -> exact match
          - "paper plates" -> keyword search  
          - "healthy frying oils" -> semantic (needs understanding of "healthy" in context)
          - "vegan thanksgiving options" -> semantic (needs conceptual matching)
          - "what can I use for outdoor catering" -> semantic (needs understanding)`
        }
      ],
      temperature: 0.3, // Lower temperature for more consistent analysis
      max_tokens: 200,
    });

    const response = completion.choices[0].message.content;
    
    // Parse the JSON response
    try {
      const analysis = JSON.parse(response || '{}');
      return NextResponse.json(analysis);
    } catch (parseError) {
      console.error('Failed to parse GPT response:', response);
      // Fallback to keyword search if parsing fails
      return NextResponse.json({
        strategy: 'keyword',
        confidence: 0.5,
        context: { error: 'Failed to parse AI analysis' },
        suggestedTerms: []
      });
    }

  } catch (error: any) {
    console.error('Error analyzing intent:', error);
    // Fallback to keyword search on error
    return NextResponse.json({
      strategy: 'keyword',
      confidence: 0.5,
      context: { error: error.message },
      suggestedTerms: []
    });
  }
}