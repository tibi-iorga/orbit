# Performance Optimizations

This document outlines optimizations made to handle 500+ feature requests efficiently.

## Database Optimizations

### Indexes
Added indexes on frequently queried fields:
- `clusterId` - for filtering features by cluster
- `importId` - for import-related queries
- Composite index on `(clusterId, title)` - for sorted cluster views

These indexes significantly speed up queries when filtering or sorting by cluster.

## API Optimizations

### Pagination
- Features API now supports server-side pagination
- Default page size: 50 items per page
- Reduces data transfer and memory usage
- Query params: `?page=1&pageSize=50`

### Server-Side Filtering
- Filtering by cluster now happens in the database query (`WHERE` clause)
- No longer loads all features then filters client-side
- Uses database indexes for fast lookups

### Batch Operations
- Import route now uses `createMany` with batching (500 items per batch)
- Reduces database round-trips from N to N/500
- Much faster for large CSV imports

### Auto-Cluster Limits
- Limited to 500 features max per clustering operation
- Prevents memory issues with very large datasets
- Users can cluster in batches if needed

## Frontend Optimizations

### Optimistic Updates
- Score updates show immediately in UI
- API call debounced by 500ms
- No full page reload on score changes
- Reduces perceived latency

### Component Memoization
- `ScoreCell` component wrapped in `React.memo`
- Prevents unnecessary re-renders
- Only updates when props actually change

### Debounced API Calls
- Score updates batched and debounced
- Multiple rapid clicks only trigger one API call
- Reduces server load

### Pagination UI
- Users navigate pages instead of loading all items
- Shows "Page X of Y" with Previous/Next buttons
- Resets to page 1 when filter changes

## Memory Management

### Next.js Config
- Optimized package imports for Prisma
- Reduced bundle size and memory footprint

### Efficient Data Structures
- Uses Maps for pending updates tracking
- Minimal object copying
- Computed values memoized

## Performance Characteristics

With these optimizations, the app can handle:
- **500+ features** without performance degradation
- **Large CSV imports** (batched processing)
- **Rapid score updates** (debounced, optimistic)
- **Multiple concurrent users** (server-side pagination)

## Monitoring

If you experience performance issues with 1000+ features:
1. Consider reducing page size (currently 50)
2. Add search/filter UI to reduce visible items
3. Consider virtual scrolling for very large lists
4. Monitor database query performance
