#!/usr/bin/env node
/**
 * 扫描所有 docs/ 文档的 frontmatter，按 docs.json 的导航结构输出完整大纲。
 * 输出到 stdout，可重定向到文件。
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const docsJson = JSON.parse(readFileSync(resolve(ROOT, 'docs.json'), 'utf8'))

const EXTS = ['.mdx', '.md']

const readFrontmatter = relPath => {
  for (const ext of EXTS) {
    try {
      const full = resolve(ROOT, relPath + ext)
      const text = readFileSync(full, 'utf8')
      // 1) 优先 YAML frontmatter
      const m = text.match(/^---\n([\s\S]*?)\n---/)
      let title = ''
      let description = ''
      if (m) {
        const fm = m[1]
        const titleM = fm.match(/^title:\s*"?(.+?)"?\s*$/m)
        const descM = fm.match(/^description:\s*"?(.+?)"?\s*$/m)
        title = titleM ? titleM[1] : ''
        description = descM ? descM[1] : ''
      }
      // 2) fallback: 第一个 H1 标题
      if (!title) {
        const h1M = text.match(/^#\s+(.+?)\s*$/m)
        if (h1M) title = h1M[1].replace(/\s*[—–-].*$/, '').trim()
      }
      // 3) fallback: 第一个段落 / 引用作为描述
      if (!description) {
        const bodyM = text.match(/(?:^|\n)(?:>\s*(.+?)|([^>\n#][^\n]+))\n/)
        if (bodyM)
          description = (bodyM[1] || bodyM[2] || '').replace(/^>\s*/, '').trim()
      }
      return { title: title || '(无标题)', description }
    } catch {}
  }
  return null
}

let lines = []
let groupIdx = 0

const emitPage = (pageRef, depth) => {
  const fm = readFrontmatter(pageRef)
  const indent = '  '.repeat(depth)
  if (!fm) {
    lines.push(`${indent}- ❓ _MISSING: ${pageRef}_`)
    return
  }
  const short = pageRef.replace(/^docs\//, '')
  const desc = fm.description ? ` — ${fm.description}` : ''
  lines.push(`${indent}- \`${short}\` — **${fm.title || '(无标题)'}**${desc}`)
}

const emitGroup = (pages, depth) => {
  for (const p of pages) {
    if (typeof p === 'string') {
      emitPage(p, depth)
    } else if (p && p.group) {
      const indent = '  '.repeat(depth)
      lines.push(`${indent}- ### ${p.group}`)
      if (p.pages) emitGroup(p.pages, depth + 1)
    }
  }
}

lines.push('# Claude Code Best 文档大纲')
lines.push('')
lines.push(
  `> 自动生成自 docs.json 与各文档 frontmatter。共 ${docsJson.navigation.groups.length} 个顶级分组。`,
)
lines.push('')

for (const g of docsJson.navigation.groups) {
  groupIdx++
  lines.push(`## ${groupIdx}. ${g.group}`)
  lines.push('')
  emitGroup(g.pages, 0)
  lines.push('')
}

console.log(lines.join('\n'))
