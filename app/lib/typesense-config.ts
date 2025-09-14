import { Client } from 'typesense'

// Server-side Typesense configuration with path support
export function getTypesenseConfig() {
  const host = process.env.TYPESENSE_HOST || 'localhost';
  const port = process.env.TYPESENSE_PORT || '8108';
  const protocol = process.env.TYPESENSE_PROTOCOL || 'http';
  const path = process.env.TYPESENSE_PATH || '';
  const apiKey = process.env.TYPESENSE_API_KEY || '';
  
  // Build the node configuration
  const nodeConfig: any = {
    host,
    port,
    path,
    protocol,
  };
  
  // Add path if configured (for reverse proxy setups)
  if (path) {
    nodeConfig.path = path;
  }
  
  return {
    nodes: [nodeConfig],
    apiKey,
    connectionTimeoutSeconds: parseInt(process.env.TYPESENSE_CONNECTION_TIMEOUT || '10'),
    retryIntervalSeconds: 1,
    healthcheckIntervalSeconds: 2,
    numRetries: 3,
  };
}

// Create Typesense client instance
let typesenseClient: Client | null = null;

export function getTypesenseClient(): Client {
  if (!typesenseClient) {
    typesenseClient = new Client(getTypesenseConfig());
  }
  return typesenseClient;
}

export const COLLECTION_NAME = process.env.TYPESENSE_COLLECTION_NAME || 'products_en-US_v10_copy';

// Log configuration on startup (without exposing sensitive data)
export function logTypesenseConfig() {
  const config = getTypesenseConfig();
  console.log('Typesense Configuration:');
  console.log(`  Host: ${config.nodes[0].host}`);
  console.log(`  Port: ${config.nodes[0].port}`);
  console.log(`  Protocol: ${config.nodes[0].protocol}`);
  console.log(`  Path: ${config.nodes[0].path || '(none)'}`);
  console.log(`  Collection: ${COLLECTION_NAME}`);
  console.log(`  API Key: ${config.apiKey ? '***' + config.apiKey.slice(-4) : 'NOT SET'}`);
}
