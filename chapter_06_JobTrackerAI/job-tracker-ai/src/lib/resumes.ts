import { z } from 'zod'
import type { JobCard, LLMSettings, MatchAnalysis, MasterProfile, ParsedResume, ResumeVersion } from './schema'
import { PROFILE_ID, ParsedResumeSchema } from './schema'
import * as db from './db'
import { completeJson, LlmError } from './llm'
import { hashText } from './hash'
import { newId } from './utils'
import { extractResumeText } from './resumeFile'
import { RESUME_PARSE_PROMPT_VERSION, resumeParsePrompt } from './prompts'

const CachedParseSchema = z.object({
  parsed: ParsedResumeSchema,
  modelUsed: z.string(),
})

export function defaultResumeLabel(fileName: string): string {
  return fileName.replace(/\.(pdf|docx)$/i, '').trim() || fileName
}

function mimeTypeFor(file: File): string {
  if (file.type) return file.type
  return file.name.toLowerCase().endsWith('.pdf')
    ? 'application/pdf'
    : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
}

/** Parses (or reuses from cache) the structured profile for a resume's text. */
export async function parseResumeText(
  rawText: string,
  llm: LLMSettings,
): Promise<{ parsed: ParsedResume; modelUsed: string }> {
  const cacheKey = `resume:${hashText(`${rawText}|${RESUME_PARSE_PROMPT_VERSION}|${llm.model}`)}`
  const cached = await db.cacheGet(cacheKey)
  const fromCache = CachedParseSchema.safeParse(cached?.value)
  if (fromCache.success) return fromCache.data

  const { data, modelUsed } = await completeJson(
    llm,
    'You extract structured data from resumes.',
    resumeParsePrompt(rawText),
    ParsedResumeSchema,
    { temperature: 0.1, maxTokens: 3000 },
  )
  await db.cacheSet(cacheKey, { parsed: data, modelUsed })
  return { parsed: data, modelUsed }
}

async function parseAndStore(version: ResumeVersion, llm: LLMSettings): Promise<ResumeVersion> {
  const { parsed, modelUsed } = await parseResumeText(version.rawText, llm)
  const updated: ResumeVersion = {
    ...version,
    parsed,
    modelUsed,
    promptVersion: RESUME_PARSE_PROMPT_VERSION,
    parseError: undefined,
  }
  return db.saveResumeVersion(updated)
}

async function recordParseFailure(version: ResumeVersion, error: unknown): Promise<ResumeVersion> {
  const failed: ResumeVersion = {
    ...version,
    parseError: error instanceof LlmError || error instanceof Error ? error.message : 'Parsing failed.',
  }
  return db.saveResumeVersion(failed)
}

export interface CreateResumeInput {
  file: File
  label?: string
  notes?: string
  llm: LLMSettings
}

/**
 * Uploads a resume: extracts its text client-side, stores the original file, then
 * parses it with the model. A parse failure never loses the upload — the raw text
 * and file stay, with `parseError` explaining what to retry.
 */
export async function createResumeVersion(input: CreateResumeInput): Promise<ResumeVersion> {
  const rawText = await extractResumeText(input.file)
  const version: ResumeVersion = {
    id: newId(),
    label: (input.label?.trim() || defaultResumeLabel(input.file.name)).slice(0, 80),
    notes: input.notes?.trim() || undefined,
    isPrimary: false, // db.ts forces this true for the very first version
    fileName: input.file.name,
    fileData: await input.file.arrayBuffer(),
    fileMimeType: mimeTypeFor(input.file),
    rawText,
    createdAt: new Date().toISOString(),
  }
  const saved = await db.saveResumeVersion(version)
  if (!input.llm.model) return saved // no model configured: upload stands, UI offers Re-parse
  try {
    return await parseAndStore(saved, input.llm)
  } catch (error) {
    return recordParseFailure(saved, error)
  }
}

export async function reparseResumeVersion(
  version: ResumeVersion,
  llm: LLMSettings,
): Promise<ResumeVersion> {
  if (!llm.model) throw new LlmError('Set the model name in Settings before parsing.')
  try {
    return await parseAndStore(version, llm)
  } catch (error) {
    return recordParseFailure(version, error)
  }
}

export interface ResolvedResume {
  resumeVersionId: string
  resumeText: string
  label: string
}

/**
 * Which resume to match and generate against: the card's own version if it still
 * exists, otherwise the primary, otherwise the pasted profile text (Phase 1 fallback).
 */
export function resolveResume(
  card: JobCard,
  versions: ResumeVersion[],
  profile: MasterProfile,
): ResolvedResume {
  const attached = card.resumeVersionId
    ? versions.find((v) => v.id === card.resumeVersionId)
    : undefined
  const version = attached ?? versions.find((v) => v.isPrimary) ?? versions[0]
  if (version) {
    return { resumeVersionId: version.id, resumeText: version.rawText, label: version.label }
  }
  return { resumeVersionId: PROFILE_ID, resumeText: profile.resumeText, label: 'Profile text' }
}

/** Highest match score this resume version has achieved against any stored JD. */
export function bestScoreForVersion(
  analyses: MatchAnalysis[],
  resumeVersionId: string,
): number | undefined {
  const scores = analyses
    .filter((a) => a.resumeVersionId === resumeVersionId)
    .map((a) => a.overallScore)
  return scores.length > 0 ? Math.max(...scores) : undefined
}

export function resumeLabelsById(versions: ResumeVersion[]): Record<string, string> {
  return Object.fromEntries(versions.map((v) => [v.id, v.label]))
}
