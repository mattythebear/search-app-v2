# Smart Product Search v2

A production-ready Next.js application implementing AI-powered semantic search with sales intelligence optimization.

## ✨ Features

### Search Capabilities
- **Keyword Search**: Traditional text matching with sales-weighted ranking
- **Semantic Search**: AI-powered understanding using OpenAI embeddings
- **Hybrid Search**: Combines both approaches for optimal results
- **Sales Boost**: Adjustable factor (0x-2x) to balance relevance with popularity

### Technical Features
- **Server-side API routes** (no CORS issues)
- **Configurable Typesense path** for reverse proxy setups
- **Health check endpoint** for monitoring
- **TypeScript support** with full type safety
- **Responsive design** with Tailwind CSS
- **Error handling** and fallback strategies
- **Performance metrics** and search analytics

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- Typesense server (local or cloud)
- OpenAI API key

### Installation

1. **Install dependencies:**
```bash
npm install
```

2. **Configure environment variables:**
Edit `.env.local` with your settings:

```env
# Typesense Configuration
TYPESENSE_HOST=your-typesense-host
TYPESENSE_PORT=8108
TYPESENSE_PROTOCOL=https
TYPESENSE_PATH=/search-api  # Optional: for reverse proxy
TYPESENSE_API_KEY=your-api-key
TYPESENSE_COLLECTION_NAME=products

# OpenAI Configuration
OPENAI_API_KEY=your-openai-key
OPENAI_MODEL=text-embedding-3-small
OPENAI_DIMENSIONS=1536
```

3. **Run development server:**
```bash
npm run dev
```

4. **Open browser:**
Navigate to [http://localhost:3000](http://localhost:3000)

## 🏗️ Architecture

### API Routes (Server-side)
- `/api/search` - Main search endpoint
- `/api/embeddings` - Generate query embeddings
- `/api/health` - Health check and status

### Key Components
- `SearchBar` - Reusable search input component
- `ProductCard` - Product display with ratings and pricing
- `SearchSettings` - Control panel for search configuration

### Type Definitions
- `Product` - Product data structure
- `SearchOptions` - Search parameters
- `SearchResponse` - API response format

## 🔧 Configuration

### Typesense Path Configuration

For reverse proxy setups (e.g., Nginx):

```nginx
location /search-api/ {
    proxy_pass http://typesense-server:8108/;
    proxy_set_header Host $host;
}
```

Then set in `.env.local`:
```env
TYPESENSE_PATH=/search-api
```

### Search Limits

Configure in `.env.local`:
```env
DEFAULT_SEARCH_LIMIT=24
MAX_SEARCH_LIMIT=100
```

### Caching (Optional)

Enable search result caching:
```env
ENABLE_SEARCH_CACHE=true
SEARCH_CACHE_TTL=300  # seconds
```

## 📊 API Usage

### Search Endpoint

```typescript
POST /api/search
{
  "query": "chocolate cookies",
  "searchType": "hybrid",
  "salesBoost": 0.5,
  "limit": 24,
  "queryEmbedding": [...],  // Optional
  "filters": "is_in_stock:true"  // Optional
}
```

### Health Check

```typescript
GET /api/health

Response:
{
  "status": "healthy",
  "typesense": {
    "healthy": true,
    "collection": {
      "name": "products",
      "documents": 50000,
      "fields": 45
    }
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## 🎯 Search Types Explained

### Keyword Search
- Uses: `name`, `brand`, `category`, `description`
- Sorting: Text relevance + sales count
- Best for: Exact product searches

### Semantic Search
- Uses: Vector embeddings
- Sorting: Cosine similarity + sales boost
- Best for: Conceptual queries, discovery

### Hybrid Search
- Combines: 50% keyword + 50% semantic
- Sorting: Weighted combined score
- Best for: General searching

## 🚢 Deployment

### Vercel

```bash
npm run build
vercel --prod
```

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY . .
RUN npm ci --only=production
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### Environment Variables

Ensure all required environment variables are set in your deployment platform.

## 🔍 Monitoring

### Health Checks
Monitor `/api/health` endpoint for:
- Typesense connectivity
- Collection availability
- Document count

### Performance Metrics
Track in application:
- Search response times
- Query types distribution
- Error rates

## 🐛 Troubleshooting

### CORS Errors
- Ensure you're using API routes, not direct browser calls
- Check `TYPESENSE_PATH` configuration

### No Semantic Results
- Verify OpenAI API key
- Check embedding dimensions match
- Ensure products have embeddings

### Slow Searches
- Optimize Typesense indices
- Adjust connection timeout
- Check network latency

## 📝 License

MIT

## 🤝 Contributing

Pull requests welcome! Please ensure:
- TypeScript types are maintained
- Tests pass
- Documentation is updated
# search-app-v2
