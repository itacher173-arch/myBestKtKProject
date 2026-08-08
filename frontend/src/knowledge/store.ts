import seed from './seed.json'

export interface KnowledgeArticle {
  id: string
  title: string
  category: string
  summary: string
  content: string[]
  source: string
  keywords: string[]
}

const ARTICLES = seed as KnowledgeArticle[]

export function listCategories(): { name: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const article of ARTICLES) {
    counts.set(article.category, (counts.get(article.category) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

export function listArticles(opts?: {
  query?: string
  category?: string
}): Omit<KnowledgeArticle, 'content'>[] {
  const q = opts?.query?.trim().toLowerCase() ?? ''
  const category = opts?.category ?? ''
  return ARTICLES.filter((article) => {
    if (category && article.category !== category) return false
    if (!q) return true
    const hay = [
      article.title,
      article.summary,
      article.source,
      ...article.keywords,
      ...article.content,
    ]
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  }).map(({ content: _content, ...summary }) => summary)
}

export function getArticle(id: string): KnowledgeArticle | undefined {
  return ARTICLES.find((article) => article.id === id)
}

export function articleCount(): number {
  return ARTICLES.length
}
