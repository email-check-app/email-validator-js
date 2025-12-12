# Email Validator JS Examples

This directory contains comprehensive examples demonstrating how to use the Email Validator JS library with the new enhanced SMTP verification features.

## 🚀 Quick Start

```bash
# Install dependencies
yarn install

# Run type checking
yarn typecheck

# Run tests
yarn test
```

## 📁 Examples Overview

### SMTP Verification Examples

| Example | Description | Key Features |
|---------|-------------|--------------|
| [`smtp-usage.ts`](./smtp-usage.ts) | Basic SMTP verification usage | Simple API, caching, port configuration |
| [`smtp-test.ts`](./smtp-test.ts) | Comprehensive test suite | Multi-port testing, TLS, timeout handling |
| [`smtp-enhanced.ts`](./smtp-enhanced.ts) | Advanced SMTP features | TLS configuration, custom sequences |
| [`smtp-comprehensive-tests.ts`](./smtp-comprehensive-tests.ts) | Extensive testing scenarios | Port testing, caching, error handling |
| [`smtp-sequences.ts`](./smtp-sequences.ts) | Custom SMTP sequences | Command sequences, VRFY, HELO/EHLO |
| [`smtp-cache-example.ts`](./smtp-cache-example.ts) | Caching strategies | Performance optimization, cache tuning |

### Cache Implementation Examples

| Example | Description | Cache Type |
|---------|-------------|------------|
| [`custom-cache-memory.ts`](./custom-cache-memory.ts) | Custom in-memory cache | LRU, TTL, size limits |
| [`custom-cache-redis.ts`](./custom-cache-redis.ts) | Redis cache integration | Distributed caching |

### Other Features

| Example | Description |
|---------|-------------|
| [`advanced-usage.ts`](./advanced-usage.ts) | Complete email validation workflow |
| [`domain-suggestion-example.ts`](./domain-suggestion-example.ts) | Domain typo correction |
| [`name-detection-example.ts`](./name-detection-example.ts) | Name extraction from emails |
| [`algrothin-integration.ts`](./algrothin-integration.ts) | Third-party service integration |

## 🔧 Running Examples

### Development with ts-node (Recommended)

```bash
# Run with ts-node for full type checking during development
npx ts-node examples/smtp-usage.ts

# Run comprehensive tests
npx ts-node examples/smtp-test.ts

# Run cache examples
npx ts-node examples/custom-cache-memory.ts

# Run enhanced SMTP examples
npx ts-node examples/smtp-enhanced.ts
npx ts-node examples/smtp-comprehensive-tests.ts
npx ts-node examples/smtp-sequences.ts
```

**Note:** ts-node imports from `src/` for development with full type checking. This is the recommended way to run examples during development.

### Direct TypeScript Execution (Future Feature)

The enhanced SMTP features will be available in the next release (v2.14.0) with updated distribution exports. Once released, examples can be run directly:

```bash
# After v2.14.0 release:
yarn build
node --experimental-strip-types examples/smtp-usage.ts

# Requires Node.js 20.10+ or Node.js 21.0+ for --experimental-strip-types support
```

### Testing Specific Features

```bash
# Test port connectivity only
npx ts-node -e "
import { testPortConnectivity } from './examples/smtp-test';
testPortConnectivity();
"

# Test caching performance
npx ts-node -e "
import { testMultiPortWithCaching } from './examples/smtp-test';
testMultiPortWithCaching();
"

# Or run directly with --experimental-strip-types
node --experimental-strip-types -e "
import { testPortConnectivity } from './examples/smtp-test';
testPortConnectivity();
"
```

## 📚 Key Concepts Demonstrated

### 1. Multi-Port SMTP Testing

```typescript
import { verifyMailboxSMTP } from '../src/smtp';

const { result, port, cached, portCached } = await verifyMailboxSMTP({
  local: 'user',
  domain: 'example.com',
  mxRecords: ['mx.example.com'],
  options: {
    ports: [25, 587, 465], // Test multiple ports
    timeout: 5000,
    cache: getDefaultCache(),
  },
});
```

### 2. TLS Configuration

```typescript
// Strict TLS for security
await verifyMailboxSMTP({
  local: 'user',
  domain: 'example.com',
  mxRecords: ['mx.example.com'],
  options: {
    tls: {
      rejectUnauthorized: true,
      minVersion: 'TLSv1.3',
    },
  },
});

// Lenient TLS for compatibility
await verifyMailboxSMTP({
  local: 'user',
  domain: 'example.com',
  mxRecords: ['mx.example.com'],
  options: {
    tls: {
      rejectUnauthorized: false,
      minVersion: 'TLSv1.2',
    },
  },
});
```

### 3. Custom SMTP Sequences

```typescript
import { SMTPStep } from '../src/types';

await verifyMailboxSMTP({
  local: 'user',
  domain: 'example.com',
  mxRecords: ['mx.example.com'],
  options: {
    sequence: {
      steps: [
        SMTPStep.GREETING,
        SMTPStep.EHLO,
        SMTPStep.MAIL_FROM,
        SMTPStep.RCPT_TO,
        SMTPStep.VRFY, // Include VRFY command
      ],
      from: '<user@example.com>', // Custom MAIL FROM
    },
    useVRFY: true,
  },
});
```

### 4. Performance Optimization

```typescript
// Optimized for bulk verification
const cache = getDefaultCache();

for (const email of emails) {
  const { result, cached, portCached } = await verifyMailboxSMTP({
    local: email.split('@')[0],
    domain: email.split('@')[1],
    mxRecords,
    options: {
      cache, // Reuse cache instance
      timeout: 3000,
      maxRetries: 1,
    },
  });

  console.log(`${email}: ${result} (cached: ${cached || portCached})`);
}
```

### 5. Error Handling

```typescript
try {
  const { result } = await verifyMailboxSMTP({
    local: 'user',
    domain: 'example.com',
    mxRecords: ['mx.example.com'],
    options: {
      timeout: 5000,
      maxRetries: 2,
    },
  });

  if (result === null) {
    console.log('Unable to determine email validity');
  } else if (result) {
    console.log('Email appears to be valid');
  } else {
    console.log('Email appears to be invalid');
  }
} catch (error) {
  console.error('Verification failed:', error);
}
```

## 🔍 Debugging

Enable debug mode to see detailed SMTP communication:

```typescript
await verifyMailboxSMTP({
  local: 'user',
  domain: 'example.com',
  mxRecords: ['mx.example.com'],
  options: {
    debug: true, // Enable detailed logging
  },
});
```

Example debug output:
```
[SMTP] Verifying user@example.com via mx.example.com
[SMTP] Testing port 25
[SMTP] → EHLO localhost
[SMTP] ← 220 mx.example.com ESMTP
[SMTP] ← 250-mx.example.com Hello
[SMTP] ← 250-VRFY
[SMTP] ← 250 8BITMIME
[SMTP] → MAIL FROM:<>
[SMTP] ← 250 Mail OK
[SMTP] → RCPT TO:<user@example.com>
[SMTP] ← 250 Recipient OK
25: valid
```

## 🏗️ Architecture Examples

### Custom Cache Implementation

```typescript
import { ICache, ICacheStore } from '../src/cache-interface';

class CustomCache implements ICacheStore<string> {
  private cache = new Map<string, { value: string; expiry: number }>();

  async get(key: string): Promise<string | undefined> {
    const item = this.cache.get(key);
    if (!item || Date.now() > item.expiry) {
      this.cache.delete(key);
      return undefined;
    }
    return item.value;
  }

  async set(key: string, value: string, ttlMs = 300000): Promise<void> {
    this.cache.set(key, {
      value,
      expiry: Date.now() + ttlMs,
    });
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }
}

const customCache: ICache = {
  smtp: new CustomCache(),
  smtpPort: new CustomCache(),
  mx: new CustomCache(),
  // ... other cache stores
};
```

## 📊 Performance Metrics

The examples demonstrate various performance optimizations:

- **Port Caching**: Remembers successful ports per domain
- **Result Caching**: Caches verification results
- **Connection Reuse**: Optimizes connection handling
- **Timeout Management**: Prevents hanging connections
- **Retry Logic**: Handles temporary failures

## 🛠️ Best Practices

1. **Always Use Cache**: Significantly improves performance
2. **Set Appropriate Timeouts**: Prevents hanging (3-10 seconds)
3. **Handle Null Results**: Indicates verification uncertainty
4. **Use Debug Mode**: During development and troubleshooting
5. **Configure TLS**: Balance security and compatibility
6. **Monitor Performance**: Track cache hit rates and response times

## 🔗 Related Documentation

- [Main README](../README.md)
- [API Documentation](../docs/api.md)
- [Cache Configuration](../docs/caching.md)
- [SMTP Protocol Details](../docs/smtp.md)

## 🤝 Contributing

To add new examples:

1. Create a new `.ts` file in this directory
2. Follow the existing code style and patterns
3. Include comprehensive comments
4. Add error handling
5. Update this README with a description
6. Ensure TypeScript compilation: `yarn typecheck`

## 📝 License

These examples are part of the Email Validator JS project and follow the same license terms.