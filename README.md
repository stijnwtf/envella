<div align="center">
  <h1>🔐 strictenv</h1>
  <p><strong>Typed, validated environment variables. Zero dependencies.</strong><br/>
  Works in Node, Bun, Deno and Cloudflare Workers. ~2 kB gzipped.</p>

  <p>
    <a href="https://github.com/stijnwtf/strictenv/actions/workflows/ci.yml"><img src="https://github.com/stijnwtf/strictenv/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/github/license/stijnwtf/strictenv" alt="MIT license" /></a>
    <a href="https://github.com/stijnwtf/strictenv/stargazers"><img src="https://img.shields.io/github/stars/stijnwtf/strictenv?style=social" alt="GitHub stars" /></a>
  </p>
</div>

```ts
import { createEnv, url, port, bool, oneOf, str } from '@stijnwtf/strictenv';

export const env = createEnv({
  DATABASE_URL: url({ description: 'Postgres connection string' }),
  PORT: port({ default: 3000 }),
  NODE_ENV: oneOf(['development', 'production', 'test'], { default: 'development' }),
  DEBUG: bool({ default: false }),
  STRIPE_KEY: str({ secret: true }),
  SENTRY_DSN: url({ optional: true }),
});

env.PORT;       // number
env.NODE_ENV;   // "development" | "production" | "test"
env.SENTRY_DSN; // string | undefined
```

When something is wrong you get **every** problem at once, before your app starts, with secrets masked:

```
EnvError: Invalid environment variables:
  x DATABASE_URL  missing, expected url (Postgres connection string)
  x PORT          "abc" is invalid: expected a port (1-65535)
  x STRIPE_KEY    **** is invalid: expected string
```

No more fixing missing variables one failed deploy at a time.

## Features

- **Zero dependencies**, ~2 kB gzipped, ESM, ships its own types
- **Full type inference**: `default` and `optional` change the type the way you'd expect
- **All errors at once**, with descriptions, so one deploy tells you everything that's wrong
- **Secrets masked** in error messages, so they never end up in your logs
- **Any runtime**: reads `process.env` or `Deno.env`, or pass Cloudflare Workers' `env` binding
- **`.env.example` generator** that documents every variable from the schema
- **Custom validators** in three lines

## Install

```bash
npm install @stijnwtf/strictenv   # or pnpm / bun / yarn
```

## Validators

| Validator | Type | Accepts |
| --- | --- | --- |
| `str()` | `string` | anything |
| `num()` | `number` | `3.14`, `-2` |
| `int()` | `number` | `42` |
| `port()` | `number` | `1` to `65535` |
| `bool()` | `boolean` | `true/false`, `1/0`, `yes/no`, `on/off` |
| `url()` | `string` | any valid URL |
| `email()` | `string` | `me@example.com` |
| `list({ separator? })` | `string[]` | `a,b,c` |
| `oneOf(['a', 'b'])` | `"a" \| "b"` | one of the values |
| `json<T>()` | `T` | any valid JSON |

Every validator takes the same options:

```ts
str({
  default: 'x',        // used when missing or empty; removes `undefined` from the type
  optional: true,      // allow missing; type becomes `string | undefined`
  secret: true,        // mask the value in error messages
  description: '...',  // shown in errors and .env.example
  example: '...',      // used in .env.example
})
```

Empty strings count as missing, so `PORT=` in a `.env` file falls back to the default instead of failing.

### Custom validators

```ts
import { makeValidator } from '@stijnwtf/strictenv';

const hexColor = makeValidator('hex color', (raw) => {
  if (!/^#[0-9a-f]{6}$/i.test(raw)) throw new Error('expected #rrggbb');
  return raw.toLowerCase();
});

createEnv({ BRAND_COLOR: hexColor({ default: '#ff00aa' }) });
```

## Runtimes

```ts
// Node, Bun: reads process.env by default
const env = createEnv(schema);

// Deno: reads Deno.env by default (needs --allow-env)
const env = createEnv(schema);

// Cloudflare Workers: pass the env binding
export default {
  fetch(request, workerEnv) {
    const env = createEnv(schema, { source: workerEnv });
  },
};

// Vite / anything else: pass any object
const env = createEnv(schema, { source: import.meta.env });
```

## Exit cleanly instead of throwing

```ts
const env = createEnv(schema, {
  onError(error) {
    console.error(error.message);
    process.exit(1);
  },
});
```

`error.issues` is also available as `{ key, message }[]` if you want to format it yourself.

## Generate `.env.example`

```ts
import { toExample } from '@stijnwtf/strictenv';
import { writeFileSync } from 'node:fs';

writeFileSync('.env.example', toExample(schema));
```

```bash
# Postgres connection string (url, required)
DATABASE_URL=

# (port, optional)
PORT=3000

# (string, required, secret)
STRIPE_KEY=
```

## License

[MIT](LICENSE)

If this saved you a broken deploy, a ⭐️ helps others find it.
