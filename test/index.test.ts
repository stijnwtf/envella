import { describe, expect, it } from 'vitest';
import { bool, createEnv, EnvError, int, num, str } from '../src/index';

describe('createEnv', () => {
  it('parses values', () => {
    const env = createEnv(
      { NAME: str(), RATIO: num(), WORKERS: int(), DEBUG: bool() },
      { source: { NAME: 'app', RATIO: '0.5', WORKERS: '4', DEBUG: 'yes' } },
    );
    expect(env).toEqual({ NAME: 'app', RATIO: 0.5, WORKERS: 4, DEBUG: true });
  });

  it('applies defaults and optionals', () => {
    const env = createEnv({ A: str({ default: 'x' }), B: str({ optional: true }) }, { source: {} });
    expect(env).toEqual({ A: 'x', B: undefined });
  });

  it('reports every problem at once', () => {
    expect(() => createEnv({ A: str(), B: int() }, { source: { B: 'nope' } })).toThrow(EnvError);
  });
});
