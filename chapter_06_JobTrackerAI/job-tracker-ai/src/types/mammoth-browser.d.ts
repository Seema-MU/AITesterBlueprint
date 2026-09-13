/**
 * Ambient types for mammoth's prebuilt browser bundle.
 *
 * `import 'mammoth'` resolves to lib/main.js, which requires node's `fs`/`path`,
 * so the browser build must load `mammoth.browser.js` instead. That path ships no
 * types (the package's own `lib/index.d.ts` uses `export =`), so we declare the
 * small surface we actually use.
 */
declare module 'mammoth/mammoth.browser.js' {
  export interface MammothMessage {
    type: string
    message: string
  }

  export interface MammothResult {
    value: string
    messages: MammothMessage[]
  }

  export interface MammothInput {
    arrayBuffer: ArrayBuffer
  }

  export function convertToHtml(input: MammothInput): Promise<MammothResult>
  export function extractRawText(input: MammothInput): Promise<MammothResult>

  const mammoth: {
    convertToHtml: typeof convertToHtml
    extractRawText: typeof extractRawText
  }
  export default mammoth
}
