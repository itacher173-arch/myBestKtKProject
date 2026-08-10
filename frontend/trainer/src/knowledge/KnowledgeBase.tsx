import { useMemo, useState } from 'react'
import { useTrainer } from '../simulator/TrainerContext'
import {
  getArticle,
  listArticles,
  listCategories,
  type KnowledgeArticle,
} from './store'
import './KnowledgeBase.css'

export function KnowledgeBase() {
  const {
    knowledgeOpen,
    knowledgeArticleId,
    closeKnowledge,
    openKnowledge,
  } = useTrainer()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')

  const categories = useMemo(() => listCategories(), [])
  const articles = useMemo(
    () => listArticles({ query, category }),
    [query, category],
  )
  const article: KnowledgeArticle | null = knowledgeArticleId
    ? getArticle(knowledgeArticleId) ?? null
    : null

  const total = useMemo(
    () => categories.reduce((sum, item) => sum + item.count, 0),
    [categories],
  )

  if (!knowledgeOpen) return null

  return (
    <div className="knowledge-overlay" onMouseDown={closeKnowledge}>
      <section
        className="knowledge-window"
        onMouseDown={(event) => event.stopPropagation()}
        aria-label="База знаний ЭЛОУ-АВТ"
      >
        <header className="knowledge-header">
          <div>
            <span className="knowledge-kicker">Локальный справочник</span>
            <h1>База знаний ЭЛОУ-АВТ</h1>
          </div>
          <button type="button" className="knowledge-close" onClick={closeKnowledge}>
            ×
          </button>
        </header>

        <div className="knowledge-layout">
          <aside className="knowledge-sidebar">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск: ЭЛОУ, Н-1, давление…"
            />
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
                  onClick={() => {
                    openKnowledge(item.id)
                    setCategory(item.category)
                  }}
                >
                  <strong>{item.title}</strong>
                  <span>{item.summary}</span>
                </button>
              ))}
              {!articles.length && (
                <p>По заданным условиям материалов не найдено.</p>
              )}
            </div>
          </aside>

          <article className="knowledge-article">
            {!article && (
              <div className="knowledge-welcome">
                <span>Справочник оператора и обучаемого</span>
                <h2>Выберите статью слева</h2>
                <p>
                  Материалы охватывают технологическую последовательность,
                  оборудование, аналитический контроль, инженерные системы,
                  безопасность и работу с тренажёром.
                </p>
              </div>
            )}
            {article && (
              <>
                <div className="knowledge-article-meta">{article.category}</div>
                <h2>{article.title}</h2>
                <p className="knowledge-summary">{article.summary}</p>
                {article.content.map((paragraph) => (
                  <p key={paragraph.slice(0, 48)}>{paragraph}</p>
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
