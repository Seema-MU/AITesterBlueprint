/**
 * Deterministic scoring configuration — tunable without touching logic.
 * Weights mirror v3 §4; synonym aliases are normalized before any intersection.
 */

export const SCORE_WEIGHTS = {
  required: 0.45,
  preferred: 0.2,
  seniorityFit: 0.15,
  domainFit: 0.1,
  atsKeywordCoverage: 0.1,
} as const

/**
 * Synonym map: alias -> canonical. Both JD skill names and resume text are
 * normalized (lowercase, punctuation stripped) and aliases remapped before
 * matching, so `k8s` finds `kubernetes` and `js` finds `javascript`.
 */
export const SYNONYMS: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  k8s: 'kubernetes',
  rtl: 'react testing library',
  reactjs: 'react',
  postgres: 'postgresql',
  aws: 'amazon web services',
  gcp: 'google cloud',
  'google cloud platform': 'google cloud',
  'sap dbm': 'sap',
  pw: 'playwright',
  wdio: 'webdriverio',
  bdd: 'cucumber',
}

/** Normalizes a skill/token phrase for matching: lowercase, collapse punctuation & spaces. */
export function normalizeSkill(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9+#. ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // strip stray leading/trailing punctuation (keeps interior dots: ".NET", "C#.NET")
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '')
}

/** Applies the synonym map to a normalized phrase and returns the canonical form. */
export function canonicalSkill(input: string): string {
  const n = normalizeSkill(input)
  return SYNONYMS[n] ?? n
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Canonicalizes whole resume/profile text: alias words (js, k8s, ts …) are
 * rewritten to their canonical form so JD names like "Kubernetes" can match a
 * resume that only ever says "K8s". Word boundaries keep aliases from firing
 * inside unrelated words.
 */
export function canonicalizeText(input: string): string {
  let text = normalizeSkill(input)
  for (const [alias, canonical] of Object.entries(SYNONYMS)) {
    const pattern = new RegExp(`(?<![a-z0-9])${escapeRegExp(alias)}(?![a-z0-9])`, 'g')
    text = text.replace(pattern, canonical)
  }
  return text
}
