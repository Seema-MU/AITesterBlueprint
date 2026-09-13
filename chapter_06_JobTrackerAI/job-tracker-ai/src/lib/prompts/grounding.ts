/**
 * Shared prompt fragments. The grounding clauses are embedded verbatim in every
 * generation prompt (v3 §4 + the job-application-package skill's guardrails).
 */

export const GROUNDING_CLAUSE =
  'Use only facts present in the supplied profile and resume. If a claim cannot be supported by the supplied text, omit it. Never invent employers, dates, metrics, or certifications. Where a metric would strengthen the text but is absent from the source, insert the literal placeholder [ADD METRIC].'

/**
 * The skill's company guardrail. The resume clause above says nothing about the
 * employer, so Day 4 ("culture fit") and the cover letter need this separately —
 * otherwise a model happily invents company values, awards or news.
 */
export const COMPANY_FACTS_CLAUSE =
  'Never state anything about the company that is not present in the job description or the supplied notes — no culture, values, awards, news, products, history or headcount. If the job description does not state company values or culture, do not invent them: write about why the role and its domain attract the candidate instead.'

export const JSON_ONLY_RULE =
  'Respond with a single JSON object only. No prose, no markdown fences, no code blocks.'
