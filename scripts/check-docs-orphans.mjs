#!/usr/bin/env node
/**
 * 反向校验：找出 docs/ 下所有 .md/.mdx 文件，但 docs.json 导航没引用的。
 * 用法: node scripts/check-docs-orphans.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { resolve, dirname, relative, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const DOCS = resolve(ROOT, 'docs')

const docsJson = JSON.parse(readFileSync(resolve(ROOT, 'docs.json'), 'utf8'))

const referenced = new Set()
const walk = pages => {
  if (!Array.isArray(pages)) return
  for (const p of pages) {
    if (typeof p === 'string') {
      referenced.add(p.replace(/^docs\//, ''))
    } else if (p && Array.isArray(p.pages)) {
      walk(p.pages)
    }
  }
}
for (const g of docsJson?.navigation?.groups ?? []) walk(g.pages)

const collectMd = dir => {
  const out = []
  for (const name of readdirSync(dir)) {
    if (name === 'logo' || name === 'images') continue
    const full = join(dir, name)
    const rel = relative(DOCS, full).replace(/\\/g, '/')
    if (statSync(full).isDirectory()) {
      out.push(...collectMd(full))
    } else if (name.endsWith('.md') || name.endsWith('.mdx')) {
      out.push(rel.replace(/\.(md|mdx)$/, ''))
    }
  }
  return out
}

const all = collectMd(DOCS)
const orphans = all.filter(p => !referenced.has(p))

if (orphans.length === 0) {
  console.log(`✅ All ${all.length} docs files are referenced in navigation.`)
  process.exit(0)
} else {
  console.warn(`⚠️  ${orphans.length} orphan doc(s) not in navigation:`)
  for (const o of orphans) console.warn('  - docs/' + o)
  process.exit(0) // 不失败，只是提示
}
