// dsh-ui-chat-null-guard — host half
//
// Official @deepseek-ai/dsh-client-ui-chat reads `end?.data.reason.kind` without
// guarding `data` / `reason`. When either is null, conversation.view crashes and
// blanks every session in the same renderer until reload.
// Discussions: #9156 #8832 #9798 — still unfixed through 0.2.3-alpha.2.
//
// This plugin rewrites the on-disk client.js of every resolvable
// dsh-client-ui-chat install (npx cache + require.resolve) at host boot.
// Idempotent. No client seat.

import { createRequire } from 'node:module';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const name = 'ui-chat-null-guard';
export const inject = [];

const OLD = 'end?.data.reason.kind';
const NEW = 'end?.data?.reason?.kind';
const REL = join('node_modules', '@deepseek-ai', 'dsh-client-ui-chat', 'lib', 'client.js');

/**
 * @param {string} start
 * @returns {string[]}
 */
function walkUpNodeModules(start) {
  /** @type {string[]} */
  const out = [];
  let dir = start;
  for (let i = 0; i < 12; i++) {
    const candidate = join(dir, REL);
    try {
      if (statSync(candidate).isFile()) out.push(candidate);
    } catch {
      /* miss */
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return out;
}

/**
 * @returns {string[]}
 */
function resolveViaRequire() {
  /** @type {string[]} */
  const out = [];
  const seeds = [
    process.argv[1],
    process.cwd() + '/package.json',
    fileURLToPath(import.meta.url),
  ].filter(Boolean);

  for (const seed of seeds) {
    try {
      const req = createRequire(seed);
      const pkg = req.resolve('@deepseek-ai/dsh-client-ui-chat/package.json');
      out.push(join(dirname(pkg), 'lib', 'client.js'));
    } catch {
      /* not resolvable from this seed */
    }
  }
  return out;
}

/**
 * @param {string} root
 * @param {string[]} acc
 * @param {number} depth
 */
function scanNpx(root, acc, depth = 0) {
  if (depth > 6) return;
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const full = join(root, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'dsh-client-ui-chat') {
        const client = join(full, 'lib', 'client.js');
        try {
          if (statSync(client).isFile()) acc.push(client);
        } catch {
          /* miss */
        }
      } else if (
        ent.name === 'node_modules' ||
        ent.name === '@deepseek-ai' ||
        ent.name.startsWith('.') === false
      ) {
        // Bound breadth: only descend into npx hash dirs / node_modules / scope.
        if (
          depth === 0 ||
          ent.name === 'node_modules' ||
          ent.name === '@deepseek-ai' ||
          root.endsWith('_npx')
        ) {
          scanNpx(full, acc, depth + 1);
        }
      }
    }
  }
}

/**
 * @returns {string[]}
 */
function collectTargets() {
  /** @type {Set<string>} */
  const set = new Set();
  for (const p of resolveViaRequire()) set.add(p);
  for (const p of walkUpNodeModules(process.cwd())) set.add(p);
  if (process.argv[1]) {
    for (const p of walkUpNodeModules(dirname(process.argv[1]))) set.add(p);
  }
  /** @type {string[]} */
  const npxHits = [];
  scanNpx(join(homedir(), '.npm', '_npx'), npxHits);
  for (const p of npxHits) set.add(p);
  return [...set];
}

/**
 * @param {string} path
 * @returns {'patched' | 'already' | 'skip' | 'error'}
 */
function patchFile(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    console.warn(`[dsh-ui-chat-null-guard] read failed ${path}:`, err);
    return 'error';
  }
  if (!text.includes(OLD)) {
    return text.includes(NEW) ? 'already' : 'skip';
  }
  const count = text.split(OLD).length - 1;
  try {
    writeFileSync(path, text.split(OLD).join(NEW), 'utf8');
  } catch (err) {
    console.warn(`[dsh-ui-chat-null-guard] write failed ${path}:`, err);
    return 'error';
  }
  console.info(`[dsh-ui-chat-null-guard] patched ${path} (x${count})`);
  return 'patched';
}

/**
 * @param {import('@deepseek-ai/cordis').Context} _ctx
 * @param {{ enabled?: boolean }} [config]
 */
export function apply(_ctx, config = {}) {
  if (config.enabled === false) {
    console.info('[dsh-ui-chat-null-guard] disabled via config');
    return;
  }

  const targets = collectTargets();
  if (targets.length === 0) {
    console.warn(
      '[dsh-ui-chat-null-guard] no dsh-client-ui-chat/lib/client.js found; skip',
    );
    return;
  }

  let patched = 0;
  let already = 0;
  for (const path of targets) {
    const result = patchFile(path);
    if (result === 'patched') patched += 1;
    else if (result === 'already') already += 1;
  }
  console.info(
    `[dsh-ui-chat-null-guard] done: patched=${patched} already=${already} targets=${targets.length}`,
  );
}
