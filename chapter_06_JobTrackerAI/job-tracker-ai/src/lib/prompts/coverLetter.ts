import { COMPANY_FACTS_CLAUSE, GROUNDING_CLAUSE, JSON_ONLY_RULE } from './grounding'
import { contextBlock, type GenerationContext } from './context'

export const COVER_LETTER_PROMPT_VERSION = 'cover-letter-v2'

export function coverLetterPrompt(ctx: GenerationContext): string {
  return [
    'You write a concise, formal, one-page cover letter for a single job application.',
    'Return JSON with exactly this shape:',
    '{ "content": "the complete cover letter as plain text; separate paragraphs with a blank line" }',
    '',
    'Follow this structure:',
    '1. Professional greeting. Use "Dear Hiring Manager," unless the notes name a real contact.',
    '2. Introduction: who the candidate is, and why this role at this company specifically.',
    '3. Body: previous experience and skills mapped to the requirements the job description actually lists, with specific examples.',
    '4. One or two significant, quantified achievements relevant to this role — use the real numbers from the resume, never an invented one.',
    '5. Alignment with the company\'s values or culture ONLY if the job description or notes state them; otherwise write about genuine alignment with the role and its domain.',
    '6. Strong closing: eagerness for an interview and thanks for the reader\'s consideration.',
    '',
    'Rules:',
    '- 250-350 words — one page. Formal but human. No filler openers such as "I am writing to express my interest".',
    '- Name the company and the role. Address the reader directly.',
    '- Where the job description names a required skill that the resume evidences, call it out explicitly.',
    '- If the resume does not evidence something, do not mention it. Write around the gap.',
    `- ${GROUNDING_CLAUSE}`,
    `- ${COMPANY_FACTS_CLAUSE}`,
    JSON_ONLY_RULE,
    '',
    ...contextBlock(ctx),
  ].join('\n')
}
