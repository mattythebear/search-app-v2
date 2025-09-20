import Image from 'next/image';
import { Star, TrendingUp, Package, AlertCircle } from 'lucide-react';
import type { Product } from '@/app/lib/search-types';

interface ProductCardProps {
  product: Product;
  showScore?: boolean;
  collectionName?: string; // Add this prop
}

export default function ProductCard({ product, showScore = false, collectionName }: ProductCardProps) {
  const displayPrice = product.sale_price || product.price;
  const rating = Math.min(5, Math.max(1, Math.log10((product.sales_count || 0) + 1)));
  const isPopular = (product.sales_count || 0) > 100;
  const isOnSale = product.sale_price && product.price && product.sale_price < product.price;
  
  // Determine the URL based on collection name
  const productUrl = collectionName?.includes('US') 
    ? `https://www.foodservicedirect.com/${product.slug}`
    : `https://www.foodservicedirect.ca/${product.slug}`;
  
  return (
    <div 
      className="bg-white rounded-lg shadow-md hover:shadow-xl transition-shadow p-4 relative cursor-pointer" 
      onClick={() => window.open(productUrl, '_blank', 'noopener,noreferrer')}
    >
      {showScore && product.score !== undefined && (
        <div className="absolute top-2 right-2 bg-blue-600 text-white text-xs px-2 py-1 rounded-full z-10">
          Score: {product.score.toFixed(2)}
        </div>
      )}
      
      {isOnSale && (
        <div className="absolute top-2 left-2 bg-red-600 text-white text-xs px-2 py-1 rounded-full z-10">
          Sale
        </div>
      )}
      
      <div className="relative w-full h-48 mb-3 bg-gray-50 rounded">
        {product.gallery && product.gallery?.length > 0 ? (
          <Image
            src={product.gallery[0].original}
            alt={product.name}
            fill
            className="object-contain"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.src = '/placeholder.png';
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <Package size={48} />
          </div>
        )}
      </div>
      
      <h3 className="font-semibold text-sm mb-1 line-clamp-2" title={product.name}>
        {product.name}
      </h3>
      
      <p className="text-xs text-gray-600 mb-2">{product.brand || 'No brand'}</p>
      
      {product.sales_count !== undefined && (
        <div className="flex items-center gap-1 mb-2">
          {[...Array(5)].map((_, i) => (
            <Star
              key={i}
              size={12}
              className={i < rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}
            />
          ))}
          <span className="text-xs text-gray-500 ml-1">({product.sales_count})</span>
        </div>
      )}
      
      <div className="flex justify-between items-center mb-2">
        <div>
          {isOnSale ? (
            <>
              <span className="font-bold text-lg text-red-600">
                ${product.sale_price?.toFixed(2)}
              </span>
              <span className="text-xs text-gray-500 line-through ml-2">
                ${product.price?.toFixed(2)}
              </span>
            </>
          ) : (
            <span className="font-bold text-lg">
              ${displayPrice?.toFixed(2) || 'N/A'}
            </span>
          )}
        </div>
        {isPopular && (
          <div className="flex items-center gap-1 text-green-600">
            <TrendingUp size={14} />
            <span className="text-xs">Popular</span>
          </div>
        )}
      </div>
      
      {product.is_in_stock === false && (
        <div className="flex items-center gap-1 text-red-600 text-xs">
          <AlertCircle size={12} />
          <span>Out of stock</span>
        </div>
      )}
      
      {product.category_l4 && (
        <p className="text-xs text-gray-500 mt-2 truncate" title={product.category_l4}>
          {product.category_l4}
        </p>
      )}
    </div>
  );
}
