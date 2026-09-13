import { z } from 'zod'
import type { LLMSettings } from './schema'

/** Browser-direct BYOK client for OpenAI-compatible chat endpoints (LM Studio, OpenAI, others). */

export class LlmError extends Error {}

/**
 * Resolves the API root for a configured base URL.
 * - LM Studio (localhost/127.0.0.1): tunnelled through `/lmstudio` — the local
 *   server sends no CORS headers, so same-origin proxying is required.
 * - Everything else (Groq, OpenAI, …): called directly from the browser. Groq
 *   sends `access-control-allow-origin: *` and would 403-1010 our proxy anyway
 *   (Cloudflare blocks non-browser fingerprints).
 */
function apiRoot(settings: LLMSettings): string {
  const base = settings.baseUrl.replace(/\/+$/, '')
  if (typeof window === 'undefined') return base
  const hostname = new URL(base).hostname
  if (/^(localhost|127\.0\.0\.1)$/i.test(hostname)) {
    return `${window.location.origin}/lmstudio`
  }
  return base
}

interface ChatJsonOptions {
  temperature?: number
  /** Output cap; keeps requests under provider per-request/per-minute token limits. */
  maxTokens?: number
}

interface ChatResult<T> {
  data: T
  modelUsed: string
}

/**
 * Tries hard to turn model output into a JS value. Small models wrap JSON in
 * prose or fences; we attempt (1) fence-stripped parse, (2) extracting the
 * first balanced {...} block, (3) plain parse. Returns null when nothing works
 * so the caller can retry once instead of failing immediately.
 */
function extractJson(content: string): unknown | null {
  const candidates: string[] = []
  const stripped = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim()
  candidates.push(stripped)

  const firstBrace = stripped.indexOf('{')
  const lastBrace = stripped.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(stripped.slice(firstBrace, lastBrace + 1))
  }
  candidates.push(content.trim())

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as unknown
    } catch {
      // try the next candidate
    }
  }
  return null
}

/**
 * Providers cap output tokens (Groq on-demand orgs get an output-tokens-per-minute
 * ceiling, e.g. 1000 OTPM). When a 429 tells us the request is too large, we retry
 * once with a smaller budget instead of failing the feature — some providers simply
 * refuse any request above the cap.
 */
const OUTPUT_LIMIT_PATTERN = /reduce max_tokens|request too large|exceed the enforced limit|\bOTPM\b/i

function isOutputLimitError(error: unknown): error is LlmError {
  return error instanceof LlmError && OUTPUT_LIMIT_PATTERN.test(error.message)
}

/** Below this an answer would be truncated anyway, so a retry is not worth attempting. */
const MIN_OUTPUT_BUDGET = 256
/** Never block the UI longer than this, even if the provider asks for more. */
const MAX_RETRY_WAIT_MS = 30_000

/**
 * Sizes the retry from the provider's *remaining* budget, not just its ceiling.
 *
 * Groq reports the whole picture in the 429 — "Limit 1000, Used 452, Requested 900" —
 * and an OTPM cap is often smaller than a single large request. Using the limit alone
 * (1000 × 0.9 = 900) asks for more than is actually left, so the retry 429s again and
 * the feature fails for no reason. Returning null means "no smaller request would fit",
 * which is a real condition and should surface the provider's own message.
 */
export function reducedOutputBudget(error: LlmError, current: number): number | null {
  const text = error.message
  const statedLimit = Number(/\blimit\s+(\d+)/i.exec(text)?.[1])
  const statedUsed = Number(/\bused\s+(\d+)/i.exec(text)?.[1])
  const hasCeiling = Number.isFinite(statedLimit) && statedLimit > 0

  const affordable = hasCeiling
    ? Math.floor(
        (statedLimit - (Number.isFinite(statedUsed) && statedUsed >= 0 ? statedUsed : 0)) * 0.9,
      )
    : // No ceiling to reason about, so halve — a guess, but a decisive one.
      Math.max(MIN_OUTPUT_BUDGET, Math.floor(current / 2))

  // Below the floor nothing useful would come back, and a retry that is not actually
  // smaller than the failed request would just hit the same cap again.
  if (affordable < MIN_OUTPUT_BUDGET) return null
  return affordable < current ? affordable : null
}

/**
 * How long the provider asked us to wait before retrying ("Please try again in 21.1s",
 * or a `retry-after` header). An OTPM window is a rolling minute, so retrying instantly
 * is guaranteed to fail again until it resets. Capped so a long cooldown surfaces as an
 * error the user can act on rather than a UI that merely looks hung.
 */
export function retryDelayMs(error: LlmError): number {
  const match = /(?:try again in|retry[- ]after:?)\s*([\d.]+)\s*(?:s\b|sec|second)?/i.exec(
    error.message,
  )
  const seconds = Number(match?.[1])
  if (!Number.isFinite(seconds) || seconds <= 0) return 0
  return Math.min(Math.ceil(seconds * 1000), MAX_RETRY_WAIT_MS)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function describeStatus(status: number): string {
  if (status === 429) return 'The provider is rate-limiting or capping output size — retry shortly.'
  if (status === 401 || status === 403) return 'Check your API key in Settings.'
  if (status === 404) return 'Check the model name in Settings.'
  if (status >= 500) return 'The provider reported a server error — retry in a moment.'
  return 'Check the endpoint, model name and key in Settings.'
}

async function chatOnce(
  settings: LLMSettings,
  messages: { role: 'system' | 'user'; content: string }[],
  options: ChatJsonOptions,
  isRetry = false,
): Promise<ChatResult<unknown>> {
  const base = apiRoot(settings)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`

  let response: Response
  try {
    response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: settings.model || undefined,
        messages,
        temperature: options.temperature ?? 0.1,
        max_tokens: options.maxTokens ?? 900,
        // No response_format: LM Studio (and some OpenAI-compatible servers) reject
        // json_object and only accept json_schema/text. The prompts demand JSON-only
        // and the parser extracts JSON + retries once on validation failure.
        stream: false,
      }),
    })
  } catch (cause) {
    throw new LlmError(
      `Could not reach ${base}. Is the local model server running? (${(cause as Error).message})`,
      { cause },
    )
  }

  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 300)
    // A 429 carries `retry-after` in seconds (Groq documents this). It is more reliable
    // than scraping the human-readable message, which may only say "try again in 21s".
    const retryAfter = response.headers.get('retry-after')
    const hint = retryAfter ? ` (retry-after: ${retryAfter})` : ''
    throw new LlmError(
      `Model server returned ${response.status}${detail ? `: ${detail}` : ''}${hint} ${describeStatus(response.status)}`,
    )
  }

  const body = (await response.json()) as {
    model?: string
    choices?: {
      finish_reason?: string
      message?: { content?: string; role?: string; tool_calls?: unknown }
    }[]
  }
  const choice = body.choices?.[0]
  const content = choice?.message?.content
  const modelName = body.model || settings.model || 'unknown'
  if (!content || content.trim() === '') {
    // Transient empty completions happen with some small/local models. Retry once,
    // then report precisely which model/endpoint produced nothing.
    if (!isRetry) return chatOnce(settings, messages, options, true)
    throw new LlmError(
      `Model "${modelName}" returned an empty completion (finish_reason: ${choice?.finish_reason ?? 'unknown'}). ` +
        'If this is your local LM Studio model, load a stronger model; if it is a cloud model, check the model name in Settings.',
    )
  }
  return { data: extractJson(content), modelUsed: modelName }
}

/**
 * Complete a structured JSON call against an OpenAI-compatible endpoint.
 * On schema-validation failure it retries once with the validation error
 * appended to the prompt, then throws — never silently falls back to invented data.
 * A "request too large" rejection is retried once with a reduced output budget.
 */
export async function completeJson<T>(
  settings: LLMSettings,
  systemPrompt: string,
  userPrompt: string,
  schema: z.ZodType<T>,
  options: ChatJsonOptions = {},
): Promise<{ data: T; modelUsed: string }> {
  const system = settings.model
    ? `You are an assistant using model ${settings.model}. ${systemPrompt}`
    : systemPrompt

  const flow = async (maxTokens: number): Promise<{ data: T; modelUsed: string }> => {
    const attempt = async (extra: string | null): Promise<ChatResult<unknown>> => {
      const user = extra ? `${userPrompt}\n\nYour previous response failed validation: ${extra}\nReturn corrected JSON.` : userPrompt
      return chatOnce(
        settings,
        [{ role: 'system', content: system }, { role: 'user', content: user }],
        { ...options, maxTokens },
      )
    }

    const first = await attempt(null)
    if (first.data === null) {
      const second = await attempt(
        'Your response was not valid JSON. Reply with a single JSON object only — no prose, no markdown fences, nothing before or after the braces.',
      )
      if (second.data !== null && schema.safeParse(second.data).success) {
        return { data: schema.parse(second.data), modelUsed: second.modelUsed }
      }
      throw new LlmError(
        `Model "${second.modelUsed}" did not return valid JSON after a retry. Try a stronger model or check the configured model in Settings.`,
      )
    }

    const parsed = schema.safeParse(first.data)
    if (parsed.success) return { data: parsed.data, modelUsed: first.modelUsed }

    const message = parsed.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
      .join('; ')
    const second = await attempt(message)
    const repaired = schema.safeParse(second.data)
    if (repaired.success) return { data: repaired.data, modelUsed: second.modelUsed }

    throw new LlmError(
      `The model's response could not be validated after a retry: ${repaired.error.issues[0]?.message ?? 'invalid shape'}`,
    )
  }

  const budget = options.maxTokens ?? 900
  try {
    return await flow(budget)
  } catch (caught) {
    if (!isOutputLimitError(caught)) throw caught
    const reduced = reducedOutputBudget(caught, budget)
    if (reduced === null) throw caught
    // Wait out the window the provider named, otherwise the retry just hits the same
    // per-minute cap. The retry then runs with a smaller ceiling; a truncated response
    // still fails validation and surfaces as an explicit error rather than invented data.
    const waitMs = retryDelayMs(caught)
    if (waitMs > 0) await sleep(waitMs)
    return flow(reduced)
  }
}

/** GET /models — used by the Settings "test connection" button. */
export async function listModels(settings: LLMSettings): Promise<string[]> {
  const base = apiRoot(settings)
  const headers: Record<string, string> = {}
  if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`

  let response: Response
  try {
    response = await fetch(`${base}/models`, { headers })
  } catch (cause) {
    throw new LlmError(
      `Could not reach ${base}. Is the local model server running? (${(cause as Error).message})`,
      { cause },
    )
  }
  if (!response.ok) {
    throw new LlmError(`Model server returned ${response.status} on GET /models.`)
  }
  const body = (await response.json()) as { data?: { id?: string }[] }
  return (body.data ?? []).map((m) => m.id ?? '').filter(Boolean)
}
