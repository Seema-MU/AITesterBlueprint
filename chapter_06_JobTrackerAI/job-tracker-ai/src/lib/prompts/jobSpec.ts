import { JSON_ONLY_RULE } from './grounding'

export const SPEC_PROMPT_VERSION = 'spec-v3'

export function jobSpecPrompt(jdText: string): string {
  return [
    "You are an expert technical recruiter. Extract the skills a candidate MUST have and SHOULD ideally have from the job description below.",
    'Return JSON with exactly this shape:',
    '{',
    '  "requiredSkills": [{ "name": "skill name", "evidence": "verbatim snippet from the JD proving it is required" }],',
    '  "preferredSkills": [{ "name": "skill name", "evidence": "verbatim snippet from the JD proving it is preferred or a plus" }],',
    '  "domainTags": ["domain keyword explicitly stated in the JD, e.g. retail, e-commerce, banking"]',
    '}',
    '',
    'Rules:',
    '- "required" means the JD states it as mandatory/required/must have/minimum N years.',
    '- "preferred" means nice-to-have, preferred, exposure to, or listed only as a plus.',
    '- Use the exact skill phrasing from the JD (e.g. "Playwright", "TypeScript").',
    '- A skill name is a SHORT noun phrase (a technology, tool, framework, or testing area) of at most 5 words.',
    '- When a requirement lists alternatives with "or" (e.g. "Cursor AI or AI-assisted tools (GitHub Copilot, Claude Code, Windsurf)" or "Git, Azure DevOps, or GitHub"), list EACH named alternative as its own skill entry with the same evidence snippet.',
    '- NEVER return whole responsibilities, qualities, or soft skills ("designing scalable test approaches", "leadership skills", "ability to own decisions", years-of-experience statements).',
    '- Evidence must be a short verbatim quote (3-12 words) from the JD text. A skill with no evidence snippet is dropped — never guess.',
    '- domainTags: only tags explicitly present in the JD. Empty array if none.',
    JSON_ONLY_RULE,
    '',
    '<job_description>',
    jdText,
    '</job_description>',
  ].join('\n')
}
