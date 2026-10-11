import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { main, parseEnvFile } from '../src/cli';

const schemaFile = join(import.meta.dirname, 'fixtures/schema.ts');
const dir = mkdtempSync(join(tmpdir(), 'envella-'));

let stdout: string[] = [];
let stderr: string[] = [];

beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation((msg: string) => stdout.push(msg));
  vi.spyOn(console, 'error').mockImplementation((msg: string) => stderr.push(msg));
});

afterEach(() => {
  stdout = [];
  stderr = [];
  vi.unstubAllEnvs();
});

describe('envella check', () => {
  it('fails with every issue', async () => {
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('PORT', 'abc');
    vi.stubEnv('API_KEY', '');
    expect(await main(['check', schemaFile])).toBe(1);
    expect(stderr.join('\n')).toContain('DATABASE_URL');
    expect(stderr.join('\n')).toContain('PORT');
  });

  it('reads --env-file and passes', async () => {
    const envFile = join(dir, '.env');
    writeFileSync(envFile, 'DATABASE_URL=postgres://localhost/db\nAPI_KEY="secret" # comment\n');
    expect(await main(['check', schemaFile, '--env-file', envFile])).toBe(0);
    expect(stdout.join('\n')).toContain('3 environment variables valid');
  });
});

describe('envella example', () => {
  it('writes and checks .env.example', async () => {
    const out = join(dir, '.env.example');
    expect(await main(['example', schemaFile, '--out', out])).toBe(0);
    expect(readFileSync(out, 'utf8')).toContain('DATABASE_URL=');
    expect(await main(['example', schemaFile, '--out', out, '--check'])).toBe(0);

    writeFileSync(out, 'STALE=1\n');
    expect(await main(['example', schemaFile, '--out', out, '--check'])).toBe(1);
    expect(stderr.join('\n')).toContain('out of date');
  });
});

describe('parseEnvFile', () => {
  it('handles quotes, comments and export', () => {
    expect(
      parseEnvFile(`# comment
export A=1
B = "two words" 
C='single # not a comment'
D=plain # comment
E=
`),
    ).toEqual({ A: '1', B: 'two words', C: 'single # not a comment', D: 'plain', E: '' });
  });
});
