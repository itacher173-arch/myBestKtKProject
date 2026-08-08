/** LCS-сопоставление эталонной траектории с журналом действий. */

export interface LcsMatch {
  /** Индекс в эталоне → индекс в журнале (-1 если пропущен) */
  mapping: number[]
  matched: number
  total: number
  /** Первый пропущенный шаг эталона */
  firstMissedStep: string | null
  firstMissedIndex: number | null
  /** Лишние действия (не из эталона), допустимые без штрафа по LCS-логике */
  extrasAllowed: string[]
}

function normalize(s: string): string {
  return s.trim().toLowerCase()
}

function stepEqual(a: string, b: string): boolean {
  if (normalize(a) === normalize(b)) return true
  // Топливо: эталон «на 40%» засчитывается при фактическом ≥40%
  if (a.includes('топливного газа') || b.includes('топливного газа')) {
    const need = a.includes('топливного') ? a : b
    const got = a.includes('топливного') ? b : a
    const mNeed = need.match(/на (\d+)%/)
    const mGot = got.match(/топливного газа на (\d+)%/)
    if (mNeed && mGot && Number(mGot[1]) >= Number(mNeed[1])) return true
  }
  return false
}

/**
 * Longest Common Subsequence по обязательным шагам.
 * Доп. действия обучаемого не ломают совпадение эталона.
 */
export function matchGoldenTrajectory(
  golden: string[],
  actions: { description: string; at?: number }[],
): LcsMatch {
  const done = actions.map((a) => a.description)
  const n = golden.length
  const m = done.length
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array<number>(m + 1).fill(0),
  )
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (stepEqual(golden[i - 1], done[j - 1])) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  const mapping = Array<number>(n).fill(-1)
  let i = n
  let j = m
  while (i > 0 && j > 0) {
    if (stepEqual(golden[i - 1], done[j - 1])) {
      mapping[i - 1] = j - 1
      i -= 1
      j -= 1
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i -= 1
    } else {
      j -= 1
    }
  }

  const matched = mapping.filter((x) => x >= 0).length
  const firstMissedIndex = mapping.findIndex((x) => x < 0)
  const firstMissedStep =
    firstMissedIndex >= 0 ? golden[firstMissedIndex] : null

  const used = new Set(mapping.filter((x) => x >= 0))
  const extrasAllowed = done.filter((_, idx) => !used.has(idx))

  return {
    mapping,
    matched,
    total: n,
    firstMissedStep,
    firstMissedIndex: firstMissedIndex >= 0 ? firstMissedIndex : null,
    extrasAllowed,
  }
}

export interface TrajectoryError {
  at: number | null
  stepIndex: number
  expected: string
  rule: string
  message: string
}

/** Локализация первой ошибки по времени (момент предыдущего успешного шага). */
export function localizeTrajectoryError(
  golden: string[],
  actions: { description: string; at?: number }[],
): TrajectoryError | null {
  const match = matchGoldenTrajectory(golden, actions)
  if (match.firstMissedIndex == null || match.firstMissedStep == null) {
    return null
  }
  const prevIdx =
    match.firstMissedIndex > 0
      ? match.mapping[match.firstMissedIndex - 1]
      : -1
  const at =
    prevIdx >= 0 && actions[prevIdx]?.at != null
      ? (actions[prevIdx].at as number)
      : actions.length
        ? (actions[actions.length - 1].at ?? null)
        : null
  return {
    at,
    stepIndex: match.firstMissedIndex,
    expected: match.firstMissedStep,
    rule: `golden[${match.firstMissedIndex + 1}/${golden.length}]`,
    message: `Пропущен обязательный шаг: «${match.firstMissedStep}»`,
  }
}
