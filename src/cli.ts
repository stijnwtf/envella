/// <reference types="node" />
/**
 * envella CLI: validate the environment or generate `.env.example` from a schema file.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createEnv, EnvError, type Schema, toExample } from './index.js';

const HELP = `Usage:
  envella check <schema-file> [--env-file .env]
      Validate the environment against the schema. Exits 1 on any problem.

  envella example <schema-file> [--out .env.example] [--check]
      Write a documented .env.example. With --check, exit 1 if it is out of date.

The schema file must export the schema as \`schema\` or as its default export.
TypeScript files need Node 22.18+, Bun or Deno.`;

export async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      'env-file': { type: 'string', multiple: true },
      out: { type: 'string', short: 'o', default: '.env.example' },
      check: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const [command, file] = positionals;

  if (values.help || !command || !file) {
    console.log(HELP);
    return values.help ? 0 : 1;
  }

  const schema = await loadSchema(file);

  if (command === 'check') {
    const source: Record<string, string | undefined> = { ...process.env };
    for (const envFile of values['env-file'] ?? []) Object.assign(source, readEnvFile(envFile));
    try {
      createEnv(schema, { source });
    } catch (error) {
      if (!(error instanceof EnvError)) throw error;
      console.error(error.message);
      return 1;
    }
    console.log(`✓ ${Object.keys(schema).length} environment variables valid`);
    return 0;
  }

  if (command === 'example') {
    const out = values.out;
    const content = toExample(schema);
    if (values.check) {
      const current = existsSync(out) ? readFileSync(out, 'utf8') : '';
      if (current === content) return 0;
      console.error(`${out} is out of date. Run: envella example ${file} --out ${out}`);
      return 1;
    }
    writeFileSync(out, content);
    console.log(`✓ wrote ${out}`);
    return 0;
  }

  console.error(`Unknown command "${command}".\n\n${HELP}`);
  return 1;
}

async function loadSchema(file: string): Promise<Schema> {
  const mod = (await import(pathToFileURL(resolve(file)).href)) as { schema?: unknown; default?: unknown };
  const schema = mod.schema ?? mod.default;
  if (!isSchema(schema)) {
    throw new Error(`${file} does not export a schema. Export it as \`schema\` or as the default export.`);
  }
  return schema;
}

function isSchema(value: unknown): value is Schema {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.values(value).every((v) => typeof v === 'object' && v !== null && 'kind' in v && 'parse' in v)
  );
}

/** Minimal dotenv parser: KEY=value, optional quotes, `#` comments, `export` prefix. */
export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([\w.-]+)\s*=\s*(.*)?$/.exec(line);
    if (!match?.[1]) continue;
    let value = (match[2] ?? '').trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote) && value.length > 1) {
      value = value.slice(1, -1);
      if (quote === '"') value = value.replace(/\\n/g, '\n');
    } else {
      value = value.replace(/\s+#.*$/, '');
    }
    result[match[1]] = value;
  }
  return result;
}

function readEnvFile(file: string): Record<string, string> {
  return parseEnvFile(readFileSync(file, 'utf8'));
}
