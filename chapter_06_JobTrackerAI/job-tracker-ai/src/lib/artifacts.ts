import { z } from 'zod'
import type { Artifact, ArtifactKind, FollowUpSequence, LLMSettings, PrepPlan } from './schema'
import { ArtifactContentSchema, FollowUpSequenceSchema, PrepPlanSchema } from './schema'
import * as db from './db'
import { completeJson } from './llm'
import { hashText } from './hash'
import { newId } from './utils'
import {
  COVER_LETTER_PROMPT_VERSION,
  DM_MAX_CHARS,
  DM_PROMPT_VERSION,
  FOLLOWUP_DAYS,
  FOLLOWUP_PROMPT_VERSION,
  FOLLOWUP_VARIANTS,
  PREP_MAX_TOKENS,
  PREP_PROMPT_VERSION,
  coverLetterPrompt,
  dmPrompt,
  followUpPrompt,
  prepPrompt,
  type FollowUpDay,
  type GenerationContext,
} from './prompts'

export interface GenerationInput {
  jobCardId: string
  name?: string
  headline?: string
  resumeText: string // the resolved resume (a version's text, or the pasted profile)
  company: string
  role: string
  jdText: string
  notes?: string
}

export interface GenerateArgs {
  input: GenerationInput
  llm: LLMSettings
  /** Existing artifacts for the card — used to replace in place instead of duplicating. */
  existing?: Artifact[]
  /** User explicitly asked to regenerate: skip the cache and call the model again. */
  force?: boolean
}

function context(input: GenerationInput): GenerationContext {
  return {
    name: input.name,
    headline: input.headline,
    resumeText: input.resumeText,
    company: input.company,
    role: input.role,
    jdText: input.jdText,
    notes: input.notes,
  }
}

const CachedGenerationSchema = z.object({
  content: z.string().min(1),
  modelUsed: z.string(),
})

/** Prep caches the structured plan alongside the text rendered from it. */
const CachedPrepSchema = z.object({
  plan: PrepPlanSchema,
  content: z.string().min(1),
  modelUsed: z.string(),
})

export function artifactKey(kind: ArtifactKind, variant?: string): string {
  return variant ? `${kind}:${variant}` : kind
}

/**
 * Finds the artifact this generation should replace. Prefers the caller's list
 * (already in memory) and falls back to the store, so regenerating without an
 * explicit `existing` list still lands on the same record instead of duplicating.
 */
async function resolveExisting(
  jobCardId: string,
  kind: ArtifactKind,
  variant: string | undefined,
  existing: Artifact[] | undefined,
): Promise<Artifact | undefined> {
  const pool = existing ?? (await db.listArtifactsForJob(jobCardId))
  return pool.find((a) => a.kind === kind && a.variant === variant)
}

/** Cache key per v3 §4: hash(resumeText + jdText + promptVersion + model), namespaced by artifact. */
function cacheKeyFor(
  kind: ArtifactKind,
  variant: string,
  input: GenerationInput,
  promptVersion: string,
  model: string,
): string {
  return `artifact:${kind}:${variant}:${hashText(
    `${input.resumeText}|${input.jdText}|${promptVersion}|${model}`,
  )}`
}

async function generateBlock(
  args: GenerateArgs,
  kind: ArtifactKind,
  variant: string,
  promptVersion: string,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  maxTokens: number,
): Promise<{ content: string; modelUsed: string }> {
  const { input, llm, force } = args
  const key = cacheKeyFor(kind, variant, input, promptVersion, llm.model)

  if (!force) {
    const cached = await db.cacheGet(key)
    const parsed = CachedGenerationSchema.safeParse(cached?.value)
    if (parsed.success) return parsed.data
  }

  const { data, modelUsed } = await completeJson(llm, systemPrompt, userPrompt, ArtifactContentSchema, {
    temperature,
    maxTokens,
  })
  await db.cacheSet(key, { content: data.content, modelUsed })
  return { content: data.content, modelUsed }
}

function buildArtifact(
  input: GenerationInput,
  existing: Artifact | undefined,
  kind: ArtifactKind,
  variant: string | undefined,
  content: string,
  modelUsed: string,
  promptVersion: string,
): Artifact {
  return {
    id: existing?.id ?? newId(),
    jobCardId: input.jobCardId,
    kind,
    variant,
    content,
    edited: false,
    modelUsed,
    promptVersion,
    createdAt: new Date().toISOString(),
    practised: [],
  }
}

async function store(artifact: Artifact): Promise<Artifact> {
  await db.saveArtifact(artifact)
  return artifact
}

export async function generateCoverLetter(args: GenerateArgs): Promise<Artifact> {
  const { input, existing } = args
  const { content, modelUsed } = await generateBlock(
    args,
    'coverLetter',
    '',
    COVER_LETTER_PROMPT_VERSION,
    'You write concise, formal, truthful cover letters grounded only in the supplied resume.',
    coverLetterPrompt(context(input)),
    0.7,
    900,
  )
  return store(
    buildArtifact(
      input,
      await resolveExisting(input.jobCardId, 'coverLetter', undefined, existing),
      'coverLetter',
      undefined,
      content,
      modelUsed,
      COVER_LETTER_PROMPT_VERSION,
    ),
  )
}

/** One call produces the whole Day 1 → Day 5 sequence; each day is stored as its own artifact. */
export async function generateFollowUps(args: GenerateArgs): Promise<Artifact[]> {
  const { input, llm, existing, force } = args
  const key = cacheKeyFor('followUp', 'sequence', input, FOLLOWUP_PROMPT_VERSION, llm.model)

  let sequence: FollowUpSequence
  let modelUsed: string

  const cached = force ? undefined : await db.cacheGet(key)
  const parsed = FollowUpSequenceSchema.safeParse(cached?.value)
  if (parsed.success) {
    sequence = parsed.data
    modelUsed = (cached?.value as { modelUsed?: string }).modelUsed ?? llm.model
  } else {
    const result = await completeJson(
      llm,
      'You write short, professional outreach and follow-up emails grounded only in the supplied resume.',
      followUpPrompt(context(input)),
      FollowUpSequenceSchema,
      { temperature: 0.5, maxTokens: 2000 },
    )
    sequence = result.data
    modelUsed = result.modelUsed
    await db.cacheSet(key, { ...sequence, modelUsed })
  }

  const byDay: Record<FollowUpDay, string> = {
    1: sequence.day1,
    2: sequence.day2,
    3: sequence.day3,
    4: sequence.day4,
    5: sequence.day5,
  }

  const artifacts: Artifact[] = []
  for (const day of FOLLOWUP_DAYS) {
    const variant = FOLLOWUP_VARIANTS[day]
    artifacts.push(
      await store(
        buildArtifact(
          input,
          await resolveExisting(input.jobCardId, 'followUp', variant, existing),
          'followUp',
          variant,
          byDay[day].trim(),
          modelUsed,
          FOLLOWUP_PROMPT_VERSION,
        ),
      ),
    )
  }
  return artifacts
}

export async function generateDm(args: GenerateArgs): Promise<Artifact> {
  const { input, llm } = args
  const basePrompt = dmPrompt(context(input))

  let result = await generateBlock(
    args,
    'dm',
    '',
    DM_PROMPT_VERSION,
    'You write very short recruiter outreach messages grounded only in the supplied resume.',
    basePrompt,
    0.4,
    300,
  )

  // Hard-enforce the 300-character ceiling: one corrective retry, never a silent trim.
  if (result.content.length > DM_MAX_CHARS) {
    const key = cacheKeyFor('dm', '', input, DM_PROMPT_VERSION, llm.model)
    const corrective = `${basePrompt}\n\nYour previous message was ${result.content.length} characters. It MUST be under ${DM_MAX_CHARS} characters. Shorten it and return the JSON object again.`
    try {
      const retry = await completeJson(llm, 'You write very short recruiter outreach messages.', corrective, ArtifactContentSchema, {
        temperature: 0.2,
        maxTokens: 300,
      })
      result = { content: retry.data.content, modelUsed: retry.modelUsed }
    } catch {
      // Keep the longer draft rather than losing the user's generated copy; the UI flags the length.
    }
    await db.cacheSet(key, { content: result.content, modelUsed: result.modelUsed })
  }

  return store(
    buildArtifact(
      input,
      await resolveExisting(input.jobCardId, 'dm', undefined, args.existing),
      'dm',
      undefined,
      result.content,
      result.modelUsed,
      DM_PROMPT_VERSION,
    ),
  )
}

/** Renders a plan as plain text, so `content` stays copyable and the backup readable. */
export function renderPrepPlan(plan: PrepPlan): string {
  return plan.topics
    .map((topic) => [`## ${topic.topic}`, ...topic.questions.map((q) => `- ${q}`)].join('\n'))
    .join('\n\n')
}

/** Stable key for one question inside a plan — what the practised ticks record. */
export function prepKey(topicIndex: number, questionIndex: number): string {
  return `${topicIndex}:${questionIndex}`
}

/**
 * Generates — or reuses from cache — the topic-grouped interview question plan.
 * `content` carries the rendered text; `prep` carries the structure the panel ticks
 * off. Regenerating resets the ticks, because the questions themselves are new.
 */
export async function generatePrep(args: GenerateArgs): Promise<Artifact> {
  const { input, llm, existing, force } = args
  const key = cacheKeyFor('prep', '', input, PREP_PROMPT_VERSION, llm.model)

  let plan: PrepPlan
  let content: string
  let modelUsed: string

  const cached = force ? undefined : await db.cacheGet(key)
  const parsed = CachedPrepSchema.safeParse(cached?.value)
  if (parsed.success) {
    plan = parsed.data.plan
    content = parsed.data.content
    modelUsed = parsed.data.modelUsed
  } else {
    const result = await completeJson(
      llm,
      'You prepare a candidate for a specific interview using only the supplied resume and job description.',
      prepPrompt(context(input)),
      PrepPlanSchema,
      { temperature: 0.6, maxTokens: PREP_MAX_TOKENS },
    )
    plan = result.data
    content = renderPrepPlan(plan)
    modelUsed = result.modelUsed
    await db.cacheSet(key, { plan, content, modelUsed })
  }

  const base = buildArtifact(
    input,
    await resolveExisting(input.jobCardId, 'prep', undefined, existing),
    'prep',
    undefined,
    content,
    modelUsed,
    PREP_PROMPT_VERSION,
  )
  return store({ ...base, prep: plan, practised: [] })
}

/**
 * Flips one question's practised tick and persists it. Lives here rather than in the
 * panel so the tick logic is unit-testable.
 */
export async function togglePrepPractised(artifact: Artifact, key: string): Promise<Artifact> {
  const practised = artifact.practised.includes(key)
    ? artifact.practised.filter((k) => k !== key)
    : [...artifact.practised, key]
  const updated: Artifact = { ...artifact, practised }
  await db.saveArtifact(updated)
  return updated
}

/**
 * One-time cleanup of follow-up drafts produced by a superseded prompt version
 * (e.g. the old day-3/7/14 three-email cadence). Those rows are structurally
 * wrong — their variants no longer exist and their cadence is gone — so they
 * would otherwise sit in storage forever, invisible in the panel but still
 * counted in backups. Idempotent and cheap; safe to call on every boot.
 */
export async function purgeStaleFollowUps(): Promise<number> {
  const stale = (await db.getAllArtifacts()).filter(
    (a) => a.kind === 'followUp' && a.promptVersion !== FOLLOWUP_PROMPT_VERSION,
  )
  for (const artifact of stale) await db.deleteArtifact(artifact.id)
  return stale.length
}
