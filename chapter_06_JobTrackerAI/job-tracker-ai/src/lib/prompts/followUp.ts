import { COMPANY_FACTS_CLAUSE, GROUNDING_CLAUSE, JSON_ONLY_RULE } from './grounding'
import { contextBlock, type GenerationContext } from './context'

export const FOLLOWUP_PROMPT_VERSION = 'followup-v3'

/**
 * The five-email outreach sequence (Day 1 → Day 5), mirroring the
 * job-application-package skill's cold-email cadence.
 */
export const FOLLOWUP_DAYS = [1, 2, 3, 4, 5] as const
export type FollowUpDay = (typeof FOLLOWUP_DAYS)[number]

export const FOLLOWUP_VARIANTS: Record<FollowUpDay, string> = {
  1: 'day-1',
  2: 'day-2',
  3: 'day-3',
  4: 'day-4',
  5: 'day-5',
}

/** One line per email, matching the skill's five-part structure. */
export const FOLLOWUP_THEMES: Record<FollowUpDay, string> = {
  1: 'Introduction & expression of interest',
  2: 'Relevant experience',
  3: 'Skills & achievements',
  4: 'Values & culture fit',
  5: 'Closing & call to action',
}

export function followUpPrompt(ctx: GenerationContext): string {
  return [
    'You write a five-email cold outreach sequence to HR / a recruiter about one specific role, sent on consecutive days (Day 1 through Day 5).',
    'Return JSON with exactly this shape:',
    '{ "day1": "email text", "day2": "email text", "day3": "email text", "day4": "email text", "day5": "email text" }',
    '',
    'Rules:',
    '- Each email is 120-180 words of plain text: a subject line on the first line, then a blank line, then the body. No markdown.',
    '- Give every email a DIFFERENT subject line and a different opening sentence, so the sequence never reads as one template copy-pasted five times.',
    '- Day 1 — Introduction & expression of interest: who the candidate is, the role and company by name, one sentence on fit, genuine enthusiasm.',
    '- Day 2 — Relevant experience: one or two concrete resume experiences that map most directly to the JD responsibilities.',
    '- Day 3 — Skills & achievements: two or three specific skills or quantified achievements from the resume against the JD must-haves.',
    '- Day 4 — Values & culture fit: reference company values or culture ONLY if the job description or notes state them; otherwise explain why the role and domain attract the candidate and how they would contribute.',
    '- Day 5 — Closing & call to action: brief recap, restated interest, and a clear low-pressure ask (a short call, or forwarding the resume to the right hiring manager).',
    '- Draw on the same strongest evidence the cover letter would use, so the letter and the emails tell one consistent story.',
    '- Never guilt-trip, never demand a timeline, never claim the job description mentions something it does not.',
    '- Sign off with the candidate name when it is known.',
    `- ${GROUNDING_CLAUSE}`,
    `- ${COMPANY_FACTS_CLAUSE}`,
    JSON_ONLY_RULE,
    '',
    ...contextBlock(ctx),
  ].join('\n')
}
