# Bundle Size Analysis

This document provides an analysis of the EUI Dashboard bundle size and recommendations for optimization.

## Bundle Overview

### Current Bundle Statistics

| Metric | Value | Target |
|--------|-------|--------|
| **Total Bundle Size** | ~2.74 MB (uncompressed) | < 2 MB |
| **Gzipped Size** | ~650 KB (estimated) | < 500 KB |
| **Build Time** | 6.22s | < 10s |

## Bundle Composition

### Largest Dependencies (Estimated)

| Package | Size (approx) | Percentage |
|---------|---------------|------------|
| `@elastic/eui` | ~1.2 MB | 44% |
| `@elastic/charts` | ~600 KB | 22% |
| `react-dom` | ~150 KB | 5.5% |
| `@emotion/react` | ~120 KB | 4.4% |
| `moment` | ~100 KB | 3.6% |
| `recharts` | ~200 KB | 7.3% |
| Application code | ~350 KB | 13% |

### Analysis by Category

**UI Framework (EUI)**: 44%
- EUI components are tree-shakable but still large
- Icon system adds significant weight
- Theme system includes both light and dark modes

**Charting Libraries**: 29%
- @elastic/charts is full-featured but large
- recharts adds additional weight
- Consider consolidating on one library

**React Runtime**: 6%
- Standard React overhead
- Already optimized by Vite

**Utilities**: 4%
- moment.js is large for date handling
- Consider dayjs or date-fns alternatives

## Optimization Recommendations

### High Impact Optimizations

#### 1. Code Splitting with React.lazy

Split dashboard visualizations into lazy-loaded chunks:

```typescript
// Before
import { TimeSeriesChart } from './TimeSeriesChart'

// After
const TimeSeriesChart = React.lazy(() => import('./TimeSeriesChart'))

// Usage with Suspense
<Suspense fallback={<EuiLoadingSpinner />}>
  <TimeSeriesChart data={data} />
</Suspense>
```

**Impact**: ~15-20% reduction in initial bundle

#### 2. Dynamic Icon Imports

Currently all icons are bundled. Switch to dynamic imports:

```typescript
// Before (bundles all icons)
import { EuiIcon } from '@elastic/eui'

// After (tree-shakable)
import { EuiIcon } from '@elastic/eui'
// Only import specific icons used
```

**Impact**: ~10% reduction

#### 3. Replace moment.js with date-fns

```bash
npm uninstall moment
npm install date-fns
```

```typescript
// Before
import moment from 'moment'
moment(date).format('YYYY-MM-DD')

// After
import { format } from 'date-fns'
format(date, 'yyyy-MM-dd')
```

**Impact**: ~100 KB savings (moment is 100 KB vs date-fns tree-shakes to ~5 KB)

#### 4. Remove Duplicate Charting Library

Choose between @elastic/charts and recharts:

```bash
# If keeping @elastic/charts
npm uninstall recharts
```

**Impact**: ~200 KB savings

### Medium Impact Optimizations

#### 5. Lazy Load Analytics Panel

```typescript
const AnalyticsDashboardViz = React.lazy(() =>
  import('./visualizations/AnalyticsDashboardViz')
)
```

#### 6. Tree-Shake EUI Components

Ensure only used EUI components are imported:

```typescript
// Avoid
import { EuiButton, EuiPanel, EuiText, ... } from '@elastic/eui'

// Better - use specific imports when possible
import { EuiButton } from '@elastic/eui/lib/components/button'
```

#### 7. Optimize @emotion Usage

```typescript
// Use css prop efficiently
const styles = css`
  margin: 8px;
`
// Avoid inline css template literals in render
```

### Low Impact but Good Practices

#### 8. Compression Configuration

Ensure gzip/brotli compression is enabled on the server:

```nginx
# nginx config
gzip on;
gzip_types text/plain application/javascript text/css;
gzip_min_length 1024;
```

#### 9. Preload Critical Resources

```html
<link rel="preload" href="/assets/main.js" as="script">
<link rel="preload" href="/assets/main.css" as="style">
```

#### 10. Asset Optimization

- Use SVG sprites for icons
- Optimize PNG/JPG images with compression
- Use WebP format where supported

## Implementation Priority

### Phase 1 (High Priority)
1. Replace moment.js with date-fns
2. Remove recharts (consolidate on @elastic/charts)
3. Implement basic code splitting

**Expected Result**: Bundle size reduced to ~2.1 MB

### Phase 2 (Medium Priority)
4. Dynamic icon imports
5. Lazy load secondary visualizations
6. Optimize @emotion usage

**Expected Result**: Bundle size reduced to ~1.8 MB

### Phase 3 (Optimization)
7. Enable advanced tree-shaking
8. Add compression to server
9. Implement preloading

**Expected Result**: Gzipped transfer size < 400 KB

## Running Bundle Analysis

### Generate Visual Analysis

```bash
cd /Users/ryandahlberg/Projects/commit-relay/eui-dashboard

# Build first
npm run build

# Run visualizer
npm run analyze
```

This generates an interactive treemap visualization showing bundle composition.

### Analyze with Source Maps

```bash
# Using source-map-explorer
npx source-map-explorer dist/assets/*.js
```

## Performance Metrics

### Target Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Initial Bundle | 2.74 MB | < 1.5 MB |
| Gzipped Size | ~650 KB | < 400 KB |
| First Contentful Paint | ~1.2s | < 1.0s |
| Time to Interactive | ~2.5s | < 2.0s |
| Lighthouse Performance | ~75 | > 90 |

### Monitoring

Track bundle size in CI:

```yaml
# .github/workflows/bundle-size.yml
- name: Check bundle size
  run: |
    npm run build
    SIZE=$(stat -f%z dist/assets/*.js)
    if [ $SIZE -gt 2000000 ]; then
      echo "Bundle size exceeds 2MB"
      exit 1
    fi
```

## Resources

- [Vite Build Optimization](https://vitejs.dev/guide/features.html#build-optimizations)
- [React Code Splitting](https://react.dev/reference/react/lazy)
- [EUI Tree Shaking](https://elastic.github.io/eui/#/guidelines/getting-started)
- [Webpack Bundle Analyzer](https://www.npmjs.com/package/webpack-bundle-analyzer)

## Appendix: Dependency Audit

### Direct Dependencies
- @elastic/charts: Required for visualizations
- @elastic/eui: Core UI framework
- @elastic/datemath: Time range parsing
- @emotion/react: Required by EUI
- moment: **Candidate for replacement**
- react: Core framework
- react-dom: React DOM rendering
- recharts: **Candidate for removal**

### Dev Dependencies
- vite: Build tool
- typescript: Type checking
- vitest: Testing framework
- vite-bundle-visualizer: Analysis tool
