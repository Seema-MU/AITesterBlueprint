import { describe, expect, it } from 'vitest'
import { LlmError, reducedOutputBudget, retryDelayMs } from './llm'

/** The real 429 Groq returned for a small org on a 1000 OTPM cap. */
function otpmError(limit: number, used: number, requested: number): LlmError {
  return new LlmError(
    'Model server returned 429: {"error":{"message":"Rate limit reached for model ' +
      `\`qwen/qwen3.8-27b\` in organization \`org_x\` service tier \`on_demand\` on output tokens ` +
      `per minute (OTPM): Limit ${limit}, Used ${used}, Requested ${requested}. ` +
      'Please try again in 21.119999999s. Need more tokens? Upgrade to Dev Tier today at https://…"}} ' +
      'The provider is rate-limiting or capping output size — retry shortly.',
  )
}

describe('reducedOutputBudget', () => {
  it('sizes the retry from what is left in the window, not from the ceiling', () => {
    // 1000 - 452 = 548 available, so the retry must ask for well under 900.
    // The old behaviour used 1000 x 0.9 = 900 and 429'd a second time.
    expect(reducedOutputBudget(otpmError(1000, 452, 900), 900)).toBe(493)
  })

  it('reduces a request that was itself larger than the whole cap', () => {
    // Prep used to ask for 1800 against a 1000 cap — impossible before it was even sent.
    expect(reducedOutputBudget(otpmError(1000, 452, 1800), 1800)).toBe(493)
  })

  it('returns null when too little is left for any useful answer', () => {
    // Retrying here would be a second guaranteed 429 rather than a recovery.
    expect(reducedOutputBudget(otpmError(1000, 980, 900), 900)).toBeNull()
  })

  it('returns null when the request already fits the stated ceiling', () => {
    expect(reducedOutputBudget(otpmError(1000, 0, 900), 900)).toBeNull()
  })

  it('ignores a "used" figure that is absent', () => {
    expect(reducedOutputBudget(new LlmError('Limit 1000 exceeded'), 1800)).toBe(900)
  })

  it('halves when the message carries no numbers to reason about', () => {
    expect(reducedOutputBudget(new LlmError('request too large'), 1800)).toBe(900)
  })

  it('returns null when even halving cannot shrink the budget', () => {
    expect(reducedOutputBudget(new LlmError('request too large'), 256)).toBeNull()
  })
})

describe('retryDelayMs', () => {
  it('reads the delay out of the provider message', () => {
    const ms = retryDelayMs(otpmError(1000, 452, 900))
    expect(ms).toBeGreaterThan(21_000)
    expect(ms).toBeLessThanOrEqual(21_200)
  })

  it('accepts a retry-after style hint', () => {
    expect(retryDelayMs(new LlmError('429 - retry-after: 5'))).toBe(5000)
  })

  it('is capped so a long cooldown cannot look like a hung UI', () => {
    expect(retryDelayMs(new LlmError('Please try again in 600s'))).toBe(30_000)
  })

  it('is zero when the provider gave no delay', () => {
    expect(retryDelayMs(new LlmError('reduce max_tokens'))).toBe(0)
  })
})
