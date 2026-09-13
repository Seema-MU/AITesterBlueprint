import { COMPANY_FACTS_CLAUSE, GROUNDING_CLAUSE, JSON_ONLY_RULE } from './grounding'
import { contextBlock, type GenerationContext } from './context'

export const PREP_PROMPT_VERSION = 'prep-v1'

/**
 * Output budget, kept modest on purpose. Small Groq organisations carry an
 * output-tokens-per-minute cap (1000 in the reported case) and an oversized request is
 * refused outright rather than truncated, so the topic and question counts below are
 * sized to fit that ceiling rather than to be as thorough as possible.
 */
export const PREP_MAX_TOKENS = 900

export function prepPrompt(ctx: GenerationContext): string {
  return [
    'You prepare a candidate for an interview for one specific role at one specific company.',
    'Return JSON with exactly this shape:',
    '{ "topics": [{ "topic": "topic name", "questions": ["question", "question"] }] }',
    '',
    'Produce 3-5 topics, each with 3-4 questions. Group questions by theme, not by difficulty.',
    '',
    'Choose topics from the job description\'s actual requirement areas — for example its named',
    'technologies, its testing or delivery practices, and its domain — plus one topic of behavioural',
    'questions drawn from the experience the resume actually states. Name each topic after the thing',
    'being probed, not after the question type.',
    '',
    'Rules:',
    '- Every question must trace to something the job description states or the resume evidences. If you cannot tie a question to either, drop it.',
    '- The candidate must be able to answer from the resume and the job description alone. Never require knowledge that appears in neither.',
    '- Where the job description names a requirement the resume does not evidence, it is fair to ask how the candidate would approach it — phrase it as a hypothetical or a learning question, never as though the candidate has that experience.',
    '- Ask questions an interviewer would actually ask: specific and open. Never "tell me about yourself", never soft filler, never trivia unrelated to the role.',
    '- Name the real technologies, practices and domain the job description mentions, so the questions are clearly about this role and not a generic set.',
    '- Do not supply answers, notes or commentary — only the topic names and the questions.',
    `- ${GROUNDING_CLAUSE}`,
    `- ${COMPANY_FACTS_CLAUSE}`,
    JSON_ONLY_RULE,
    '',
    ...contextBlock(ctx),
  ].join('\n')
}
