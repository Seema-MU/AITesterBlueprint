import { z } from 'zod'
import type {
  JobCard,
  LLMSettings,
  MasterProfile,
  SettingsRow,
  JobSpec,
  MatchAnalysis,
  Artifact,
  ResumeVersion,
  ResumeVersionExport,
  InterviewRound,
} from './schema'
import {
  ArtifactSchema,
  DEFAULT_LLM,
  EMPTY_PROFILE,
  InterviewRoundSchema,
  JobCardSchema,
  JobSpecSchema,
  MatchAnalysisSchema,
  MasterProfileSchema,
  ResumeVersionExportSchema,
  SettingsRowSchema,
  LLMSettingsSchema,
} from './schema'
import { base64ToArrayBuffer, bytesToBase64 } from './base64'

export const EXPORT_SCHEMA_VERSION = 5

/** Version 5 backup: everything in v4 plus interview rounds (artifacts already carry prep). */
export const ExportFileV5Schema = z.object({
  schemaVersion: z.literal(5),
  exportedAt: z.string(),
  jobCards: z.array(JobCardSchema),
  settings: SettingsRowSchema,
  llm: LLMSettingsSchema.optional(),
  profile: MasterProfileSchema.optional(),
  jobSpecs: z.array(JobSpecSchema).optional(),
  matchAnalyses: z.array(MatchAnalysisSchema).optional(),
  artifacts: z.array(ArtifactSchema).optional(),
  resumeVersions: z.array(ResumeVersionExportSchema).optional(),
  interviews: z.array(InterviewRoundSchema).optional(),
})
export type ExportFileV5 = z.infer<typeof ExportFileV5Schema>

/** Version 4 backup: everything in v3 plus the resume library (files as base64). */
export const ExportFileV4Schema = z.object({
  schemaVersion: z.literal(4),
  exportedAt: z.string(),
  jobCards: z.array(JobCardSchema),
  settings: SettingsRowSchema,
  llm: LLMSettingsSchema.optional(),
  profile: MasterProfileSchema.optional(),
  jobSpecs: z.array(JobSpecSchema).optional(),
  matchAnalyses: z.array(MatchAnalysisSchema).optional(),
  artifacts: z.array(ArtifactSchema).optional(),
  resumeVersions: z.array(ResumeVersionExportSchema).optional(),
})
export type ExportFileV4 = z.infer<typeof ExportFileV4Schema>

/** Version 3 backups (Phase 2) still import — the resume library starts empty. */
export const ExportFileV3Schema = z.object({
  schemaVersion: z.literal(3),
  exportedAt: z.string(),
  jobCards: z.array(JobCardSchema),
  settings: SettingsRowSchema,
  llm: LLMSettingsSchema.optional(),
  profile: MasterProfileSchema.optional(),
  jobSpecs: z.array(JobSpecSchema).optional(),
  matchAnalyses: z.array(MatchAnalysisSchema).optional(),
  artifacts: z.array(ArtifactSchema).optional(),
})
export type ExportFileV3 = z.infer<typeof ExportFileV3Schema>

/** Version 2 backups (Phase 1) still import — the artifact set starts empty. */
export const ExportFileV2Schema = z.object({
  schemaVersion: z.literal(2),
  exportedAt: z.string(),
  jobCards: z.array(JobCardSchema),
  settings: SettingsRowSchema,
  llm: LLMSettingsSchema.optional(),
  profile: MasterProfileSchema.optional(),
  jobSpecs: z.array(JobSpecSchema).optional(),
  matchAnalyses: z.array(MatchAnalysisSchema).optional(),
})
export type ExportFileV2 = z.infer<typeof ExportFileV2Schema>

/** Version 1 backups (cards + theme only) still import — missing AI records start empty. */
export const ExportFileV1Schema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: z.string(),
  jobCards: z.array(JobCardSchema),
  settings: SettingsRowSchema,
})
export type ExportFileV1 = z.infer<typeof ExportFileV1Schema>

export type ExportFile =
  | ExportFileV5
  | ExportFileV4
  | ExportFileV3
  | ExportFileV2
  | ExportFileV1

export interface ExportOptions {
  llm?: LLMSettings
  profile?: MasterProfile
  jobSpecs?: JobSpec[]
  matchAnalyses?: MatchAnalysis[]
  artifacts?: Artifact[]
  resumeVersions?: ResumeVersion[]
  interviews?: InterviewRound[]
}

/** Encodes each resume's stored bytes as base64 so the backup stays a single JSON file. */
export function buildExportData(
  jobCards: JobCard[],
  settings: SettingsRow,
  options: ExportOptions = {},
): ExportFileV5 {
  const resumeVersions: ResumeVersionExport[] | undefined = options.resumeVersions?.map(
    ({ fileData, ...rest }) => ({
      ...rest,
      fileBase64: bytesToBase64(fileData),
    }),
  )

  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    jobCards,
    settings,
    llm: options.llm,
    profile: options.profile,
    jobSpecs: options.jobSpecs,
    matchAnalyses: options.matchAnalyses,
    artifacts: options.artifacts,
    resumeVersions,
    interviews: options.interviews,
  }
}

export function downloadExport(data: ExportFileV5): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  a.download = `mynextinterview-backup-${stamp}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export interface ImportResult {
  jobCards: JobCard[]
  settings: SettingsRow
  llm: LLMSettings
  profile: MasterProfile
  jobSpecs: JobSpec[]
  matchAnalyses: MatchAnalysis[]
  artifacts: Artifact[]
  resumeVersions: ResumeVersion[]
  interviews: InterviewRound[]
}

/** Parses and Zod-validates an uploaded backup (v1–v5). Throws with a readable message. */
export async function parseImportFile(file: File): Promise<ImportResult> {
  let raw: unknown
  try {
    raw = JSON.parse(await file.text())
  } catch {
    throw new Error('This file is not valid JSON.')
  }

  // Newest first: `schemaVersion` is a literal, so a newer file never matches an
  // older schema and must be tried before it.
  const v5 = ExportFileV5Schema.safeParse(raw)
  if (v5.success) return normalize(v5.data.jobCards, v5.data.settings, v5.data)

  const v4 = ExportFileV4Schema.safeParse(raw)
  if (v4.success) return normalize(v4.data.jobCards, v4.data.settings, v4.data)

  const v3 = ExportFileV3Schema.safeParse(raw)
  if (v3.success) return normalize(v3.data.jobCards, v3.data.settings, v3.data)

  const v2 = ExportFileV2Schema.safeParse(raw)
  if (v2.success) return normalize(v2.data.jobCards, v2.data.settings, v2.data)

  const v1 = ExportFileV1Schema.safeParse(raw)
  if (v1.success) return normalize(v1.data.jobCards, v1.data.settings, {})

  const issue =
    v5.error.issues[0] ??
    v4.error.issues[0] ??
    v3.error.issues[0] ??
    v2.error.issues[0] ??
    v1.error.issues[0]
  const detail = issue
    ? ` (${issue.path.join('.') || 'file'}: ${issue.message})`
    : ''
  throw new Error(`This backup does not match the expected format${detail}.`)
}

interface OptionalRecords {
  llm?: LLMSettings
  profile?: MasterProfile
  jobSpecs?: JobSpec[]
  matchAnalyses?: MatchAnalysis[]
  artifacts?: Artifact[]
  resumeVersions?: ResumeVersionExport[]
  interviews?: InterviewRound[]
}

function normalize(
  jobCards: JobCard[],
  settings: SettingsRow,
  v: OptionalRecords,
): ImportResult {
  return {
    jobCards,
    settings,
    llm: v.llm ?? DEFAULT_LLM,
    profile: v.profile ?? EMPTY_PROFILE,
    jobSpecs: v.jobSpecs ?? [],
    matchAnalyses: v.matchAnalyses ?? [],
    artifacts: v.artifacts ?? [],
    // Base64 payloads are turned back into bytes here, so callers receive real files.
    resumeVersions: (v.resumeVersions ?? []).map(({ fileBase64, ...rest }) => ({
      ...rest,
      fileData: base64ToArrayBuffer(fileBase64),
    })),
    interviews: v.interviews ?? [],
  }
}
