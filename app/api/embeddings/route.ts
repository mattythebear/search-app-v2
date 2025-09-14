import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = process.env.OPENAI_MODEL || 'text-embedding-3-small';
const DIMENSIONS = parseInt(process.env.OPENAI_DIMENSIONS || '1536');

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Invalid query' },
        { status: 400 }
      );
    }

    // Generate embedding for the search query
    const response = await openai.embeddings.create({
      model: MODEL,
      input: query,
      dimensions: DIMENSIONS,
    });

    const embedding = response.data[0].embedding;

    return NextResponse.json({ 
      embedding,
      model: MODEL,
      dimensions: DIMENSIONS 
    });
    
  } catch (error: any) {
    console.error('Error generating embedding:', error);
    return NextResponse.json(
      { error: 'Failed to generate embedding', details: error.message },
      { status: 500 }
    );
  }
}
