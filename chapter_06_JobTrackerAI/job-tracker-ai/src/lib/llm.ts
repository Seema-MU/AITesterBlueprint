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
 * Providers cap output tokens (Groq on-demand: 1000 OTPM). When a 429 tells us the
 * request is too large, we retry once with a smaller budget instead of failing the
 * feature — some providers simply refuse any request above the cap.
 */
const OUTPUT_LIMIT_PATTERN = /reduce max_tokens|request too large|exceed the enforced limit|\bOTPM\b/i

function isOutputLimitError(error: unknown): error is LlmError {
  return error instanceof LlmError && OUTPUT_LIMIT_PATTERN.test(error.message)
}

/** Reads the provider's stated limit out of its error, else halves the current budget. */
function reducedOutputBudget(error: LlmError, current: number): number | null {
  const stated = Number(/\blimit\s+(\d+)/i.exec(error.message)?.[1])
  const target =
    Number.isFinite(stated) && stated > 0 ? Math.floor(stated * 0.9) : Math.floor(current / 2)
  const reduced = Math.max(256, target)
  return reduced < current ? reduced : null
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
    throw new LlmError(
      `Model server returned ${response.status}${detail ? `: ${detail}` : ''} ${describeStatus(response.status)}`,
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
  } catch (error) {
    const reduced = isOutputLimitError(error) ? reducedOutputBudget(error, budget) : null
    if (reduced === null) throw error
    // The retry runs with a smaller ceiling; a truncated response still fails
    // validation and surfaces as an explicit error rather than invented data.
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
