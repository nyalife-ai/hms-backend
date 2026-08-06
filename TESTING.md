# API Test Suite Documentation

## Overview

This test suite provides comprehensive coverage for the API, including:
- **Unit Tests** - Test individual classes, services, and functions in isolation
- **Integration Tests** - Test modules together (controllers + services + repositories)
- **E2E Tests** - Simulate full API flows from end to end
- **Smoke Tests** - Quick verification of critical flows after deployment
- **Regression Tests** - Ensure previously fixed bugs don't resurface
- **Security Tests** - Verify encryption, JWT validity, and authentication flows
- **Performance Tests** - Load testing and response time measurement

## Test Commands

```bash
# Run all unit tests
npm run test

# Run all unit tests with coverage
npm run test:cov

# Run E2E tests (requires database)
npm run test:e2e

# Run smoke tests (quick deployment verification)
npm run test:smoke

# Run regression tests (pre-deployment)
npm run test:regression

# Run integration tests
npm run test:integration

# Run security tests
npm run test:security

# Run load tests (requires k6)
npm run test:load

# Run all tests
npm run test:all
```

## Test Structure

```
src/
├── modules/
│   ├── resources/
│   │   ├── __tests__/
│   │   │   ├── resources.service.spec.ts     # Unit tests
│   │   │   ├── resources.controller.spec.ts  # Unit tests
│   │   │   ├── entities.spec.ts              # Entity tests
│   │   │   └── integration.spec.ts           # Integration tests
│   │   └── value-objects/
│   │       └── __tests__/
│   │           ├── money.vo.spec.ts          # Money VO tests
│   │           └── phone-number.vo.spec.ts   # PhoneNumber VO tests
│   ├── auth/
│   │   └── __tests__/
│   │       ├── auth.service.spec.ts          # Unit tests
│   │       ├── auth.controller.spec.ts       # Unit tests
│   │       └── security.spec.ts              # Security tests
│   └── ...

test/
├── app.e2e-spec.ts              # Main E2E tests
├── smoke.e2e-spec.ts            # Smoke tests
├── regression.e2e-spec.ts       # Regression tests
├── load-test.k6.js              # k6 load testing script
└── utils/
    └── performance.utils.ts     # Performance testing utilities
```

## Unit Tests

Unit tests verify individual components in isolation without external dependencies.

### Example: Value Object Tests

```typescript
// src/modules/resources/value-objects/__tests__/money.vo.spec.ts
describe('Money Value Object', () => {
  it('should create a valid Money instance', () => {
    const money = new Money(500);
    expect(money.amount).toBe(500);
    expect(money.currency).toBe('USD');
  });

  it('should throw for non-integer amount', () => {
    expect(() => new Money(1.5)).toThrow(BadRequestException);
  });
});
```

### Example: Service Tests

```typescript
// src/modules/resources/__tests__/resources.service.spec.ts
describe('ResourcesService', () => {
  let service: ResourcesService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ResourcesService,
        { provide: CreateResourceUseCase, useValue: mockCreateUseCase },
        // ... other mocks
      ],
    }).compile();
    service = module.get<ResourcesService>(ResourcesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
```

## Integration Tests

Integration tests verify that multiple components work together correctly.

```typescript
// src/modules/resources/__tests__/integration.spec.ts
describe('Resource Module Integration Tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  it('should create a resource', async () => {
    const res = await request(app.getHttpServer())
      .post('/resources')
      .send({ name: 'Sample Resource', owner_id: 1 });
    
    expect(res.status).toBe(201);
  });
});
```

## E2E Tests

E2E tests simulate real user scenarios and API flows.

```typescript
// test/app.e2e-spec.ts
describe('API (e2e)', () => {
  it('POST /auth/login with admin credentials', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@example.com', password: 'AdminPass123!' })
      .expect(201);
    
    expect(res.body.access_token).toBeDefined();
  });
});
```

## Smoke Tests

Smoke tests are quick checks to verify critical functionality after deployment.

**Run time:** < 30 seconds

```bash
npm run test:smoke
```

Tests include:
- Health check endpoints
- Authentication flow
- Input validation
- Protected endpoint access control

## Regression Tests

Regression tests ensure previously fixed bugs don't resurface.

**Run before:** Every deployment

```bash
npm run test:regression
```

Tracked bugs:
- Bug #001: Phone Number Validation
- Bug #002: Numeric Amount Validation
- Bug #003: JWT Token Validation
- Bug #004: Ledger Balance Calculation
- Bug #005: Webhook Idempotency
- Bug #006: Role-Based Access Control
- Bug #007: Token Decoding
- Bug #008: Queue Management
- Bug #009: Encryption/Decryption
- Bug #010: Health Check Endpoints

## Security Tests

Security tests verify authentication, authorization, and encryption.

```bash
npm run test:security
```

Tests include:
- JWT token generation and verification
- Token expiration handling
- Password hashing with bcrypt
- Role-based access control (RBAC)
- Encryption/decryption with AES-256
- Guard functionality

## Performance/Load Tests

Load tests measure API performance under various load conditions.

### Using k6

**Install k6:** https://k6.io/docs/getting-started/installation/

**Run load test:**
```bash
npm run test:load
```

**With custom configuration:**
```bash
BASE_URL=http://api.example.com AUTH_TOKEN=your-jwt-token k6 run test/load-test.k6.js
```

### Load Test Stages

1. **Ramp up** (30s): 0 → 10 users
2. **Sustained** (1m): 10 users
3. **Ramp up** (30s): 10 → 50 users
4. **Sustained** (2m): 50 users
5. **Peak load** (30s): 50 → 100 users
6. **Sustained peak** (2m): 100 users
7. **Ramp down** (30s): 100 → 50 users
8. **Ramp down** (30s): 50 → 0 users

### Performance Thresholds

| Endpoint Type | Max Response Time | Min RPS | Max Error Rate |
|--------------|-------------------|---------|----------------|
| Health       | 100ms            | 100     | 1%             |
| Auth         | 500ms            | 50      | 1%             |
| Transactions | 1000ms           | 20      | 0.1%           |
| Webhooks     | 200ms            | 100     | 0.1%           |

## Writing New Tests

### Unit Test Template

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { MyService } from '../my.service';

describe('MyService - Unit Tests', () => {
  let service: MyService;
  const mockDependency = { method: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MyService,
        { provide: 'DEPENDENCY', useValue: mockDependency },
      ],
    }).compile();
    service = module.get<MyService>(MyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('methodName()', () => {
    it('should do something', async () => {
      mockDependency.method.mockResolvedValue('result');
      const result = await service.methodName('input');
      expect(result).toBe('result');
    });
  });
});
```

### Integration Test Template

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../app.module';

describe('Module Integration Tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should work together', async () => {
    const res = await request(app.getHttpServer())
      .get('/endpoint')
      .expect(200);
    expect(res.body).toBeDefined();
  });
});
```

## CI/CD Integration

### GitHub Actions Example

The repository ships with a full CI pipeline in `.github/workflows/ci.yml`
(lint, unit tests with coverage + JUnit reporting, E2E tests against
PostgreSQL + Redis service containers, build check, dependency audit, and
secret scanning). A minimal standalone example:

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15-alpine
        env:
          POSTGRES_USER: app_user
          POSTGRES_PASSWORD: app_test_pass
          POSTGRES_DB: app_test_db
        ports:
          - 5432:5432
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm run test:cov

      - name: Run E2E tests
        run: npm run test:e2e
        env:
          DB_HOST: localhost
          REDIS_HOST: localhost

      - name: Run smoke tests
        run: npm run test:smoke

      - name: Run security tests
        run: npm run test:security
```

## Best Practices

1. **Test Isolation**: Unit tests should not depend on external services
2. **Mock External Dependencies**: Use mocks for databases, APIs, and services
3. **Descriptive Names**: Use clear test names that describe the expected behavior
4. **AAA Pattern**: Arrange, Act, Assert - structure tests clearly
5. **Edge Cases**: Test boundary conditions and error scenarios
6. **Regression Coverage**: Add tests for every bug fix
7. **Fast Feedback**: Keep tests fast for quick iteration
8. **Deterministic**: Tests should pass/fail consistently

## Coverage Goals

| Component Type | Target Coverage |
|---------------|-----------------|
| Value Objects | 100%            |
| Services      | 90%+            |
| Controllers   | 85%+            |
| Use Cases     | 90%+            |
| Guards        | 95%+            |
| Security      | 100%            |

## Troubleshooting

### Tests failing with "Cannot find module"
- Check import paths are relative, not absolute
- Ensure `moduleNameMapper` is configured in `package.json`

### Tests failing with ESM module errors
- Check `transformIgnorePatterns` includes the module
- Use `jest.mock()` for problematic modules

### E2E tests failing
- Ensure database and Redis are running
- Check environment variables are set correctly
- Run `docker-compose up mysql redis` for local testing

### Load tests timing out
- Increase k6 timeout in script options
- Check if service is running and accessible
- Verify BASE_URL environment variable

## Additional Resources

- [NestJS Testing Documentation](https://docs.nestjs.com/fundamentals/testing)
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [k6 Documentation](https://k6.io/docs/)
- [Testing Best Practices](https://github.com/goldbergyoni/nodebestpractices/blob/master/sections/testingandquality/testingbestpractices.md)
