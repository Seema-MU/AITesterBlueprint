import { JSON_ONLY_RULE } from './grounding'

export const RESUME_PARSE_PROMPT_VERSION = 'resume-parse-v1'

/**
 * Extraction prompt (temperature 0.1), so — like the JD spec prompt — it does not
 * carry the generative grounding clause. Instead every skill must cite a verbatim
 * resume line, and anything unsupported is omitted rather than placeholdered.
 */
export function resumeParsePrompt(resumeText: string): string {
  return [
    'You extract a structured candidate profile from a resume.',
    'Return JSON with exactly this shape:',
    '{',
    '  "skills": [{ "name": "skill", "category": "language|framework|tool|testing|cloud|domain|soft", "years": 3, "proficiency": "expert|advanced|intermediate|beginner", "evidence": ["verbatim line copied from the resume"] }],',
    '  "roles": [{ "title": "...", "company": "...", "start": "...", "end": "...", "summary": "one line" }],',
    '  "education": [{ "degree": "...", "institution": "...", "year": "..." }],',
    '  "certifications": [{ "name": "...", "issuer": "...", "year": "..." }],',
    '  "totalYears": 13',
    '}',
    '',
    'Rules:',
    '- Extract ONLY what the resume states. A skill you cannot tie to a resume line must be omitted.',
    '- Every skill MUST carry at least one evidence entry: a short verbatim line or clause copied from the resume.',
    '- "years" only when the resume states a duration for that skill; otherwise omit the field entirely — never guess.',
    '- "proficiency" only when the resume states or clearly implies it (e.g. "expert", "advanced"); otherwise omit it.',
    '- "category" is the single best fit from the allowed list.',
    '- "totalYears": total professional experience in years, only if the resume supports it; otherwise null.',
    '- Never invent employers, job titles, dates, degrees, certifications, metrics or technologies.',
    '- Return empty arrays where the resume has nothing to say; do not pad them.',
    JSON_ONLY_RULE,
    '',
    '<resume>',
    resumeText,
    '</resume>',
  ].join('\n')
}
