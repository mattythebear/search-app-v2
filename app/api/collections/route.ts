// app/api/collections/route.ts
import { NextResponse } from "next/server";
import { getTypesenseClient } from "@/app/lib/typesense-config";

interface TypesenseCollection {
  name: string;
  num_documents: number;
  fields?: Array<any>;
  default_sorting_field?: string;
  created_at?: number;
}

export async function GET() {
  try {
    const client = getTypesenseClient();

    // Retrieve all collections from Typesense
    const collections = (await client
      .collections()
      .retrieve()) as TypesenseCollection[];

    const formattedCollections = collections
      .filter((collection) => collection.name.indexOf("_copy") !== -1)
      .map((collection) => ({
        id: collection.name,
        name: collection.name,
        documentsCount: collection.num_documents,
        fields: collection.fields?.length || 0,
      }));

    return NextResponse.json({
      success: true,
      collections: formattedCollections,
    });
  } catch (error: any) {
    console.error("Error fetching collections:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        collections: [],
      },
      { status: 500 }
    );
  }
}
