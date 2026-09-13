import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

/** Client-side resume text extraction. Nothing leaves the browser here. */

export class ResumeFileError extends Error {}

export const RESUME_ACCEPT = '.pdf,.docx'

export function isSupportedResumeFile(file: { name: string }): boolean {
  return /\.(pdf|docx)$/i.test(file.name)
}

function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    // Resumes are read line-by-line by the model, so blank lines are just noise.
    .replace(/\n{2,}/g, '\n')
    .trim()
}

function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  }
  return text.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith('#')) {
      const hex = entity[1]?.toLowerCase() === 'x'
      const code = hex ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    return named[entity.toLowerCase()] ?? match
  })
}

/** Turns mammoth's HTML into readable plain text, keeping paragraph and bullet structure. */
export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n• ')
    .replace(/<\s*\/\s*(p|div|ul|ol|h[1-6]|tr)\s*>/gi, '\n')
  return normalizeText(decodeEntities(withBreaks.replace(/<[^>]+>/g, '')))
}

async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() })
  const doc = await loadingTask.promise
  try {
    const pages: string[] = []
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber)
      const content = await page.getTextContent()
      pages.push(
        content.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ')
          .trim(),
      )
    }
    return normalizeText(pages.filter(Boolean).join('\n'))
  } finally {
    // The loading task owns teardown; the document proxy has no destroy().
    await loadingTask.destroy()
  }
}

async function extractDocxText(file: File): Promise<string> {
  const { default: mammoth } = await import('mammoth/mammoth.browser.js')
  const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() })
  return htmlToText(value)
}

/** Extracts plain text from a .pdf or .docx resume entirely in the browser. */
export async function extractResumeText(file: File): Promise<string> {
  if (!isSupportedResumeFile(file)) {
    throw new ResumeFileError('Only .pdf and .docx resumes are supported.')
  }
  const lower = file.name.toLowerCase()
  const text = lower.endsWith('.pdf') ? await extractPdfText(file) : await extractDocxText(file)
  if (!text.trim()) {
    throw new ResumeFileError(
      `No text could be read from "${file.name}". A scanned/image-only PDF has no selectable text — export a text version instead.`,
    )
  }
  return text
}
