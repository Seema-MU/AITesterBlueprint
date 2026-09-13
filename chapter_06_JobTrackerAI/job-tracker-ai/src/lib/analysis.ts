import { z } from 'zod'
import type { JobSpec, LLMSettings, MatchAnalysis, MatchedSkill, MissingSkill } from './schema'
import { JDSkillSchema, PROFILE_ID } from './schema'
import * as db from './db'
import { completeJson, LlmError } from './llm'
import { jobSpecPrompt, SPEC_PROMPT_VERSION } from './prompts'
import { SCORE_WEIGHTS, SYNONYMS, canonicalizeText, canonicalSkill } from './config'
import { hashText } from './hash'
import { newId } from './utils'

// --- extraction ---

export const SpecExtractionSchema = z.object({
  requiredSkills: z.array(JDSkillSchema),
  preferredSkills: z.array(JDSkillSchema),
  domainTags: z.array(z.string()).default([]),
})
export type SpecExtraction = z.infer<typeof SpecExtractionSchema>

function dedupe(skills: { name: string; evidence: string }[]): { name: string; evidence: string }[] {
  const seen = new Set<string>()
  const out: { name: string; evidence: string }[] = []
  for (const skill of skills) {
    const name = skill.name.trim()
    const evidence = skill.evidence.trim()
    if (!name || !evidence) continue // v3: a skill with no evidence is dropped, not displayed
    if (!isSkillLike(name)) continue // drop responsibilities/qualities the model mistook for skills
    const key = canonicalSkill(name)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ name, evidence })
  }
  return out
}

/**
 * Heuristic guard: extracted "skills" should be short noun phrases. Filters out
 * verb-phrase responsibilities and soft-skill/quality bullets that small models
 * tend to emit, which would otherwise corrupt coverage (and look like a real 0%).
 */
function isSkillLike(name: string): boolean {
  const n = name.toLowerCase().trim()
  if (/^(designing|architecting|developing|building|creating|implementing|mentoring|coaching|leading|owning|performing|automating|managing)\b/.test(n)) {
    return false
  }
  if (n.split(/\s+/).length > 7) return false
  if (/\b(ability to|ownership|years of experience)\b/.test(n)) return false
  if (/(roles|skills|responsibilities|experience in)$/.test(n)) return false
  return true
}

/**
 * Extracts (or returns cached) structured job requirements for a JD.
 * Cached by content hash so re-analysing an unchanged JD costs zero tokens.
 */
export async function extractSpec(
  jobCardId: string,
  jdText: string,
  llm: LLMSettings,
  existingId?: string,
): Promise<JobSpec> {
  const cacheKey = `spec:${hashText(`${jdText}|${SPEC_PROMPT_VERSION}|${llm.model}`)}`
  const cached = await db.cacheGet(cacheKey)

  let extraction: SpecExtraction
  if (cached) {
    const reparsed = SpecExtractionSchema.safeParse(cached.value)
    if (reparsed.success) {
      extraction = reparsed.data
    } else {
      const fresh = await completeJson(
        llm,
        'You extract structured data from job descriptions.',
        jobSpecPrompt(jdText),
        SpecExtractionSchema,
        { temperature: 0.1 },
      )
      extraction = fresh.data
      await db.cacheSet(cacheKey, extraction)
    }
  } else {
    const fresh = await completeJson(
      llm,
      'You extract structured data from job descriptions.',
      jobSpecPrompt(jdText),
      SpecExtractionSchema,
      { temperature: 0.1 },
    )
    extraction = fresh.data
    await db.cacheSet(cacheKey, extraction)
  }

  const required = dedupe(extraction.requiredSkills)
  const preferred = dedupe(extraction.preferredSkills)
  if (required.length === 0 && preferred.length === 0) {
    throw new LlmError(
      'Could not extract any skills from this JD with the current model. Check the model in Settings or the JD text.',
    )
  }

  return {
    id: existingId ?? newId(),
    jobCardId,
    jdHash: hashText(jdText),
    requiredSkills: required,
    preferredSkills: preferred,
    domainTags: extraction.domainTags.map((t) => t.trim()).filter(Boolean),
    promptVersion: SPEC_PROMPT_VERSION,
    extractedAt: new Date().toISOString(),
  }
}

// --- deterministic matching (pure: same inputs, same score) ---

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Aliases in SYNONYMS that resolve to the same canonical skill as `name`. */
function aliasCandidates(name: string): string[] {
  const target = canonicalSkill(name)
  const aliases: string[] = []
  for (const [alias, canonical] of Object.entries(SYNONYMS)) {
    if (canonicalSkill(canonical) === target) aliases.push(alias)
  }
  return aliases
}

function findSkillInText(
  resumeText: string,
  skillName: string,
): { found: boolean; rawMatch: string; index: number; inNormalized: boolean } {
  const lower = resumeText.toLowerCase()
  const canonicalResume = canonicalizeText(resumeText)
  const candidates = [skillName, ...aliasCandidates(skillName)]
    .map((c) => c.trim())
    .filter((c) => c.length > 0)

  // Pass 1: raw phrase over the raw resume (preserves punctuation like "CI/CD", exact snippets).
  for (const candidate of candidates) {
    const pattern = new RegExp(`(?<![a-z0-9])${escapeRegExp(candidate.toLowerCase())}(?![a-z0-9])`)
    const match = pattern.exec(lower)
    if (match) return { found: true, rawMatch: candidate, index: match.index, inNormalized: false }
  }
  // Pass 2: canonical phrase over synonym-canonicalized resume (K8s -> Kubernetes, js -> JavaScript).
  const canonicalCandidate = canonicalSkill(skillName)
  const pattern2 = new RegExp(`(?<![a-z0-9])${escapeRegExp(canonicalCandidate)}(?![a-z0-9])`)
  const match2 = pattern2.exec(canonicalResume)
  if (match2) return { found: true, rawMatch: skillName, index: match2.index, inNormalized: true }

  // Pass 3: any contiguous 2-3 token window of the skill found verbatim in the resume
  // (resume says "CI/CD & DevOps" -> skill "CI/CD pipelines" counts as covered).
  const tokens = canonicalCandidate.split(' ')
  if (tokens.length > 1) {
    for (let winLen = Math.min(3, tokens.length); winLen >= 2; winLen--) {
      for (let i = 0; i + winLen <= tokens.length; i++) {
        const window = tokens.slice(i, i + winLen).join(' ')
        const pattern = new RegExp(`(?<![a-z0-9])${escapeRegExp(window)}(?![a-z0-9])`)
        const match = pattern.exec(canonicalResume)
        if (match) return { found: true, rawMatch: skillName, index: match.index, inNormalized: true }
      }
    }
  }

  // Pass 4: distinctive token presence (resume says "Cursor", skill is "Cursor AI").
  // A skill with several distinctive tokens (e.g. "Accessibility Testing") requires ALL of
  // them, so generic words like "testing" cannot trigger a match on their own. Partial
  // overlaps are already covered by the window pass above.
  const STOP = new Set(['and', 'or', 'with', 'for', 'the', 'to', 'of', 'in', 'using', 'a', 'an', 'on', 'as'])
  const distinctive = tokens.filter((t) => t.length >= 3 && !STOP.has(t))
  if (distinctive.length > 0) {
    const needed = distinctive.length === 1 ? 1 : distinctive.length
    const hits = distinctive.filter((t) => {
      const pattern = new RegExp(`(?<![a-z0-9])${escapeRegExp(t)}(?![a-z0-9])`)
      return pattern.test(canonicalResume)
    })
    if (hits.length >= needed) {
      const first = hits[0]
      const idx = canonicalResume.indexOf(first)
      return { found: true, rawMatch: first, index: idx === -1 ? 0 : idx, inNormalized: true }
    }
  }

  return { found: false, rawMatch: skillName, index: -1, inNormalized: false }
}

function snippetAround(resumeText: string, index: number, radius = 90): string {
  const start = Math.max(0, index - radius)
  const end = Math.min(resumeText.length, index + radius)
  const cut = resumeText.slice(start, end).replace(/\s+/g, ' ').trim()
  const prefix = start > 0 ? '…' : ''
  const suffix = end < resumeText.length ? '…' : ''
  return `${prefix}${cut}${suffix}`
}

function yearsInText(text: string): number | null {
  const pattern = /(\d{1,2})\s*(?:[–-]|to)?\s*(\d{1,2})?\s*(?:\+)?\s*years?/i
  const match = pattern.exec(text)
  if (!match) return null
  const a = Number(match[1])
  const b = match[2] ? Number(match[2]) : a
  // Requirement "5-8 years": the bar is the minimum (5). Resume "13+ years": use it as-is.
  return Math.min(a, b)
}

export interface MatchCompute {
  overallScore: number
  subScores: {
    requiredCoverage: number
    preferredCoverage: number
    seniorityFit: number
    domainFit: number
    atsKeywordCoverage: number
  }
  matched: MatchedSkill[]
  missingBlocking: MissingSkill[]
  missingCoverable: MissingSkill[]
  missingNiceToHave: MissingSkill[]
  atsGapKeywords: string[]
}

/** Pure scoring function — deterministic, unit-tested. Never asks the model for a number. */
export function computeMatch(spec: JobSpec, resumeText: string, jdText = ''): MatchCompute {
  const resume = resumeText ?? ''
  const lowerResume = resume.toLowerCase()

  // Group skills by their evidence snippet: OR-list alternatives ("Cursor AI or
  // GitHub Copilot or Claude Code…") share one snippet and one requirement — the
  // requirement is satisfied when ANY alternative is evidenced.
  interface Grouped {
    evidence: string
    items: { name: string; hit: ReturnType<typeof findSkillInText> }[]
  }
  function groupByEvidence(
    skills: { name: string; evidence: string }[],
  ): Grouped[] {
    const groups = new Map<string, Grouped>()
    for (const skill of skills) {
      const key = skill.evidence.trim().toLowerCase() || skill.name.toLowerCase()
      if (!groups.has(key)) groups.set(key, { evidence: skill.evidence, items: [] })
      groups.get(key)!.items.push({ name: skill.name, hit: findSkillInText(resume, skill.name) })
    }
    return [...groups.values()]
  }

  const matchedRequired: MatchedSkill[] = []
  const missingBlocking: MissingSkill[] = []
  const matchedPreferred: MatchedSkill[] = []
  const missingNiceToHave: MissingSkill[] = []
  let matchedRequiredGroups = 0
  let matchedPreferredGroups = 0

  const requiredGroups = groupByEvidence(spec.requiredSkills)
  const preferredGroups = groupByEvidence(spec.preferredSkills)

  for (const group of requiredGroups) {
    const found = group.items.filter((i) => i.hit.found)
    if (found.length > 0) {
      matchedRequiredGroups += 1
      for (const item of found) {
        const source = item.hit.inNormalized ? canonicalizeText(resume) : resume
        matchedRequired.push({
          name: item.name,
          resumeSnippet: snippetAround(source, item.hit.index),
        })
      }
    } else {
      for (const item of group.items) {
        missingBlocking.push({ name: item.name, jdEvidence: group.evidence })
      }
    }
  }

  for (const group of preferredGroups) {
    const found = group.items.filter((i) => i.hit.found)
    if (found.length > 0) {
      matchedPreferredGroups += 1
      for (const item of found) {
        const source = item.hit.inNormalized ? canonicalizeText(resume) : resume
        matchedPreferred.push({
          name: item.name,
          resumeSnippet: snippetAround(source, item.hit.index),
        })
      }
    } else {
      for (const item of group.items) {
        missingNiceToHave.push({ name: item.name, jdEvidence: group.evidence })
      }
    }
  }

  const requiredTotal = requiredGroups.length
  const preferredTotal = preferredGroups.length
  const bothTotal = requiredTotal + preferredTotal

  // Empty set = nothing demanded -> full coverage (no penalty).
  const requiredCoverage = requiredTotal === 0 ? 1 : matchedRequiredGroups / requiredTotal
  const preferredCoverage = preferredTotal === 0 ? 1 : matchedPreferredGroups / preferredTotal
  const atsKeywordCoverage =
    bothTotal === 0 ? 1 : (matchedRequiredGroups + matchedPreferredGroups) / bothTotal

  // Seniority: JD minimum years vs the first "N years" claim in the resume.
  const jdYears = yearsInText(jdText)
  const resumeYears = yearsInText(resume)
  let seniorityFit = 1
  if (jdYears !== null && resumeYears !== null) {
    seniorityFit = resumeYears >= jdYears ? 1 : resumeYears / jdYears
  }

  // Domain fit: how many explicit JD domain tags appear in the resume.
  const tags = spec.domainTags
  let domainFit = 1
  if (tags.length > 0) {
    const found = tags.filter((t) => lowerResume.includes(t.toLowerCase())).length
    domainFit = found / tags.length
  }

  const subScores = {
    requiredCoverage,
    preferredCoverage,
    seniorityFit,
    domainFit,
    atsKeywordCoverage,
  }

  const overallScore = Math.round(
    100 *
      (SCORE_WEIGHTS.required * subScores.requiredCoverage +
        SCORE_WEIGHTS.preferred * subScores.preferredCoverage +
        SCORE_WEIGHTS.seniorityFit * subScores.seniorityFit +
        SCORE_WEIGHTS.domainFit * subScores.domainFit +
        SCORE_WEIGHTS.atsKeywordCoverage * subScores.atsKeywordCoverage),
  )

  const atsGapKeywords = [...missingBlocking, ...missingNiceToHave].map((m) => m.name)

  return {
    overallScore,
    subScores,
    matched: [...matchedRequired, ...matchedPreferred],
    missingBlocking,
    missingNiceToHave,
    missingCoverable: [],
    atsGapKeywords,
  }
}

/**
 * Full analysis pipeline for one job card:
 * 1. extract (or reuse) the JobSpec for the card's JD — cached, so repeats cost zero tokens;
 * 2. compute the deterministic score and gap lists;
 * 3. persist spec + analysis; return both.
 */
export async function analyzeJobCard(
  jobCardId: string,
  jdText: string,
  resumeText: string,
  llm: LLMSettings,
  resumeVersionId: string = PROFILE_ID,
): Promise<{ spec: JobSpec; analysis: MatchAnalysis }> {
  const stored = await db.getSpecForJob(jobCardId)
  const jdHash = hashText(jdText)
  const needsExtract =
    !stored || stored.promptVersion !== SPEC_PROMPT_VERSION || stored.jdHash !== jdHash

  const spec =
    needsExtract || !stored
      ? await extractSpec(jobCardId, jdText, llm, stored?.id)
      : stored

  const computed = computeMatch(spec, resumeText, jdText)
  const analysis: MatchAnalysis = {
    id: newId(),
    jobCardId,
    resumeVersionId,
    overallScore: computed.overallScore,
    subScores: computed.subScores,
    matched: computed.matched,
    missingBlocking: computed.missingBlocking,
    missingCoverable: computed.missingCoverable,
    missingNiceToHave: computed.missingNiceToHave,
    atsGapKeywords: computed.atsGapKeywords,
    modelUsed: llm.model || 'openai-compatible',
    promptVersion: SPEC_PROMPT_VERSION,
    createdAt: new Date().toISOString(),
  }

  await db.saveSpec(spec)
  await db.saveAnalysis(analysis)
  return { spec, analysis }
}
