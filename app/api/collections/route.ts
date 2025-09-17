// app/api/collections/route.ts
import { NextResponse } from 'next/server';
import { getTypesenseClient } from '@/app/lib/typesense-config';

export async function GET() {
  try {
    const client = getTypesenseClient();
    
    // Retrieve all collections from Typesense
    const collections = await client.collections().retrieve();
    
    // Format collections for the frontend
    const formattedCollections = collections.map(collection => collection.name.indexOf('_copy') !== -1 && ({
      id: collection.name,
      name: collection.name,
      documentsCount: collection.num_documents,
      fields: collection.fields?.length || 0
    }));
    
    // // Add "All Collections" option at the beginning
    // formattedCollections.unshift({
    //   id: 'all',
    //   name: 'All Collections',
    //   documentsCount: formattedCollections.reduce((sum, col) => sum + col.documentsCount, 0),
    //   fields: 0
    // });
    
    return NextResponse.json({
      success: true,
      collections: formattedCollections
    });
    
  } catch (error: any) {
    console.error('Error fetching collections:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        collections: []
      },
      { status: 500 }
    );
  }
}