import { useEffect, useMemo, useState } from 'react'
import { apiGet } from '../lib/api'
import { useTrainer } from '../sim/TrainerContext'
import { Icon } from '../ui/Icon'
import './KnowledgeBase.css'

interface ArticleSummary {
  id: string
  title: string
  category: string
  summary: string
  source: string
  keywords: string[]
}

interface Article extends ArticleSummary {
  content: string[]
}

interface Category {
  name: string
  count: number
}

export function KnowledgeBase() {
  const {
    knowledgeOpen,
    knowledgeArticleId,
    closeKnowledge,
    openKnowledge,
  } = useTrainer()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [articles, setArticles] = useState<ArticleSummary[]>([])
  const [article, setArticle] = useState<Article | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!knowledgeOpen) return
    void apiGet<Category[]>('/knowledge/categories')
      .then(setCategories)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : String(reason)),
      )
  }, [knowledgeOpen])

  useEffect(() => {
    if (!knowledgeOpen) return
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams()
      if (query.trim()) params.set('q', query.trim())
      if (category) params.set('category', category)
      setLoading(true)
      setError('')
      void apiGet<ArticleSummary[]>(`/knowledge/articles?${params.toString()}`)
        .then(setArticles)
        .catch((reason: unknown) =>
          setError(reason instanceof Error ? reason.message : String(reason)),
        )
        .finally(() => setLoading(false))
    }, 180)
    return () => window.clearTimeout(timer)
  }, [category, knowledgeOpen, query])

  useEffect(() => {
    if (!knowledgeOpen || !knowledgeArticleId) {
      if (!knowledgeArticleId) setArticle(null)
      return
    }
    setLoading(true)
    setError('')
    void apiGet<Article>(`/knowledge/articles/${encodeURIComponent(knowledgeArticleId)}`)
      .then((value) => {
        setArticle(value)
        setCategory(value.category)
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : String(reason)),
      )
      .finally(() => setLoading(false))
  }, [knowledgeArticleId, knowledgeOpen])

  const total = useMemo(
    () => categories.reduce((sum, item) => sum + item.count, 0),
    [categories],
  )

  if (!knowledgeOpen) return null

  const selectArticle = (id: string) => openKnowledge(id)

  return (
    <div className="knowledge-overlay" onMouseDown={closeKnowledge}>
      <section
        className="knowledge-window"
        onMouseDown={(event) => event.stopPropagation()}
        aria-label="База знаний ЭЛОУ-АВТ"
      >
        <header className="knowledge-header">
          <div>
            <span className="knowledge-kicker">Локальная SQLite</span>
            <h1>База знаний ЭЛОУ-АВТ</h1>
          </div>
          <button type="button" className="knowledge-close" onClick={closeKnowledge} aria-label="Закрыть">
            <Icon name="close" />
          </button>
        </header>

        <div className="knowledge-layout">
          <aside className="knowledge-sidebar">
            <label className="knowledge-search"><Icon name="search" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск: ЭЛОУ, Н-1, давление…" /></label>
            <div className="knowledge-categories">
              <button
                type="button"
                className={category === '' ? 'active' : ''}
                onClick={() => setCategory('')}
              >
                Все материалы <span>{total}</span>
              </button>
              {categories.map((item) => (
                <button
                  type="button"
                  key={item.name}
                  className={category === item.name ? 'active' : ''}
                  onClick={() => setCategory(item.name)}
                >
                  {item.name} <span>{item.count}</span>
                </button>
              ))}
            </div>
            <div className="knowledge-list">
              {articles.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={article?.id === item.id ? 'active' : ''}
                  onClick={() => selectArticle(item.id)}
                >
                  <strong>{item.title}</strong>
                  <span>{item.summary}</span>
                </button>
              ))}
              {!loading && !articles.length && (
                <p>По заданным условиям материалов не найдено.</p>
              )}
            </div>
          </aside>

          <article className="knowledge-article">
            {error && <div className="knowledge-error">Ошибка: {error}</div>}
            {loading && !article && <p>Загрузка материалов…</p>}
            {!article && !error && !loading && (
              <div className="knowledge-welcome">
                <span>Справочник оператора и обучаемого</span>
                <h2>Выберите статью слева</h2>
                <p>
                  Материалы охватывают технологическую последовательность,
                  оборудование, аналитический контроль, инженерные системы,
                  безопасность и работу с тренажером.
                </p>
              </div>
            )}
            {article && (
              <>
                <div className="knowledge-article-meta">{article.category}</div>
                <h2>{article.title}</h2>
                <p className="knowledge-summary">{article.summary}</p>
                {article.content.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                <div className="knowledge-source">
                  <strong>Основание:</strong> {article.source}
                </div>
                <div className="knowledge-keywords">
                  {article.keywords.map((keyword) => (
                    <span key={keyword}>{keyword}</span>
                  ))}
                </div>
              </>
            )}
          </article>
        </div>
      </section>
    </div>
  )
}
