---
applyTo: '**/*.js'
description: 'Performance optimization best practices for frontend JavaScript, DOM, caching, and Web Workers.'
---

# Performance Optimization Best Practices

## General Principles

- **Measure First, Optimize Second:** Always profile and measure before optimizing. Use benchmarks, profilers, and monitoring tools to identify real bottlenecks. Guessing is the enemy of performance.
  - *Pro Tip:* Use tools like Chrome DevTools, Lighthouse, or your language's built-in profilers.
- **Optimize for the Common Case:** Focus on optimizing code paths that are most frequently executed. Don't waste time on rare edge cases unless they're critical.
- **Avoid Premature Optimization:** Write clear, maintainable code first; optimize only when necessary. Premature optimization can make code harder to read and maintain.
- **Minimize Resource Usage:** Use memory, CPU, network, and disk resources efficiently. Always ask: "Can this be done with less?"
- **Prefer Simplicity:** Simple algorithms and data structures are often faster and easier to optimize. Don't over-engineer.
- **Document Performance Assumptions:** Clearly comment on any code that is performance-critical or has non-obvious optimizations.
- **Set Performance Budgets:** Define acceptable limits for load time, memory usage, API latency, etc.

---

## Frontend Performance

### Rendering and DOM

- **Minimize DOM Manipulations:** Batch updates where possible. Frequent DOM changes are expensive.
  - *Anti-pattern:* Updating the DOM in a loop. Instead, build a document fragment and append it once.
- **Keys in Lists:** Always use stable keys in lists to help diffing. Avoid using array indices as keys unless the list is static.
- **Avoid Inline Styles:** Inline styles can trigger layout thrashing. Prefer CSS classes.
- **CSS Animations:** Use CSS transitions/animations over JavaScript for smoother, GPU-accelerated effects.
- **Defer Non-Critical Rendering:** Use `requestIdleCallback` or similar to defer work until the browser is idle.

### Asset Optimization

- **Minification and Bundling:** Use Webpack, Rollup, or esbuild to bundle and minify JS/CSS. Enable tree-shaking to remove dead code.
- **Cache Headers:** Set long-lived cache headers for static assets. Use cache busting for updates.
- **Lazy Loading:** Use `loading="lazy"` for images, and dynamic imports for JS modules/components.

### Network Optimization

- **Reduce HTTP Requests:** Combine files, use image sprites, and inline critical CSS.
- **Client-Side Caching:** Use Service Workers, IndexedDB, and localStorage for offline and repeat visits.
- **Defer/Async Scripts:** Use `defer` or `async` for non-critical JS to avoid blocking rendering.
- **Preload and Prefetch:** Use `<link rel="preload">` and `<link rel="prefetch">` for critical resources.

### JavaScript Performance

- **Avoid Blocking the Main Thread:** Offload heavy computation to Web Workers.
- **Debounce/Throttle Events:** For scroll, resize, and input events, use debounce/throttle to limit handler frequency.
- **Memory Leaks:** Clean up event listeners, intervals, and DOM references. Use browser dev tools to check for detached nodes.
- **Efficient Data Structures:** Use Maps/Sets for lookups, TypedArrays for numeric data.
- **Avoid Global Variables:** Globals can cause memory leaks and unpredictable performance.
- **Avoid Deep Object Cloning:** Use shallow copies only when necessary.

### Common Frontend Pitfalls

- Loading large JS bundles on initial page load.
- Failing to clean up event listeners, causing memory leaks.
- Overusing third-party libraries for simple tasks.

### Frontend Troubleshooting

- Use Chrome DevTools' Performance tab to record and analyze slow frames.
- Use Lighthouse to audit performance and get actionable suggestions.

---

## Backend / Algorithm Performance

### Algorithm and Data Structure Optimization

- **Choose the Right Data Structure:** Arrays for sequential access, hash maps for fast lookups, trees for hierarchical data, etc.
- **Efficient Algorithms:** Use binary search, quicksort, or hash-based algorithms where appropriate.
- **Avoid O(n²) or Worse:** Profile nested loops and recursive calls. Refactor to reduce complexity.
- **Batch Processing:** Process data in batches to reduce overhead (e.g., bulk operations).
- **Streaming:** Use streaming APIs for large data sets to avoid loading everything into memory.

### Concurrency and Parallelism

- **Asynchronous I/O:** Use async/await, callbacks, or event loops to avoid blocking threads.
- **Thread/Worker Pools:** Use pools to manage concurrency and avoid resource exhaustion.
- **Bulk Operations:** Batch network/database calls to reduce round trips.

### Caching

- **Cache Expensive Computations:** Use in-memory caches for hot data.
- **Cache Invalidation:** Use time-based (TTL), event-based, or manual invalidation. Stale cache is worse than no cache.
- **Don't Cache Everything:** Some data is too volatile or sensitive to cache.
- **Bound Cache Size:** Implement LRU or similar eviction to prevent unbounded memory growth.

### Logging and Monitoring

- **Minimize Logging in Hot Paths:** Excessive logging can slow down critical code.
- **Structured Logging:** Use JSON or key-value logs for easier parsing and analysis.

---

## Code Review Checklist for Performance

- [ ] Are there any obvious algorithmic inefficiencies (O(n²) or worse)?
- [ ] Are data structures appropriate for their use?
- [ ] Are there unnecessary computations or repeated work?
- [ ] Is caching used where appropriate, and is invalidation handled correctly?
- [ ] Are large payloads paginated, streamed, or chunked?
- [ ] Are there any memory leaks or unbounded resource usage?
- [ ] Are network requests minimized, batched, and retried on failure?
- [ ] Are there any blocking operations in hot paths?
- [ ] Is logging in hot paths minimized and structured?
- [ ] Are performance-critical code paths documented and tested?
- [ ] Are there any anti-patterns (e.g., blocking I/O, global variables)?

---

## Practical Examples

### Example 1: Debouncing User Input in JavaScript

```javascript
// BAD: Triggers API call on every keystroke
input.addEventListener('input', (e) => {
  fetch(`/search?q=${e.target.value}`);
});

// GOOD: Debounce API calls
let timeout;
input.addEventListener('input', (e) => {
  clearTimeout(timeout);
  timeout = setTimeout(() => {
    fetch(`/search?q=${e.target.value}`);
  }, 300);
});
```

### Example 2: Asynchronous I/O

```javascript
// BAD: Blocking file read
const data = fs.readFileSync('file.txt');

// GOOD: Non-blocking file read
fs.readFile('file.txt', (err, data) => {
  if (err) throw err;
  // process data
});
```
