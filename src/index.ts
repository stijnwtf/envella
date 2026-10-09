/**
 * strictenv: typed, validated environment variables with zero dependencies.
 */

export interface Options<T> {
  /** Used when the variable is missing or empty. */
  default?: T;
  /** Allow the variable to be missing. Its type becomes `T | undefined` unless a default is set. */
  optional?: boolean;
  /** Shown in error messages and in the generated `.env.example`. */
  description?: string;
  /** Example value for the generated `.env.example`. */
  example?: string;
}

/** Resolves the output type from the validator type and its options. */
export type Output<T, O> = O extends { default: T } ? T : O extends { optional: true } ? T | undefined : T;

export interface Validator<T> {
  /** Human readable type, used in errors and docs, e.g. `url` or `"a" | "b"`. */
  readonly kind: string;
  readonly options: Options<unknown>;
  /** Parse a raw string. Throw (any error) or return a value. */
  parse(raw: string): T;
  /** Phantom field that carries the output type. */
  readonly _output?: T;
}

export type Schema = Record<string, Validator<unknown>>;

export type Infer<S extends Schema> = {
  readonly [K in keyof S]: S[K] extends Validator<infer T> ? T : never;
};

export type Source = Record<string, string | undefined>;

export interface Issue {
  key: string;
  message: string;
}

export class EnvError extends Error {
  readonly issues: readonly Issue[];

  constructor(issues: Issue[]) {
    const width = Math.max(...issues.map((i) => i.key.length));
    const lines = issues.map((i) => `  x ${i.key.padEnd(width)}  ${i.message}`);
    super(`Invalid environment variables:\n${lines.join('\n')}`);
    this.name = 'EnvError';
    this.issues = issues;
  }
}

// VALIDATOR FACTORY -----------------------------------------------------------

/**
 * Build your own validator type:
 *
 *     const hex = makeValidator('hex color', (raw) => {
 *       if (!/^#[0-9a-f]{6}$/i.test(raw)) throw new Error('expected #rrggbb');
 *       return raw;
 *     });
 */
export function makeValidator<T>(kind: string, parse: (raw: string) => T) {
  return <const O extends Options<T> = Record<never, never>>(options?: O): Validator<Output<T, O>> => ({
    kind,
    options: options ?? {},
    parse: parse as (raw: string) => Output<T, O>,
  });
}

class Invalid extends Error {}

function fail(message: string): never {
  throw new Invalid(message);
}

// BUILT-IN VALIDATORS ---------------------------------------------------------

export const str = makeValidator('string', (raw) => raw);

export const num = makeValidator('number', (raw) => {
  const n = Number(raw);
  if (raw.trim() === '' || Number.isNaN(n)) fail('expected a number');
  return n;
});

export const int = makeValidator('integer', (raw) => {
  if (!/^-?\d+$/.test(raw.trim())) fail('expected an integer');
  return Number.parseInt(raw, 10);
});

const truthy = new Set(['true', '1', 'yes', 'on']);
const falsy = new Set(['false', '0', 'no', 'off']);

export const bool = makeValidator('boolean', (raw) => {
  const v = raw.trim().toLowerCase();
  if (truthy.has(v)) return true;
  if (falsy.has(v)) return false;
  return fail('expected true/false, 1/0, yes/no or on/off');
});

// CREATE ----------------------------------------------------------------------

export interface CreateEnvOptions {
  /**
   * Where to read variables from. Defaults to `process.env` (Node, Bun) or
   * `Deno.env`. In Cloudflare Workers, pass the `env` binding object.
   */
  source?: Source | object;
}

/**
 * Validate `source` against `schema`. Every problem is collected and reported
 * at once, so you never fix missing variables one deploy at a time.
 */
export function createEnv<const S extends Schema>(schema: S, options: CreateEnvOptions = {}): Infer<S> {
  const source = (options.source ?? defaultSource()) as Source;
  const result: Record<string, unknown> = {};
  const issues: Issue[] = [];

  for (const [key, validator] of Object.entries(schema)) {
    const raw = source[key];
    const { default: fallback, optional, description } = validator.options;
    const hint = description ? ` (${description})` : '';

    if (raw === undefined || raw === '') {
      if (fallback !== undefined) result[key] = fallback;
      else if (optional) result[key] = undefined;
      else issues.push({ key, message: `missing, expected ${validator.kind}${hint}` });
      continue;
    }

    try {
      result[key] = validator.parse(String(raw));
    } catch (error) {
      const reason = error instanceof Invalid ? error.message : `expected ${validator.kind}`;
      const shown = JSON.stringify(truncate(String(raw)));
      issues.push({ key, message: `${shown} is invalid: ${reason}${hint}` });
    }
  }

  if (issues.length > 0) {
    throw new EnvError(issues);
  }

  return result as Infer<S>;
}

// HELPERS ---------------------------------------------------------------------

function defaultSource(): Source {
  const g = globalThis as {
    process?: { env?: Source };
    Deno?: { env?: { toObject(): Source } };
  };
  if (g.process?.env) return g.process.env;
  if (g.Deno?.env) return g.Deno.env.toObject();
  return {};
}

function truncate(s: string): string {
  return s.length > 40 ? `${s.slice(0, 37)}...` : s;
}
