/**
 * Локальный доступ к статьям knowledge для verify/controls-check
 * (контент живёт в backend/knowledge, не во frontend).
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const LEGACY_SEED = resolve(ROOT, 'backend/knowledge/seed.json')
const CONTENT_ROOT = resolve(ROOT, 'backend/knowledge/content/ru')

export interface KnowledgeArticle {
  id: string
  title: string
  category: string
  summary?: string
  keywords?: string[]
  [key: string]: unknown
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function* walkJson(dir: string): Generator<string> {
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) yield* walkJson(full)
    else if (name.endsWith('.json')) yield full
  }
}

let cache: Map<string, KnowledgeArticle> | null = null

function loadAll(): Map<string, KnowledgeArticle> {
  if (cache) return cache
  const articles = new Map<string, KnowledgeArticle>()
  if (existsSync(LEGACY_SEED)) {
    const seed = readJson(LEGACY_SEED)
    if (Array.isArray(seed)) {
      for (const item of seed) {
        if (item && typeof item === 'object' && 'id' in item) {
          articles.set(String((item as KnowledgeArticle).id), item as KnowledgeArticle)
        }
      }
    }
  }
  for (const path of walkJson(CONTENT_ROOT)) {
    const payload = readJson(path)
    const items = Array.isArray(payload)
      ? payload
      : (payload as { articles?: unknown })?.articles
    if (!Array.isArray(items)) continue
    for (const item of items) {
      if (item && typeof item === 'object' && 'id' in item) {
        const article = item as KnowledgeArticle
        const id = String(article.id)
        const existing = articles.get(id)
        articles.set(id, existing ? { ...existing, ...article, id } : article)
      }
    }
  }
  cache = articles
  return articles
}

export function articleCount(): number {
  return loadAll().size
}

export function getArticle(id: string): KnowledgeArticle | undefined {
  return loadAll().get(id)
}

export function listArticles(opts?: { query?: string }): KnowledgeArticle[] {
  const all = [...loadAll().values()]
  const q = opts?.query?.trim().toLocaleLowerCase('ru-RU')
  if (!q) return all
  return all.filter((a) => {
    const blob = [
      a.id,
      a.title,
      a.summary,
      a.category,
      ...(a.keywords ?? []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('ru-RU')
    return blob.includes(q)
  })
}

export function listCategories(): string[] {
  return [...new Set([...loadAll().values()].map((a) => a.category).filter(Boolean))].sort()
}
