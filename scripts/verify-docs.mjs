#!/usr/bin/env node
/**
 * 校验 docs.json 引用的所有页面文件是否真实存在。
 * 用法: node scripts/verify-docs.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const docsJson = JSON.parse(readFileSync(resolve(ROOT, 'docs.json'), 'utf8'))

const referenced = new Set()
const walk = pages => {
  if (!Array.isArray(pages)) return
  for (const p of pages) {
    if (typeof p === 'string') {
      referenced.add(p)
    } else if (p && Array.isArray(p.pages)) {
      walk(p.pages)
    }
  }
}

const groups = docsJson?.navigation?.groups ?? []
for (const g of groups) walk(g.pages)

const candidates = ['.mdx', '.md']
const missing = []
for (const ref of referenced) {
  const base = resolve(ROOT, ref)
  const found = candidates.some(ext => existsSync(base + ext))
  if (!found) missing.push(ref)
}

if (missing.length === 0) {
  console.log(`✅ All ${referenced.size} referenced pages exist.`)
  process.exit(0)
} else {
  console.error(`❌ ${missing.length} missing page(s):`)
  for (const m of missing) console.error('  - ' + m)
  process.exit(1)
}
