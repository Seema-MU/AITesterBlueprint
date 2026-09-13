import { describe, expect, it } from 'vitest'
import {
  RESUME_ACCEPT,
  ResumeFileError,
  extractResumeText,
  htmlToText,
  isSupportedResumeFile,
} from './resumeFile'

describe('isSupportedResumeFile', () => {
  it('accepts .pdf and .docx, case-insensitively', () => {
    expect(isSupportedResumeFile({ name: 'QA_Resume.pdf' })).toBe(true)
    expect(isSupportedResumeFile({ name: 'QA_Resume.DOCX' })).toBe(true)
  })

  it('rejects anything else', () => {
    expect(isSupportedResumeFile({ name: 'notes.txt' })).toBe(false)
    expect(isSupportedResumeFile({ name: 'resume.doc' })).toBe(false)
    expect(isSupportedResumeFile({ name: 'pdf' })).toBe(false)
  })

  it('exposes the accept string used by the file input', () => {
    expect(RESUME_ACCEPT).toBe('.pdf,.docx')
  })
})

describe('htmlToText', () => {
  it('splits paragraphs onto their own lines', () => {
    expect(htmlToText('<p>First line</p><p>Second line</p>')).toBe('First line\nSecond line')
  })

  it('keeps heading text and converts <br> to a line break', () => {
    expect(htmlToText('<h1>QA Engineer</h1><p>x<br/>y</p>')).toBe('QA Engineer\nx\ny')
  })

  it('renders list items as bullets without double spacing', () => {
    expect(htmlToText('<ul><li>Playwright</li><li>Cypress</li></ul>')).toBe(
      '• Playwright\n• Cypress',
    )
  })

  it('decodes HTML entities', () => {
    expect(htmlToText('<p>QA &amp; SDET &lt;13+ yrs&gt; &quot;senior&quot;</p>')).toBe(
      'QA & SDET <13+ yrs> "senior"',
    )
    expect(htmlToText('<p>a&#39;b&#x2014;c</p>')).toBe("a'b—c")
  })

  it('collapses runs of blank lines and stray whitespace', () => {
    expect(htmlToText('<p>  spaced   out  </p><p></p><p></p><p>end</p>')).toBe('spaced out\nend')
  })

  it('returns an empty string for empty markup', () => {
    expect(htmlToText('<p></p>')).toBe('')
  })
})

describe('extractResumeText', () => {
  it('rejects an unsupported extension before reading the file', async () => {
    const file = new File(['plain text'], 'resume.txt', { type: 'text/plain' })
    await expect(extractResumeText(file)).rejects.toBeInstanceOf(ResumeFileError)
    await expect(extractResumeText(file)).rejects.toThrow(/Only \.pdf and \.docx/)
  })
})

describe('mammoth browser bundle interop', () => {
  it('resolves convertToHtml through the module default', async () => {
    // Guards the UMD/CJS interop: `import mammoth from '…'` must expose the API.
    const mod = await import('mammoth/mammoth.browser.js')
    const mammoth = mod.default ?? mod
    expect(typeof mammoth.convertToHtml).toBe('function')
  })
})
