/** Inputs every Phase 2 generator grounds on. Nothing outside this context may be used. */
export interface GenerationContext {
  name?: string
  headline?: string
  resumeText: string
  company: string
  role: string
  jdText: string
  notes?: string
}

/** Renders the shared source block appended to every generation prompt. */
export function contextBlock(ctx: GenerationContext): string[] {
  return [
    '<candidate_profile>',
    `Name: ${ctx.name?.trim() || '(not provided)'}`,
    `Headline: ${ctx.headline?.trim() || '(not provided)'}`,
    '</candidate_profile>',
    '',
    '<resume>',
    ctx.resumeText,
    '</resume>',
    '',
    '<job>',
    `Company: ${ctx.company}`,
    `Role: ${ctx.role}`,
    '</job>',
    '',
    '<job_description>',
    ctx.jdText,
    '</job_description>',
    ...(ctx.notes?.trim() ? ['', '<notes>', ctx.notes, '</notes>'] : []),
  ]
}
