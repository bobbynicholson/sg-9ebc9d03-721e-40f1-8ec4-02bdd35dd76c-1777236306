# CateringMS Testing Guide

## 🧪 Testing Framework

The platform uses **Jest** and **React Testing Library** for automated testing.

---

## 📋 Running Tests

```bash
# Run tests in watch mode (during development)
npm test

# Run all tests once
npm run test:ci

# Run tests with coverage report
npm run test:coverage
```

---

## 📁 Test Structure

```
src/
├── __tests__/
│   ├── services/
│   │   ├── orderService.test.ts
│   │   ├── driverService.test.ts
│   │   └── ...
│   ├── components/
│   │   ├── Header.test.tsx
│   │   └── ...
│   └── lib/
│       ├── currencyUtils.test.ts
│       └── ...
```

---

## ✅ Test Examples

### Service Tests

**orderService.test.ts** - Tests order CRUD operations, status updates, workflow

```typescript
describe('OrderService', () => {
  it('should fetch all orders for a company', async () => {
    // Mock Supabase response
    // Call service method
    // Assert results
  });
});
```

**driverService.test.ts** - Tests route management, GPS tracking, deliveries

```typescript
describe('DriverService', () => {
  it('should update driver GPS location', async () => {
    // Mock location data
    // Update location
    // Assert success
  });
});
```

### Component Tests

**Header.test.tsx** - Tests navigation, authentication state display

```typescript
describe('Header', () => {
  it('shows login button when user is not authenticated', () => {
    // Render with unauthenticated context
    // Assert login button is visible
  });
});
```

### Utility Tests

**currencyUtils.test.ts** - Tests currency formatting and conversion

```typescript
describe('Currency Utils', () => {
  it('should format ZAR currency correctly', () => {
    expect(formatCurrency(1000, 'ZAR')).toBe('R1,000.00');
  });
});
```

---

## 🎯 Critical Test Paths

### Priority 1: Core Workflows
- [ ] Order creation flow
- [ ] Order status updates
- [ ] Driver assignment
- [ ] Payment processing
- [ ] Inventory deduction

### Priority 2: User Authentication
- [ ] Login/logout
- [ ] Role-based access
- [ ] Company isolation
- [ ] Session management

### Priority 3: Real-time Features
- [ ] Notifications
- [ ] GPS tracking
- [ ] Live order updates

### Priority 4: Financial Calculations
- [ ] Order totals
- [ ] Tax calculations
- [ ] Currency conversion
- [ ] Invoice generation

---

## 📊 Coverage Goals

**Current Coverage:** ~15% (initial tests)

**Target Coverage:**
- Services: 80%+
- Components: 70%+
- Utilities: 90%+
- Overall: 75%+

---

## 🚀 Adding New Tests

### 1. Service Tests

```typescript
// src/__tests__/services/yourService.test.ts
import { yourService } from '@/services/yourService';
import { supabase } from '@/integrations/supabase/client';

jest.mock('@/integrations/supabase/client');

describe('YourService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should do something', async () => {
    // Setup mocks
    const mockData = { /* ... */ };
    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockResolvedValue({ data: mockData, error: null }),
    });

    // Call method
    const result = await yourService.someMethod();

    // Assertions
    expect(result).toEqual(mockData);
  });
});
```

### 2. Component Tests

```typescript
// src/__tests__/components/YourComponent.test.tsx
import { render, screen } from '@testing-library/react';
import { YourComponent } from '@/components/YourComponent';

describe('YourComponent', () => {
  it('renders correctly', () => {
    render(<YourComponent />);
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });
});
```

### 3. Integration Tests

```typescript
// src/__tests__/integration/orderWorkflow.test.ts
describe('Order Workflow Integration', () => {
  it('completes full order lifecycle', async () => {
    // Create order
    // Assign staff
    // Update status
    // Complete delivery
    // Verify all steps
  });
});
```

---

## 🔧 Test Configuration

**jest.config.js** - Jest configuration with Next.js support

**jest.setup.js** - Global test setup, mocks, environment variables

---

## 📚 Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Next.js Testing](https://nextjs.org/docs/testing)

---

## 🎯 Next Steps

1. **Week 1:** Add integration tests for order workflows
2. **Week 2:** Add E2E tests for critical user journeys
3. **Week 3:** Reach 50% coverage
4. **Month 2:** Reach 75% coverage target

---

**Status:** ✅ Framework Ready - Add Tests as You Grow
**Priority:** P2 - Important (but not blocking launch)