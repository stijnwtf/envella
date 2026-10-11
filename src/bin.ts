#!/usr/bin/env node
/// <reference types="node" />
import { main } from './cli.js';

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
