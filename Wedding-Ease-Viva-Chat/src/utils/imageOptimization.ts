import React, { useState, useCallback } from 'react';

/**
 * If the URL points to Firebase Storage, append a width parameter for CDN resizing.
 * Otherwise, return the URL unchanged.
 */
export function getOptimizedImageUrl(url: string, width: number): string {
  if (!url) return url;

  // Firebase Storage URLs typically contain firebasestorage.googleapis.com
  if (url.includes('firebasestorage.googleapis.com')) {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}w=${width}`;
  }

  return url;
}

/**
 * Generate a CSS gradient placeholder that mimics a blurred image.
 * Uses the app's gold color palette for a themed look.
 */
export function generateBlurHash(width: number, height: number): string {
  const aspectRatio = width / height;
  // Gold-tinted gradient placeholder
  if (aspectRatio > 1) {
    // Landscape
    return 'linear-gradient(135deg, #f5e6d0 0%, #e8d5b8 40%, #A17A6333 70%, #f0dcc4 100%)';
  }
  // Portrait or square
  return 'linear-gradient(180deg, #f5e6d0 0%, #e8d5b8 50%, #A17A6333 80%, #f0dcc4 100%)';
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  ImageWithPlaceholder component                                           */
/* ─────────────────────────────────────────────────────────────────────────── */

export interface ImageWithPlaceholderProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
}

/**
 * An image component that:
 * - Shows a gold-tinted gradient placeholder while loading
 * - Uses `loading="lazy"` and `decoding="async"` for performance
 * - Fades in the actual image once loaded
 */
export const ImageWithPlaceholder: React.FC<ImageWithPlaceholderProps> = ({
  src,
  alt,
  width,
  height,
  className = '',
}) => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const handleLoad = useCallback(() => setLoaded(true), []);
  const handleError = useCallback(() => setError(true), []);

  const placeholderGradient = generateBlurHash(width ?? 400, height ?? 300);
  const optimizedSrc = width ? getOptimizedImageUrl(src, width) : src;

  return React.createElement(
    'div',
    {
      className: `relative overflow-hidden ${className}`,
      style: {
        background: placeholderGradient,
        width: width ? `${width}px` : undefined,
        height: height ? `${height}px` : undefined,
      },
    },
    !error &&
      React.createElement('img', {
        src: optimizedSrc,
        alt,
        loading: 'lazy' as const,
        decoding: 'async' as const,
        onLoad: handleLoad,
        onError: handleError,
        className: `w-full h-full object-cover transition-opacity duration-300 ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`,
        ...(width ? { width } : {}),
        ...(height ? { height } : {}),
      }),
    error &&
      React.createElement(
        'div',
        {
          className:
            'flex items-center justify-center w-full h-full text-sm text-foreground/40',
          'aria-label': 'Image failed to load',
        },
        'Image unavailable',
      ),
  );
};
