export type AiSeverity = 'critical' | 'warning' | 'info'

export interface AiFinding {
  code: string
  severity: AiSeverity
  title: string
  evidence: string
  recommendation: string
  trainingId: string | null
  articleId: string | null
}

export interface AiRecommendation {
  trainingId: string
  trainingTitle: string
  segment: string
  durationMinutes: number
  reason: string
  articleId: string
  articleTitle: string
}

export interface AiRankedModule {
  moduleId: string
  title: string
  segment: string
  durationMinutes: number
  score: number
  skills: string[]
  matchedSkills: string[]
  prerequisites: string[]
  missingPrerequisites: string[]
  eligible: boolean
  reasons: string[]
}

export interface AiAnalysisSource {
  articleId: string
  chunkId: string
  title: string
  category: string
  revision: string
  score?: number
  indexVersion?: string
}

export interface AiAnalysis {
  analysisId: string
  generatedAt: number
  mode: string
  overallLevel: string
  summary: string
  metrics: {
    scorePercent: number
    actionsCount: number
    eventsCount: number
    criticalCount: number
    warningCount: number
    duplicateActions: number
    durationSeconds: number
    maxPauseSeconds: number
    controlAreasCount: number
  }
  trajectory: Array<{
    sequence: number
    at: number
    category: string
    description: string
    interpretation: string
  }>
  controlAreas: string[]
  strengths: string[]
  findings: AiFinding[]
  recommendations: AiRecommendation[]
  disclaimer: string
  debrief?: {
    narrative: string
    mode: string
  }
  recommendationRanking?: AiRankedModule[]
  nextBestModule?: AiRankedModule | null
  sources?: AiAnalysisSource[]
  modelVersion?: string
  skillGraphVersion?: string
  orchestration?: {
    ml: string
    rag: string
    llm: string
    promptVersion: string
    generatedAt: number
  }
}

export interface AiChatSource {
  articleId: string
  chunkId?: string
  title: string
  category: string
  revision?: string
  score?: number
  indexVersion?: string
}

export interface AiChatTraining {
  trainingId: string
  trainingTitle: string
  segment: string
}

export interface AiChatResponse {
  messageId: string
  answer: string
  mode: string
  intent?: 'conversation' | 'ktk-knowledge'
  sources: AiChatSource[]
  relatedTrainings: AiChatTraining[]
  promptVersion?: string
  indexVersion?: string
}
