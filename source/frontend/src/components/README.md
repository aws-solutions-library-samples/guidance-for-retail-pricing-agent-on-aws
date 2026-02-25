# Product Catalog Management Components

This directory contains the React components for the Product Catalog Management feature, implementing a modern hybrid architecture with static categories and GraphQL-based product fetching.

## 🏗️ Architecture Overview

The Product Catalog Management system uses a **hybrid serverless architecture**:

- **Static Categories**: Bundled with frontend build for instant loading
- **GraphQL Products**: Dynamic fetching via AWS AppSync with cursor-based pagination
- **Real-time Updates**: GraphQL subscriptions for live product updates
- **Advanced Caching**: Apollo Client with intelligent cache management
- **Accessibility**: WCAG 2.1 AA compliant with comprehensive screen reader support

## 📁 Component Structure

```
src/frontend/src/components/
├── ProductSelector.tsx           # Main container component
├── CategorySelector.tsx          # Category selection with static data
├── ProductCatalogGrid.tsx        # Product grid with responsive layout
├── ProductFilters.tsx            # Dynamic category-specific filters
├── ProductSearch.tsx             # Debounced search with GraphQL
├── ProductDetailModal.tsx        # Product details with validation
├── ProductCard.tsx               # Individual product display
├── ProfileDropdown.tsx           # User profile dropdown with logout
└── README.md                     # This documentation
```

## 🎯 Component Responsibilities

### ProductSelector (Main Container)
**Purpose**: Orchestrates the complete product catalog workflow

**Key Features**:
- Category selection state management
- Product fetching with GraphQL integration
- Comprehensive error handling with retry logic
- Authentication integration with AWS Cognito
- Pricing workflow initiation
- Navigation management
- Notification system integration

**Props**: None (uses hooks for data management)

**Usage**:
```typescript
import { ProductSelector } from './components/ProductSelector';

// Basic usage
<ProductSelector />

// With callbacks
<ProductSelector 
  onProductSelected={(product) => console.log('Selected:', product)}
  isStartingAnalysis={false}
/>
```

### CategorySelector
**Purpose**: Display and select product categories using static data

**Key Features**:
- Instant loading with bundled category data
- 2x2 responsive grid layout
- Category icons and product counts
- Keyboard navigation support
- Screen reader accessibility

**Props**:
```typescript
interface CategorySelectorProps {
  categories: CategoryInfo[];
  selectedCategory?: ProductCategory | null;
  onCategorySelect: (category: ProductCategory) => void;
  isLoading?: boolean;
  error?: Error | null;
}
```

**Usage**:
```typescript
<CategorySelector
  categories={categories}
  selectedCategory={selectedCategory}
  onCategorySelect={handleCategorySelect}
  isLoading={false}
  error={null}
/>
```

### ProductCatalogGrid
**Purpose**: Display products in a responsive 4-column grid

**Key Features**:
- CloudScape Tiles component integration
- Responsive grid layout (1-4 columns based on screen size)
- Product selection state management
- Loading states and empty state handling
- Accessibility with ARIA live regions

**Props**:
```typescript
interface ProductCatalogGridProps {
  products: ProductType[];
  selectedProductID?: string;
  onProductSelect?: (productId: string) => void;
  onShowProductDetails?: (product: ProductType) => void;
  isLoading?: boolean;
  isLoadingMore?: boolean;
  error?: Error | null;
  hasMoreProducts?: boolean;
  onLoadMore?: () => void;
  totalCount?: number;
  isEmpty?: boolean;
  emptyStateMessage?: string;
}
```

### ProductFilters
**Purpose**: Dynamic filtering based on selected category

**Key Features**:
- Category-specific filter controls
- AND logic for multiple filters
- URL parameter synchronization
- Real-time filter result counts
- GraphQL filter options integration

**Supported Filters by Category**:
- **Power Tools**: Power type, battery voltage, color
- **Apparel**: Size, color, material, gender, season
- **Footwear**: Size, width, style, material
- **Kitchen**: Capacity, power, material, color

**Props**:
```typescript
interface ProductFiltersProps {
  category: ProductCategory;
  filters: CategorySpecificFilters;
  onFilterChange: (filters: CategorySpecificFilters) => void;
  filterOptions?: CategoryFilterOptions | null;
  isLoadingOptions?: boolean;
  optionsError?: GraphQLServiceError | null;
  filteredCount?: number;
  totalCount?: number;
}
```

### ProductSearch
**Purpose**: Real-time product search with debouncing

**Key Features**:
- 300ms debounced search to prevent excessive API calls
- Category-specific placeholder text
- GraphQL search integration
- Case-insensitive matching across multiple fields
- Clear search functionality

**Search Fields**:
- Product ID
- Vendor name
- Subcategory
- Role/tier
- Category-specific attributes

**Props**:
```typescript
interface ProductSearchProps {
  category: ProductCategory;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  placeholder?: string;
  disabled?: boolean;
  isLoading?: boolean;
}
```

### ProductDetailModal
**Purpose**: Display comprehensive product information

**Key Features**:
- Category-specific attribute organization
- Product validation for pricing analysis
- Large product image with fallback
- Pricing information display
- Feature list presentation
- Accessibility with focus management

**Category-Specific Sections**:
- **Power Tools**: "Power Specifications" (power type, battery, motor, etc.)
- **Apparel**: "Size & Fit" (size, color, material, gender, etc.)
- **Footwear**: "Size & Style" (size, width, style, material, etc.)
- **Kitchen**: "Specifications" (capacity, power, material, dimensions, etc.)

**Props**:
```typescript
interface ProductDetailModalProps {
  product: ProductType | null;
  isOpen: boolean;
  onClose: () => void;
  onStartPricingAnalysis: (product: ProductType) => void;
  isStarting?: boolean;
}
```

### ProductCard
**Purpose**: Individual product display in the catalog grid

**Key Features**:
- Product image with lazy loading and fallback
- Role badge with color coding (Best=green, Better=blue, Good=red, Entry=grey)
- Hover and focus states
- Keyboard navigation support
- Screen reader accessibility

**Role Badge Colors**:
- **Best**: Green (premium tier)
- **Better**: Blue (high-quality tier)
- **Good**: Red (standard tier)
- **Entry**: Grey (basic tier)

**Props**:
```typescript
interface ProductCardProps {
  product: ProductType;
  isSelected?: boolean;
  onSelect?: (productId: string) => void;
}
```

### ProfileDropdown
**Purpose**: User profile dropdown with authentication controls

**Key Features**:
- User email display as dropdown trigger
- User avatar with initials
- Profile navigation menu item
- Logout functionality with optional confirmation
- Loading states during authentication operations
- Keyboard navigation support
- Screen reader accessibility

**Props**:
```typescript
interface ProfileDropdownProps {
  user: CognitoUser;
  onLogout?: () => void;
  showLogoutConfirmation?: boolean;
}
```

**Usage**:
```typescript
import { ProfileDropdown } from './components/ProfileDropdown';
import { useAuth } from '../hooks/useAuth';

function AppHeader() {
  const { user } = useAuth();
  
  if (!user) return null;
  
  return (
    <ProfileDropdown
      user={user}
      onLogout={() => console.log('User logged out')}
      showLogoutConfirmation={true}
    />
  );
}
```

## 🔧 Integration Patterns

### Hook Integration
All components integrate with the hybrid architecture hooks:

```typescript
import { useProductCatalog } from '../hooks/useProductCatalog';

const {
  // Static categories (instant loading)
  categories,
  selectedCategory,
  selectCategory,
  
  // GraphQL products (dynamic)
  products,
  isLoadingProducts,
  productsError,
  
  // Filtering and search
  filters,
  setFilters,
  searchQuery,
  setSearchQuery,
  
  // Product selection
  selectedProduct,
  selectProduct
} = useProductCatalog();
```

### Error Handling Pattern
Components use comprehensive error handling:

```typescript
import { useErrorHandler } from '../hooks/useErrorHandler';

const {
  hasError,
  currentError,
  isRetrying,
  retryCount,
  handleError,
  retry,
  clearError,
  canRetry
} = useErrorHandler({
  maxRetries: 3,
  enableAutoRetry: false,
  logErrors: true,
  showNotifications: true
});
```

### Notification Integration
Components integrate with the notification system:

```typescript
import { useAtom } from 'jotai';
import { 
  addNotificationAtom,
  createSuccessNotification,
  createErrorNotification 
} from '../atoms/notification';

const [, addNotification] = useAtom(addNotificationAtom);

// Success notification
addNotification(createSuccessNotification(
  'Success',
  'Operation completed successfully'
));

// Error notification
addNotification(createErrorNotification(
  'Error',
  'Operation failed. Please try again.'
));
```

## 🎨 Styling and Design

### CloudScape Design System
All components use CloudScape Design System components:

- **Layout**: Container, SpaceBetween, Grid, Box
- **Navigation**: BreadcrumbGroup, Button
- **Data Display**: Cards, Tiles, Badge, StatusIndicator
- **Input**: Input, Multiselect, FormField
- **Feedback**: Alert, Spinner, Flashbar
- **Overlay**: Modal

### Responsive Design
Components adapt to different screen sizes:

- **Mobile**: Single column layout, stacked filters
- **Tablet**: 2-column grid, horizontal filters
- **Desktop**: 4-column grid, sidebar filters
- **Large Desktop**: Optimized spacing and typography

### Accessibility Features
All components implement WCAG 2.1 AA standards:

- **Keyboard Navigation**: Tab, Enter, Space, Arrow keys
- **Screen Reader Support**: ARIA labels, live regions, descriptions
- **Focus Management**: Visible focus indicators, logical tab order
- **Color Contrast**: Sufficient contrast ratios for all text
- **Alternative Text**: Descriptive alt text for all images

## 🔍 Search and Filtering Logic

### Search Implementation
The search functionality uses GraphQL with the following logic:

1. **Debouncing**: 300ms delay to prevent excessive API calls
2. **Field Matching**: Searches across product ID, vendor, subcategory, role, and attributes
3. **Case Insensitive**: All searches are case-insensitive
4. **Partial Matching**: Supports partial word matching
5. **Category Scoped**: Search is limited to the selected category

### Filter Logic
Filters use AND logic (all selected filters must match):

1. **Role Filter**: Common across all categories (Best, Better, Good, Entry)
2. **Subcategory Filter**: Category-specific subcategories
3. **Attribute Filters**: Category-specific attributes (size, color, material, etc.)
4. **Price Range**: Optional min/max price filtering
5. **Vendor Filter**: Filter by product vendor

### URL Synchronization
Filters and search queries are synchronized with URL parameters:

```
/products?category=powertools&roles=best,better&powerTypes=cordless&search=drill
```

## 📊 Performance Optimizations

### Loading Strategies
- **Static Categories**: Instant loading with bundled data
- **Lazy Loading**: Images load only when visible
- **Cursor Pagination**: Efficient pagination for large product sets
- **Debounced Search**: Prevents excessive API calls
- **Apollo Caching**: Intelligent GraphQL query caching

### Memory Management
- **Component Cleanup**: Proper cleanup of event listeners and timers
- **State Optimization**: Minimal re-renders with optimized state updates
- **Image Optimization**: Responsive images with proper sizing
- **Cache Management**: Automatic cache cleanup and optimization

## 🧪 Testing Approach

### Component Testing
Each component has comprehensive unit tests:

```typescript
// Example test structure
describe('ProductSelector Component', () => {
  it('should render category selection when no category selected', () => {
    // Test implementation
  });
  
  it('should display products when category is selected', () => {
    // Test implementation
  });
  
  it('should handle product selection', () => {
    // Test implementation
  });
  
  it('should handle error states gracefully', () => {
    // Test implementation
  });
});
```

### Integration Testing
Integration tests cover complete workflows:

- Category selection → Product display
- Product filtering → Updated results
- Product search → Search results
- Product selection → Pricing analysis

### Accessibility Testing
All components are tested with:

- **axe-core**: Automated accessibility testing
- **Screen Reader Testing**: Manual testing with VoiceOver/NVDA
- **Keyboard Navigation**: Complete keyboard-only testing
- **Color Contrast**: Automated contrast ratio validation

## 🚀 Usage Examples

### Basic Product Catalog
```typescript
import { ProductSelector } from './components/ProductSelector';

function App() {
  return (
    <div>
      <ProductSelector />
    </div>
  );
}
```

### Custom Product Selection Handler
```typescript
import { ProductSelector } from './components/ProductSelector';
import { ProductType } from './types/product-types';

function App() {
  const handleProductSelected = (product: ProductType) => {
    console.log('Product selected for analysis:', product);
    // Custom logic here
  };

  return (
    <ProductSelector 
      onProductSelected={handleProductSelected}
      isStartingAnalysis={false}
    />
  );
}
```

### Individual Component Usage
```typescript
import { CategorySelector, ProductCatalogGrid } from './components';

function CustomCatalog() {
  const { categories, products, selectedCategory } = useProductCatalog();

  return (
    <div>
      {!selectedCategory ? (
        <CategorySelector
          categories={categories}
          onCategorySelect={selectCategory}
        />
      ) : (
        <ProductCatalogGrid
          products={products}
          onProductSelect={selectProduct}
        />
      )}
    </div>
  );
}
```

## 🔧 Troubleshooting

### Common Issues

1. **Categories Not Loading**
   - Check if static category data is properly bundled
   - Verify import paths for category data
   - Check browser console for import errors

2. **Products Not Loading**
   - Verify GraphQL endpoint configuration
   - Check authentication tokens
   - Review network requests in browser dev tools

3. **Search Not Working**
   - Ensure search query is properly debounced
   - Check GraphQL search resolver configuration
   - Verify search index in DynamoDB

4. **Filters Not Applying**
   - Check filter options are loaded from GraphQL
   - Verify filter state management
   - Review URL parameter synchronization

5. **Images Not Loading**
   - Check image URLs and CloudFront configuration
   - Verify fallback image handling
   - Review CORS settings for image requests

### Debug Tools

```typescript
// Enable debug logging
localStorage.setItem('debug', 'product-catalog:*');

// Check service status
const status = catalogService.getServiceStatus();
console.log('Service status:', status);

// Monitor GraphQL queries
// Open Apollo Client DevTools in browser
```

### Performance Monitoring

```typescript
// Monitor component render performance
import { Profiler } from 'react';

<Profiler id="ProductSelector" onRender={onRenderCallback}>
  <ProductSelector />
</Profiler>

// Monitor GraphQL query performance
// Use Apollo Client DevTools to track query timing
```

## 📚 Related Documentation

- [Catalog Service Architecture](../services/README.md)
- [Product Type Definitions](../types/product-types.ts)
- [GraphQL Hooks](../hooks/useProductCatalog.ts)
- [Testing Guidelines](../../../../tests/frontend/README.md)
- [Accessibility Standards](../../../docs/accessibility-improvements-summary.md)

## 🔄 Future Enhancements

### Planned Features
1. **Advanced Search**: Faceted search with multiple criteria
2. **Product Comparison**: Side-by-side product comparison
3. **Favorites**: Save favorite products for quick access
4. **Recent Products**: Track recently viewed products
5. **Bulk Operations**: Select multiple products for batch operations

### Performance Improvements
1. **Virtual Scrolling**: For very large product catalogs
2. **Progressive Loading**: Load product details on demand
3. **Image Optimization**: WebP format with fallbacks
4. **Service Worker**: Offline support for cached data

### Accessibility Enhancements
1. **High Contrast Mode**: Enhanced contrast theme
2. **Reduced Motion**: Respect user motion preferences
3. **Voice Navigation**: Voice command support
4. **Screen Reader Improvements**: Enhanced screen reader experience

This comprehensive component library provides a solid foundation for the Product Catalog Management feature with modern architecture, excellent performance, and full accessibility support.