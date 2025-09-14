import { NextResponse } from 'next/server';
import { getTypesenseClient, COLLECTION_NAME } from '@/app/lib/typesense-config';

export async function GET() {
  try {
    const client = getTypesenseClient();
    
    // Test Typesense connection
    const health = await client.health.retrieve();
    
    // Try to get collection info
    let collectionInfo = null;
    try {
      collectionInfo = await client.collections(COLLECTION_NAME).retrieve();
    } catch (error) {
      console.error('Collection check failed:', error);
    }
    
    return NextResponse.json({
      status: 'healthy',
      typesense: {
        healthy: health.ok,
        collection: collectionInfo ? {
          name: collectionInfo.name,
          documents: collectionInfo.num_documents,
          fields: collectionInfo.fields?.length
        } : null
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      },
      { status: 503 }
    );
  }
}
