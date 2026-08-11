import { useEffect, useMemo, useState } from 'react'
import { apiGet } from '../api/client'
import { Icon } from '../common/ui/Icon'
import { usePreferences } from '../settings/PreferencesContext'
import { useTrainer } from '../simulator/TrainerContext'
import './KnowledgeBase.css'

interface ArticleSummary {
  id: string
  title: string
  category: string
  summary: string
  keywords: string[]
  revision: string
  updatedAt: string
  status: string
  roles: string[]
  equipmentIds: string[]
  scenarioIds: string[]
}

interface ArticleSection {
  title: string
  paragraphs?: string[]
  bullets?: string[]
  warning?: string
  sourceIds?: string[]
}

interface ArticleSource {
  id: string
  title: string
  publisher: string
  kind: string
  localPath: string
  edition?: string
  language?: string
  usageNote?: string
}

interface Article extends ArticleSummary {
  content: string[]
  learningObjectives: string[]
  relatedArticleIds: string[]
  safetyNotice: string
  sections: ArticleSection[]
  sourceIds: string[]
  sources: ArticleSource[]
  diagram?: { src: string; alt: string; caption?: string }
}

interface Category { name: string; count: number }

const roleOptions = ['', 'Обучаемый', 'Оператор', 'Начальник смены', 'КИПиА', 'Лаборант']

function statusLabel(status: string): string {
  if (status === 'approved-for-training') return 'Допущено для обучения'
  if (status === 'expert-reviewed') return 'Проверено экспертом'
  if (status === 'draft') return 'Черновик'
  return 'Требует экспертной проверки'
}

function diagramAsset(src: string, darkTheme: boolean): string {
  const themedSrc =
    darkTheme && src.toLocaleLowerCase().endsWith('.svg')
      ? src.replace(/\.svg$/i, '.dark.svg')
      : src
  return `/api/knowledge/assets/${encodeURIComponent(themedSrc)}`
}

export function KnowledgeBase() {
  const { knowledgeOpen, knowledgeArticleId, closeKnowledge, openKnowledge } = useTrainer()
  const { theme } = usePreferences()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [role, setRole] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [articles, setArticles] = useState<ArticleSummary[]>([])
  const [article, setArticle] = useState<Article | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const darkTheme =
    theme === 'dark' ||
    (theme === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)

  useEffect(() => {
    if (!knowledgeOpen) return
    void apiGet<Category[]>('/knowledge/categories').then(setCategories).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
  }, [knowledgeOpen])

  useEffect(() => {
    if (!knowledgeOpen) return
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams()
      if (query.trim()) params.set('q', query.trim())
      if (category) params.set('category', category)
      if (role) params.set('role', role)
      setLoading(true)
      setError('')
      void apiGet<ArticleSummary[]>(`/knowledge/articles?${params.toString()}`)
        .then(setArticles)
        .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
        .finally(() => setLoading(false))
    }, 160)
    return () => window.clearTimeout(timer)
  }, [category, knowledgeOpen, query, role])

  useEffect(() => {
    if (!knowledgeOpen || !knowledgeArticleId) {
      if (!knowledgeArticleId) setArticle(null)
      return
    }
    setLoading(true)
    setError('')
    void apiGet<Article>(`/knowledge/articles/${encodeURIComponent(knowledgeArticleId)}`)
      .then(setArticle)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setLoading(false))
  }, [knowledgeArticleId, knowledgeOpen])

  const total = useMemo(() => categories.reduce((sum, item) => sum + item.count, 0), [categories])
  if (!knowledgeOpen) return null

  return (
    <div className="knowledge-overlay" onMouseDown={closeKnowledge}>
      <section className="knowledge-window" onMouseDown={(event) => event.stopPropagation()} aria-label="База знаний ЭЛОУ-АВТ">
        <header className="knowledge-header">
          <div className="knowledge-title">
            <span className="knowledge-mark"><Icon name="book" /></span>
            <div><span className="knowledge-kicker">Контролируемый учебный контент · {total} материалов</span><h1>База знаний ЭЛОУ-АВТ</h1></div>
          </div>
          <button type="button" className="knowledge-close" onClick={closeKnowledge} aria-label="Закрыть"><Icon name="close" /></button>
        </header>

        <div className="knowledge-toolbar">
          <label className="knowledge-search"><Icon name="search" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Процесс, оборудование, отказ или термин…" /></label>
          <select value={role} onChange={(event) => setRole(event.target.value)} aria-label="Роль пользователя">
            {roleOptions.map((item) => <option key={item || 'all'} value={item}>{item || 'Все роли'}</option>)}
          </select>
          <span className="knowledge-result-count">{loading ? 'Поиск…' : `${articles.length} найдено`}</span>
        </div>

        <div className="knowledge-layout">
          <aside className="knowledge-navigation">
            <div className="knowledge-categories">
              <button type="button" className={category === '' ? 'active' : ''} onClick={() => setCategory('')}>Все разделы <span>{total}</span></button>
              {categories.map((item) => <button type="button" key={item.name} className={category === item.name ? 'active' : ''} onClick={() => setCategory(item.name)}>{item.name} <span>{item.count}</span></button>)}
            </div>
            <div className="knowledge-list">
              {articles.map((item) => (
                <button type="button" key={item.id} className={article?.id === item.id ? 'active' : ''} onClick={() => openKnowledge(item.id)}>
                  <span className="knowledge-list-category">{item.category.replace(/^\d+\.\s*/, '')}</span>
                  <strong>{item.title}</strong>
                  <span>{item.summary}</span>
                  <small>Ред. {item.revision} · {statusLabel(item.status)}</small>
                </button>
              ))}
              {!loading && !articles.length && <p className="knowledge-empty">Материалов по этим условиям нет. Уточните запрос или сбросьте фильтр.</p>}
            </div>
          </aside>

          <main className="knowledge-reader">
            {error && <div className="knowledge-error"><Icon name="alert" />Ошибка: {error}</div>}
            {!article && !error && (
              <div className="knowledge-welcome">
                <span className="knowledge-welcome-icon"><Icon name="book" /></span>
                <span>Справочник оператора, КИПиА и руководителя смены</span>
                <h2>Выберите материал в каталоге</h2>
                <p>Статьи организованы по технологической цепочке, оборудованию, инженерным системам, безопасности и аналитике. Поиск учитывает термины, теги оборудования и содержание разделов.</p>
                <div><strong>{total}</strong><span>материалов</span><strong>{categories.length}</strong><span>разделов</span></div>
              </div>
            )}
            {article && (
              <article className="knowledge-article">
                <nav className="knowledge-breadcrumb">База знаний <Icon name="chevron" /> {article.category}</nav>
                <div className="knowledge-article-head">
                  <div>
                    <div className="knowledge-badges"><span className={`status ${article.status}`}>{statusLabel(article.status)}</span><span>Редакция {article.revision}</span><span>{article.updatedAt}</span></div>
                    <h2>{article.title}</h2>
                    <p className="knowledge-summary">{article.summary}</p>
                  </div>
                  <span className="knowledge-doc-icon"><Icon name="book" /></span>
                </div>

                <div className="knowledge-safety"><Icon name="shield" /><div><strong>Граница применимости</strong><p>{article.safetyNotice}</p></div></div>

                {!!article.learningObjectives.length && <section className="knowledge-objectives"><h3>После изучения вы сможете</h3><ul>{article.learningObjectives.map((item) => <li key={item}><Icon name="check" />{item}</li>)}</ul></section>}

                {article.diagram && <figure className="knowledge-diagram"><img src={diagramAsset(article.diagram.src, darkTheme)} alt={article.diagram.alt} /><figcaption>{article.diagram.caption}</figcaption></figure>}

                {article.sections.map((section, index) => (
                  <section className="knowledge-section" key={`${section.title}-${index}`}>
                    <h3><span>{String(index + 1).padStart(2, '0')}</span>{section.title}</h3>
                    {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                    {!!section.bullets?.length && <ul>{section.bullets.map((item) => <li key={item}>{item}</li>)}</ul>}
                    {section.warning && <div className="knowledge-warning"><Icon name="alert" /><p>{section.warning}</p></div>}
                    {!!section.sourceIds?.length && <div className="knowledge-section-sources"><strong>Материалы раздела</strong>{section.sourceIds.map((sourceId) => <a key={sourceId} href={`/api/knowledge/references/${encodeURIComponent(sourceId)}`} target="_blank" rel="noreferrer">{sourceId}</a>)}</div>}
                  </section>
                ))}

                <div className="knowledge-metadata">
                  {!!article.roles.length && <div><strong>Для ролей</strong><p>{article.roles.join(' · ')}</p></div>}
                  {!!article.equipmentIds.length && <div><strong>Оборудование</strong><p>{article.equipmentIds.join(' · ')}</p></div>}
                  {!!article.scenarioIds.length && <div><strong>Связанные сценарии</strong><p>{article.scenarioIds.join(' · ')}</p></div>}
                </div>

                {!!article.relatedArticleIds.length && <section className="knowledge-related"><h3>Продолжить изучение</h3><div>{article.relatedArticleIds.map((id) => <button type="button" key={id} onClick={() => openKnowledge(id)}>{id}<Icon name="chevron" /></button>)}</div></section>}

                <section className="knowledge-sources"><h3>Локальные документы</h3>{article.sources.map((source) => <a key={source.id} href={`/api/knowledge/references/${encodeURIComponent(source.id)}`} target="_blank" rel="noreferrer"><span><strong>{source.id} · {source.title}</strong><small>{source.publisher} · {source.kind}{source.edition ? ` · ${source.edition}` : ''}</small>{source.usageNote && <small className="usage">{source.usageNote}</small>}</span><Icon name="chevron" /></a>)}</section>

                <div className="knowledge-keywords">{article.keywords.map((keyword) => <span key={keyword}>{keyword}</span>)}</div>
              </article>
            )}
          </main>
        </div>
      </section>
    </div>
  )
}
