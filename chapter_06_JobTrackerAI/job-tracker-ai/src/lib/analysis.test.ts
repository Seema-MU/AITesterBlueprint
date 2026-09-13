import { describe, expect, it } from 'vitest'
import { computeMatch } from './analysis'
import type { JobSpec } from './schema'
import { canonicalSkill, normalizeSkill } from './config'

const resume = `SEEMA M U — Senior QA Automation Engineer
13+ years in software testing and automation across retail and e-commerce.
Automation: Cypress, Selenium, Playwright (pilot). API testing via Cypress.
Languages: JavaScript, TypeScript. CI/CD: Jenkins. Git, GitHub.
Cloud: AWS, Azure, Google Cloud. Docker, Kubernetes. SQL, MySQL, Oracle.
Agile ceremonies, code reviews, mentoring. ISTQB Certified.`

function spec(overrides: Partial<JobSpec> = {}): JobSpec {
  return {
    id: 's',
    jobCardId: 'c',
    requiredSkills: [],
    preferredSkills: [],
    domainTags: [],
    promptVersion: 'spec-v1',
    extractedAt: '2026-09-08T00:00:00.000Z',
    ...overrides,
  }
}

describe('normalization and synonyms', () => {
  it('normalizes case and punctuation', () => {
    expect(normalizeSkill('  React! Testing. ')).toBe('react testing')
  })

  it('maps aliases to canonicals', () => {
    expect(canonicalSkill('k8s')).toBe('kubernetes')
    expect(canonicalSkill('js')).toBe('javascript')
    expect(canonicalSkill('TS')).toBe('typescript')
    expect(canonicalSkill('Cypress')).toBe('cypress')
  })
})

describe('computeMatch', () => {
  it('is deterministic: same inputs always produce the same score', () => {
    const s = spec({
      requiredSkills: [{ name: 'Playwright', evidence: 'min 3 years' }],
      preferredSkills: [{ name: 'Kubernetes', evidence: 'exposure to' }],
      domainTags: ['retail', 'banking'],
    })
    const jd = 'Senior QA Automation Engineer. 5-8 years. Playwright mandatory. Kubernetes exposure.'
    const a = computeMatch(s, resume, jd)
    const b = computeMatch(s, resume, jd)
    expect(a.overallScore).toBe(b.overallScore)
    expect(a.subScores).toEqual(b.subScores)
    expect(a.matched).toEqual(b.matched)
  })

  it('counts a required skill present via synonym (K8s -> kubernetes)', () => {
    const s = spec({
      requiredSkills: [{ name: 'K8s', evidence: 'must have' }],
    })
    const r = computeMatch(s, resume, '')
    expect(r.matched.map((m) => m.name)).toEqual(['K8s'])
    expect(r.missingBlocking).toEqual([])
    expect(r.subScores.requiredCoverage).toBe(1)
  })

  it('handles punctuation-sensitive skills like CI/CD literally', () => {
    const s = spec({ requiredSkills: [{ name: 'CI/CD', evidence: 'required' }] })
    const r = computeMatch(s, resume, '')
    expect(r.matched.map((m) => m.name)).toEqual(['CI/CD'])
    expect(r.missingBlocking).toEqual([])
  })

  it('matches a multi-word skill when only a token window appears (CI/CD pipelines vs CI/CD)', () => {
    const s = spec({ requiredSkills: [{ name: 'CI/CD pipelines', evidence: 'required' }] })
    const r = computeMatch(s, resume, '')
    expect(r.missingBlocking).toEqual([])
  })

  it('matches a skill when a distinctive token appears (Cursor AI vs Cursor)', () => {
    const s = spec({ requiredSkills: [{ name: 'Cursor AI', evidence: 'must use' }] })
    const r = computeMatch(
      s,
      'AI-Assisted Development: Claude Code, Cursor, Windsurf. Cypress, Selenium.',
      '',
    )
    expect(r.missingBlocking).toEqual([])
    expect(r.subScores.requiredCoverage).toBe(1)
  })

  it('still reports missing when neither the phrase nor distinctive tokens appear', () => {
    const s = spec({ requiredSkills: [{ name: 'Cursor AI', evidence: 'must use' }] })
    const r = computeMatch(s, 'Playwright and Cypress only, no AI tools.', '')
    expect(r.missingBlocking.map((m) => m.name)).toEqual(['Cursor AI'])
  })

  it('counts an OR-list requirement as covered when any alternative is evidenced', () => {
    const evidence = 'Experience using Cursor AI or AI assisted development tools'
    const s = spec({
      requiredSkills: [
        { name: 'Cursor AI', evidence },
        { name: 'Claude Code', evidence },
        { name: 'Windsurf', evidence },
        { name: 'GitHub Copilot', evidence },
      ],
    })
    const r = computeMatch(
      s,
      'AI-Assisted Development: Claude Code, Cursor, Windsurf. Cypress automation.',
      '',
    )
    // One requirement (one evidence group) -> fully covered even though "GitHub Copilot" is absent.
    expect(r.subScores.requiredCoverage).toBe(1)
    expect(r.missingBlocking).toEqual([])
    expect(r.matched.map((m) => m.name)).not.toContain('GitHub Copilot')
  })

  it('lists every alternative as blocking when none are evidenced', () => {
    const evidence = 'Hands on experience with Git, Azure DevOps, or GitHub'
    const s = spec({
      requiredSkills: [
        { name: 'Git', evidence },
        { name: 'Azure DevOps', evidence },
        { name: 'GitHub', evidence },
      ],
    })
    const r = computeMatch(s, 'No version control tools mentioned anywhere here.', '')
    expect(r.subScores.requiredCoverage).toBe(0)
    expect(r.missingBlocking.map((m) => m.name).sort()).toEqual(['Azure DevOps', 'Git', 'GitHub'])
  })

  it('triages missing required skills as blocking with their JD evidence', () => {
    const s = spec({
      requiredSkills: [
        { name: 'Playwright', evidence: 'Minimum 3 years of hands on' },
        { name: 'Cursor AI', evidence: 'experience using Cursor AI' },
      ],
      preferredSkills: [{ name: 'Accessibility Testing', evidence: 'Exposure to' }],
    })
    const r = computeMatch(s, resume, '')
    expect(r.missingBlocking.map((m) => m.name)).toEqual(['Cursor AI'])
    expect(r.missingBlocking[0].jdEvidence).toBe('experience using Cursor AI')
    expect(r.missingNiceToHave.map((m) => m.name)).toEqual(['Accessibility Testing'])
    expect(r.atsGapKeywords).toContain('Cursor AI')
  })

  it('gives full seniority fit when the resume exceeds the JD range minimum', () => {
    const s = spec({ requiredSkills: [], preferredSkills: [] })
    const r = computeMatch(s, resume, 'Experience: 5 – 8 Years')
    expect(r.subScores.seniorityFit).toBe(1)
  })

  it('prorates domain fit from the JD domain tags found in the resume', () => {
    const s = spec({ domainTags: ['retail', 'e-commerce', 'banking'] })
    const r = computeMatch(s, resume, '')
    expect(r.subScores.domainFit).toBeCloseTo(2 / 3)
  })

  it('does not penalize an empty preferred list', () => {
    const s = spec({ requiredSkills: [{ name: 'Playwright', evidence: 'required' }] })
    const r = computeMatch(s, resume, '')
    expect(r.subScores.preferredCoverage).toBe(1)
    expect(r.overallScore).toBeGreaterThan(0)
  })

  it('floors at the neutral seniority/domain credit when nothing else matches', () => {
    // No years or domain signals anywhere -> both are neutral (1.0), so with zero
    // skill coverage the floor is 0.15 + 0.10 = 25.
    const s = spec({
      requiredSkills: [{ name: 'Ruby on Rails', evidence: 'must' }],
      preferredSkills: [{ name: 'Rust', evidence: 'nice to have' }],
    })
    const r = computeMatch(s, 'Fresh graduate with no listed skills.', '')
    expect(r.overallScore).toBe(25)
  })
})
