import { z } from 'zod'

export const STATUSES = [
  'wishlist',
  'applied',
  'followup',
  'interview',
  'offer',
  'rejected',
] as const

export const StatusSchema = z.enum(STATUSES)
export type Status = z.infer<typeof StatusSchema>

export const COLUMN_LABELS: Record<Status, string> = {
  wishlist: 'Wishlist',
  applied: 'Applied',
  followup: 'Follow-up',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
}

/** Left-border accent per status (hex, applied inline so side colors are reliable). */
export const STATUS_HEX: Record<Status, string> = {
  wishlist: '#0ea5e9',
  applied: '#3b82f6',
  followup: '#f59e0b',
  interview: '#8b5cf6',
  offer: '#10b981',
  rejected: '#a1a1aa',
}

export const StatusEventSchema = z.object({
  from: StatusSchema,
  to: StatusSchema,
  at: z.string(), // ISO timestamp
})
export type StatusEvent = z.infer<typeof StatusEventSchema>

export const JobCardSchema = z.object({
  id: z.string(),
  company: z.string().min(1, 'Company is required'),
  role: z.string().min(1, 'Role is required'),
  jobUrl: z.string().optional(),
  jdRawText: z.string().optional(), // pasted job description, analysed in later phases
  resumeVersionId: z.string().optional(), // FK → ResumeVersion: which resume was sent
  matchScore: z.number().int().min(0).max(100).optional(), // denormalized for fast card render
  dateApplied: z.string(), // ISO date (YYYY-MM-DD), auto-set on creation
  salaryRange: z.string().optional(),
  notes: z.string().optional(),
  status: StatusSchema,
  history: z.array(StatusEventSchema),
})
export type JobCard = z.infer<typeof JobCardSchema>

export const ThemeSchema = z.enum(['light', 'dark'])
export type Theme = z.infer<typeof ThemeSchema>

/** Settings are stored as a single row keyed 'ui'. */
export const SettingsRowSchema = z.object({
  key: z.literal('ui'),
  theme: ThemeSchema,
})
export type SettingsRow = z.infer<typeof SettingsRowSchema>

export const DEFAULT_SETTINGS: SettingsRow = { key: 'ui', theme: 'light' }

/** Full job-card form payload (no id/status/history — those are assigned on write). */
export const JobFormSchema = JobCardSchema.omit({ id: true, history: true }).extend({
  status: StatusSchema,
})
export type JobForm = z.infer<typeof JobFormSchema>

export const EMPTY_FORM: JobForm = {
  company: '',
  role: '',
  jobUrl: '',
  jdRawText: '',
  resumeVersionId: '',
  dateApplied: new Date().toISOString().slice(0, 10),
  salaryRange: '',
  notes: '',
  status: 'wishlist',
}

// --- Phase 1: AI career copilot ---

export const PROFILE_ID = 'main'

export const MasterProfileSchema = z.object({
  id: z.literal(PROFILE_ID),
  name: z.string().optional(),
  headline: z.string().optional(),
  resumeText: z.string().default(''), // full resume text, pasted; the single matching source
  updatedAt: z.string().optional(),
})
export type MasterProfile = z.infer<typeof MasterProfileSchema>

export const EMPTY_PROFILE: MasterProfile = { id: PROFILE_ID, resumeText: '' }

/** LLM provider settings (BYOK, stored in IndexedDB, never bundled). */
export const LLMProviderSchema = z.enum(['openai-compatible'])
export type LLMProvider = z.infer<typeof LLMProviderSchema>

export const LLMSettingsSchema = z.object({
  key: z.literal('llm'),
  provider: LLMProviderSchema,
  baseUrl: z.string().default('http://localhost:1234/v1'), // OpenAI-compatible endpoint
  model: z.string().default(''),
  apiKey: z.string().default(''), // LM Studio does not need one
})
export type LLMSettings = z.infer<typeof LLMSettingsSchema>

export const DEFAULT_LLM: LLMSettings = {
  key: 'llm',
  provider: 'openai-compatible',
  baseUrl: 'http://localhost:1234/v1',
  model: '',
  apiKey: '',
}

// --- Job description intelligence (simplified Phase 1 spec) ---

export const JDSkillSchema = z.object({
  name: z.string().min(1),
  evidence: z.string().min(1), // verbatim snippet from the JD — a skill without evidence is dropped
})
export type JDSkill = z.infer<typeof JDSkillSchema>

export const JobSpecSchema = z.object({
  id: z.string(),
  jobCardId: z.string(),
  jdHash: z.string().optional(), // content hash of the JD this spec was extracted from
  requiredSkills: z.array(JDSkillSchema),
  preferredSkills: z.array(JDSkillSchema),
  domainTags: z.array(z.string()).default([]),
  promptVersion: z.string(),
  extractedAt: z.string(),
})
export type JobSpec = z.infer<typeof JobSpecSchema>

// --- Match analysis (score is computed by the app, never by the model) ---

export const SubScoresSchema = z.object({
  requiredCoverage: z.number().min(0).max(1),
  preferredCoverage: z.number().min(0).max(1),
  seniorityFit: z.number().min(0).max(1),
  domainFit: z.number().min(0).max(1),
  atsKeywordCoverage: z.number().min(0).max(1),
})
export type SubScores = z.infer<typeof SubScoresSchema>

export const MatchedSkillSchema = z.object({
  name: z.string(),
  resumeSnippet: z.string(), // what the resume actually says (evidence)
})
export type MatchedSkill = z.infer<typeof MatchedSkillSchema>

export const MissingSkillSchema = z.object({
  name: z.string(),
  jdEvidence: z.string(), // verbatim requirement from the JD
})
export type MissingSkill = z.infer<typeof MissingSkillSchema>

export const MatchAnalysisSchema = z.object({
  id: z.string(),
  jobCardId: z.string(),
  resumeVersionId: z.string().default(PROFILE_ID), // single version in Phase 1
  overallScore: z.number().int().min(0).max(100),
  subScores: SubScoresSchema,
  matched: z.array(MatchedSkillSchema),
  missingBlocking: z.array(MissingSkillSchema),
  missingCoverable: z.array(MissingSkillSchema).default([]), // adjacency triage deferred
  missingNiceToHave: z.array(MissingSkillSchema),
  atsGapKeywords: z.array(z.string()),
  modelUsed: z.string(),
  promptVersion: z.string(),
  createdAt: z.string(),
})
export type MatchAnalysis = z.infer<typeof MatchAnalysisSchema>

// --- Phase 2: copilot artifacts (generated copy stored on the card) ---

export const ARTIFACT_KINDS = [
  'coverLetter',
  'followUp',
  'dm',
  'intro',
  'screeningAnswer',
  'prep',
] as const

export const ArtifactKindSchema = z.enum(ARTIFACT_KINDS)
export type ArtifactKind = z.infer<typeof ArtifactKindSchema>

/**
 * Interview prep is the one artifact with structure: a plain string cannot express a
 * tickable question. `Artifact.content` still carries a plain-text rendering of this
 * plan so Copy works and the JSON backup stays readable.
 */
export const PrepPlanSchema = z.object({
  topics: z
    .array(
      z.object({
        topic: z.string().min(1),
        questions: z.array(z.string().min(1)),
      }),
    )
    .min(1),
})
export type PrepPlan = z.infer<typeof PrepPlanSchema>

export const ArtifactSchema = z.object({
  id: z.string(),
  jobCardId: z.string(),
  kind: ArtifactKindSchema,
  variant: z.string().optional(), // e.g. "day-3" for a follow-up in the sequence
  content: z.string().min(1),
  edited: z.boolean().default(false), // true once the user hand-edits generated copy
  modelUsed: z.string(),
  promptVersion: z.string(),
  createdAt: z.string(),
  /** Present only on kind 'prep'; the structured question plan. */
  prep: PrepPlanSchema.optional(),
  /** Keys ("<topicIndex>:<questionIndex>") of prep questions ticked as practised. */
  practised: z.array(z.string()).default([]),
})
export type Artifact = z.infer<typeof ArtifactSchema>

/** Shape the model must return for a single-block generation (cover letter, DM). */
export const ArtifactContentSchema = z.object({ content: z.string().min(1) })

/** Shape for the Day 1 → Day 5 outreach sequence, generated in one call. */
export const FollowUpSequenceSchema = z.object({
  day1: z.string().min(1),
  day2: z.string().min(1),
  day3: z.string().min(1),
  day4: z.string().min(1),
  day5: z.string().min(1),
})
export type FollowUpSequence = z.infer<typeof FollowUpSequenceSchema>

// --- Phase 3: resume library ---

export const ResumeSkillSchema = z.object({
  name: z.string().min(1),
  normalized: z.string().optional(),
  category: z.string().optional(),
  years: z.number().optional(),
  proficiency: z.string().optional(),
  evidence: z.array(z.string()).default([]), // verbatim resume lines proving the skill
})
export type ResumeSkill = z.infer<typeof ResumeSkillSchema>

export const ResumeRoleSchema = z.object({
  title: z.string().min(1),
  company: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  summary: z.string().optional(),
})
export type ResumeRole = z.infer<typeof ResumeRoleSchema>

export const ResumeEducationSchema = z.object({
  degree: z.string().min(1),
  institution: z.string().optional(),
  year: z.string().optional(),
})
export type ResumeEducation = z.infer<typeof ResumeEducationSchema>

export const ResumeCertificationSchema = z.object({
  name: z.string().min(1),
  issuer: z.string().optional(),
  year: z.string().optional(),
})
export type ResumeCertification = z.infer<typeof ResumeCertificationSchema>

/** Structured resume, extracted by the model; every skill carries its evidence line. */
export const ParsedResumeSchema = z.object({
  skills: z.array(ResumeSkillSchema).default([]),
  roles: z.array(ResumeRoleSchema).default([]),
  education: z.array(ResumeEducationSchema).default([]),
  certifications: z.array(ResumeCertificationSchema).default([]),
  totalYears: z.number().nullable().default(null),
})
export type ParsedResume = z.infer<typeof ParsedResumeSchema>

/**
 * ArrayBuffer check that survives a realm boundary. IndexedDB hands back buffers created
 * in another realm, where `instanceof ArrayBuffer` is false — so validate structurally.
 */
function isArrayBuffer(value: unknown): value is ArrayBuffer {
  return Object.prototype.toString.call(value) === '[object ArrayBuffer]'
}

/**
 * One uploaded resume file. Exactly one version is primary at a time (enforced in db.ts).
 * The file is stored as raw bytes plus its mime type rather than a Blob: IndexedDB clones
 * both, but bytes keep the value verifiable in tests and let us rebuild a Blob for download.
 */
export const ResumeVersionSchema = z.object({
  id: z.string(),
  label: z.string().min(1), // version tag, e.g. "QA_Resume_CGI_v2"
  notes: z.string().optional(),
  isPrimary: z.boolean().default(false),
  fileName: z.string(),
  fileData: z.custom<ArrayBuffer>(isArrayBuffer, { message: 'Expected file bytes' }),
  fileMimeType: z.string().default('application/octet-stream'),
  rawText: z.string(),
  parsed: ParsedResumeSchema.optional(), // absent when parsing failed or no model was configured
  parseError: z.string().optional(),
  modelUsed: z.string().optional(),
  promptVersion: z.string().optional(),
  createdAt: z.string(),
})
export type ResumeVersion = z.infer<typeof ResumeVersionSchema>

/** Backup shape: the file travels as base64 so a JSON backup stays self-contained. */
export const ResumeVersionExportSchema = ResumeVersionSchema.omit({ fileData: true }).extend({
  fileBase64: z.string(),
})
export type ResumeVersionExport = z.infer<typeof ResumeVersionExportSchema>

// --- Phase 4: interview rounds ---

export const INTERVIEW_FORMATS = ['phone', 'video', 'onsite', 'technical', 'hr', 'other'] as const
export const InterviewFormatSchema = z.enum(INTERVIEW_FORMATS)
export type InterviewFormat = z.infer<typeof InterviewFormatSchema>

export const INTERVIEW_OUTCOMES = ['pending', 'passed', 'failed', 'cancelled'] as const
export const InterviewOutcomeSchema = z.enum(INTERVIEW_OUTCOMES)
export type InterviewOutcome = z.infer<typeof InterviewOutcomeSchema>

export const INTERVIEW_FORMAT_LABELS: Record<InterviewFormat, string> = {
  phone: 'Phone',
  video: 'Video',
  onsite: 'On-site',
  technical: 'Technical',
  hr: 'HR',
  other: 'Other',
}

export const INTERVIEW_OUTCOME_LABELS: Record<InterviewOutcome, string> = {
  pending: 'Pending',
  passed: 'Passed',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

/**
 * One round of interviews for a job card. `round` is the display order and is assigned
 * on write (max existing + 1), so the user never types it. `scheduledAt` holds a
 * `datetime-local` value ("2026-09-20T14:30").
 */
export const InterviewRoundSchema = z.object({
  id: z.string(),
  jobCardId: z.string(),
  round: z.number().int().min(1),
  label: z.string().optional(), // e.g. "Technical screen"
  scheduledAt: z.string(),
  durationMins: z.number().int().positive().optional(),
  interviewer: z.string().optional(),
  format: InterviewFormatSchema.default('video'),
  outcome: InterviewOutcomeSchema.default('pending'),
  notes: z.string().optional(),
  createdAt: z.string(),
})
export type InterviewRound = z.infer<typeof InterviewRoundSchema>

/** Form payload: identity, ordering and job link are assigned on write. */
export const InterviewRoundFormSchema = InterviewRoundSchema.omit({
  id: true,
  jobCardId: true,
  round: true,
  createdAt: true,
}).extend({
  scheduledAt: z.string().min(1, 'Date and time are required'),
})
export type InterviewRoundForm = z.infer<typeof InterviewRoundFormSchema>

export const EMPTY_ROUND_FORM: InterviewRoundForm = {
  label: '',
  scheduledAt: '',
  durationMins: undefined,
  interviewer: '',
  format: 'video',
  outcome: 'pending',
  notes: '',
}
