import { COMPANY_FACTS_CLAUSE, GROUNDING_CLAUSE, JSON_ONLY_RULE } from './grounding'
import { contextBlock, type GenerationContext } from './context'

export const DM_PROMPT_VERSION = 'dm-v2'

/** Hard ceiling for a recruiter DM. Enforced in the generator, not just the prompt. */
export const DM_MAX_CHARS = 300

export function dmPrompt(ctx: GenerationContext): string {
  return [
    'You write a short direct message to a recruiter or hiring manager on a professional network.',
    'Return JSON with exactly this shape:',
    '{ "content": "the message text" }',
    '',
    'Rules:',
    `- The message MUST be under ${DM_MAX_CHARS} characters, including spaces. Count before answering.`,
    '- One short greeting, one sentence on who the candidate is, one on the role applied for, one on the single strongest relevant skill, then a light ask.',
    '- Plain text only. No subject line, no markdown, no hashtags, no emoji.',
    '- Do not invent a recruiter name; greet generically when the notes do not supply one.',
    `- ${GROUNDING_CLAUSE}`,
    `- ${COMPANY_FACTS_CLAUSE}`,
    JSON_ONLY_RULE,
    '',
    ...contextBlock(ctx),
  ].join('\n')
}
