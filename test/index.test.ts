import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  bool,
  createEnv,
  EnvError,
  email,
  int,
  json,
  list,
  makeValidator,
  num,
  oneOf,
  port,
  str,
  toExample,
  url,
} from '../src/index';

describe('createEnv', () => {
  it('parses and types every validator', () => {
    const env = createEnv(
      {
        NAME: str(),
        RATIO: num(),
        WORKERS: int(),
        PORT: port({ default: 3000 }),
        DEBUG: bool(),
        API_URL: url(),
        ADMIN: email(),
        HOSTS: list(),
        MODE: oneOf(['development', 'production']),
        FLAGS: json<{ beta: boolean }>(),
        MISSING: str({ optional: true }),
      },
      {
        source: {
          NAME: 'app',
          RATIO: '0.5',
          WORKERS: '4',
          DEBUG: 'yes',
          API_URL: 'https://api.example.com',
          ADMIN: 'ops@example.com',
          HOSTS: 'a.com, b.com,,',
          MODE: 'production',
          FLAGS: '{"beta":true}',
        },
      },
    );

    expect(env).toEqual({
      NAME: 'app',
      RATIO: 0.5,
      WORKERS: 4,
      PORT: 3000,
      DEBUG: true,
      API_URL: 'https://api.example.com',
      ADMIN: 'ops@example.com',
      HOSTS: ['a.com', 'b.com'],
      MODE: 'production',
      FLAGS: { beta: true },
      MISSING: undefined,
    });

    expectTypeOf(env.NAME).toEqualTypeOf<string>();
    expectTypeOf(env.PORT).toEqualTypeOf<number>();
    expectTypeOf(env.MODE).toEqualTypeOf<'development' | 'production'>();
    expectTypeOf(env.HOSTS).toEqualTypeOf<string[]>();
    expectTypeOf(env.FLAGS).toEqualTypeOf<{ beta: boolean }>();
    expectTypeOf(env.MISSING).toEqualTypeOf<string | undefined>();
  });

  it('reports every problem at once and masks secrets', () => {
    let error: unknown;
    try {
      createEnv(
        {
          DATABASE_URL: url({ description: 'Postgres connection string' }),
          PORT: port(),
          API_KEY: int({ secret: true }),
        },
        { source: { PORT: 'abc', API_KEY: 'sk_live_123' } },
      );
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(EnvError);
    const { issues, message } = error as EnvError;
    expect(issues.map((i) => i.key)).toEqual(['DATABASE_URL', 'PORT', 'API_KEY']);
    expect(message).toContain('missing, expected url (Postgres connection string)');
    expect(message).toContain('"abc" is invalid: expected a port');
    expect(message).not.toContain('sk_live_123');
    expect(message).toContain('****');
  });

  it('treats empty strings as missing', () => {
    expect(() => createEnv({ A: str() }, { source: { A: '' } })).toThrow(EnvError);
    expect(createEnv({ A: str({ default: 'x' }) }, { source: { A: '' } }).A).toBe('x');
  });

  it('accepts a Cloudflare Workers style env object', () => {
    const workerEnv = { API_URL: 'https://x.dev', MY_KV: {} };
    expect(createEnv({ API_URL: url() }, { source: workerEnv }).API_URL).toBe('https://x.dev');
  });

  it('calls onError instead of throwing', () => {
    expect(() =>
      createEnv(
        { A: str() },
        {
          source: {},
          onError: (e) => {
            throw new Error(`custom: ${e.issues.length}`);
          },
        },
      ),
    ).toThrow('custom: 1');
  });

  it('returns a frozen object', () => {
    const env = createEnv({ A: str() }, { source: { A: 'a' } });
    expect(Object.isFrozen(env)).toBe(true);
  });

  it('supports custom validators', () => {
    const hex = makeValidator('hex color', (raw) => {
      if (!/^#[0-9a-f]{6}$/i.test(raw)) throw new Error('nope');
      return raw.toLowerCase();
    });
    expect(createEnv({ C: hex() }, { source: { C: '#FFAA00' } }).C).toBe('#ffaa00');
    expect(() => createEnv({ C: hex() }, { source: { C: 'red' } })).toThrow('expected hex color');
  });
});

describe('validators', () => {
  const parse = <T>(v: { parse(raw: string): T }, raw: string) => v.parse(raw);

  it('rejects bad values', () => {
    expect(() => parse(num(), 'x')).toThrow();
    expect(() => parse(int(), '1.5')).toThrow();
    expect(() => parse(port(), '70000')).toThrow();
    expect(() => parse(bool(), 'maybe')).toThrow();
    expect(() => parse(url(), 'not a url')).toThrow();
    expect(() => parse(email(), 'nope')).toThrow();
    expect(() => parse(oneOf(['a', 'b']), 'c')).toThrow('expected one of "a" | "b"');
    expect(() => parse(json(), '{')).toThrow();
  });

  it('supports a custom list separator', () => {
    expect(parse(list({ separator: ';' }), 'a; b')).toEqual(['a', 'b']);
  });
});

describe('toExample', () => {
  it('documents the schema', () => {
    const example = toExample({
      DATABASE_URL: url({ description: 'Postgres URL', example: 'postgres://localhost/app' }),
      PORT: port({ default: 3000 }),
      API_KEY: str({ secret: true }),
    });
    expect(example).toBe(
      [
        '# Postgres URL (url, required)',
        'DATABASE_URL=postgres://localhost/app',
        '',
        '# (port, optional)',
        'PORT=3000',
        '',
        '# (string, required, secret)',
        'API_KEY=',
        '',
      ].join('\n'),
    );
  });
});
