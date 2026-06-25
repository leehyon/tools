#!/usr/bin/env node
// One-shot recovery: current public/embeddings.json is recursively nested
// (build-search-index.js read the wrapped file as flat, then re-wrapped it
// on every run, so each invocation added another .embeddings layer).
// This script flattens the corruption back into the canonical shape:
//   { version, model, updatedAt, embeddings: { [toolName]: number[] } }
//
// Idempotent: running it twice produces the same output.
//
// Usage: node scripts/fix-embeddings.js [--dry-run]
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = path.join(__dirname, '..', 'public')
const EMBEDDINGS_FILE = path.join(PUBLIC_DIR, 'embeddings.json')

const dryRun = process.argv.includes('--dry-run')

function log(msg) { console.log(`[fix-embeddings] ${msg}`) }
function error(msg) { console.error(`[fix-embeddings] ERROR: ${msg}`) }

function recoverLeafEmbeddings(obj, out) {
  if (!obj || typeof obj !== 'object') return
  for (const k of Object.keys(obj)) {
    const v = obj[k]
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'number') {
      if (!(k in out)) {
        out[k] = v
      } else {
        const ref = out[k]
        const sameLen = ref.length === v.length
        const sameVals = sameLen && ref.every((x, i) => x === v[i])
        if (!sameVals) {
          error(`Conflicting embeddings for "${k}" at different depths; keeping first`)
        }
      }
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      recoverLeafEmbeddings(v, out)
    }
  }
}

function main() {
  if (!fs.existsSync(EMBEDDINGS_FILE)) {
    error('public/embeddings.json not found')
    process.exit(1)
  }

  const raw = fs.readFileSync(EMBEDDINGS_FILE, 'utf-8')
  const parsed = JSON.parse(raw)
  const currentSize = Buffer.byteLength(raw, 'utf-8')

  // Already canonical? Detect by presence of `embeddings` wrapper + dense array leaves.
  const directLeaves = {}
  recoverLeafEmbeddings(parsed, directLeaves)

  let canonical
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      && 'version' in parsed && 'embeddings' in parsed
      && Object.keys(directLeaves).length <= 0) {
    // Wrapped correctly already; just rewrite to make sure no nesting slipped in.
    canonical = {
      version: parsed.version,
      model: parsed.model,
      updatedAt: parsed.updatedAt,
      embeddings: parsed.embeddings
    }
    log('File already in canonical shape; normalizing in place')
  } else {
    canonical = {
      version: 2,
      model: (parsed && parsed.model) || 'bge-m3',
      updatedAt: new Date().toISOString(),
      embeddings: directLeaves
    }
  }

  const out = JSON.stringify(canonical)
  const newSize = Buffer.byteLength(out, 'utf-8')
  const entries = Object.keys(canonical.embeddings).length
  log(`Recovered ${entries} unique tool embeddings`)
  log(`Before: ${(currentSize / 1024 / 1024).toFixed(2)} MiB`)
  log(`After:  ${(newSize / 1024 / 1024).toFixed(2)} MiB`)

  if (newSize > 25 * 1024 * 1024) {
    error(`Output is still over 25 MiB Cloudflare Pages limit (${(newSize / 1024 / 1024).toFixed(2)} MiB)`)
    process.exit(1)
  }

  if (dryRun) {
    log('--dry-run set, not writing')
    return
  }

  fs.writeFileSync(EMBEDDINGS_FILE, out, 'utf-8')
  log('Wrote canonical embeddings.json')
}

main()
