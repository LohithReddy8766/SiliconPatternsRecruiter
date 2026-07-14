import { describe, it, expect } from 'vitest';
import { cleanUrl, isCandidateOpenToWork, computeMatchScore } from './App.jsx';

describe('cleanUrl', () => {
  it('strips query params and trailing case/whitespace differences', () => {
    expect(cleanUrl('https://www.linkedin.com/in/jdoe?trk=abc')).toBe('https://www.linkedin.com/in/jdoe');
    expect(cleanUrl('  HTTPS://WWW.LINKEDIN.COM/IN/JDOE  ')).toBe('https://www.linkedin.com/in/jdoe');
  });

  it('dedupes URLs that only differ by query string or case', () => {
    const a = cleanUrl('https://linkedin.com/in/jdoe?a=1');
    const b = cleanUrl('https://LinkedIn.com/in/JDoe?b=2');
    expect(a).toBe(b);
  });

  it('returns empty string for missing input', () => {
    expect(cleanUrl(null)).toBe('');
    expect(cleanUrl(undefined)).toBe('');
    expect(cleanUrl('')).toBe('');
  });
});

describe('isCandidateOpenToWork', () => {
  it('respects the explicit openToWork/isOpenToWork flags', () => {
    expect(isCandidateOpenToWork({ openToWork: true })).toBe(true);
    expect(isCandidateOpenToWork({ isOpenToWork: true })).toBe(true);
  });

  it('falls back to keyword heuristics when no flag is present', () => {
    expect(isCandidateOpenToWork({ headline: 'Verification Engineer #OpenToWork' })).toBe(true);
    expect(isCandidateOpenToWork({ about: 'Actively looking for new opportunities' })).toBe(true);
  });

  it('returns false when nothing indicates open-to-work', () => {
    expect(isCandidateOpenToWork({ headline: 'Senior Verification Engineer at ARM' })).toBe(false);
  });
});

describe('computeMatchScore', () => {
  const profile = {
    headline: 'ASIC Verification Engineer',
    about: 'Experienced with UVM and SystemVerilog testbenches, PCIe protocol verification.',
    currentTitle: 'Verification Engineer',
    location: 'Bengaluru'
  };

  it('scores 0 when no criteria are given', () => {
    expect(computeMatchScore(profile)).toBe(0);
  });

  it('scores higher for a profile matching required skills than one that does not', () => {
    const matchScore = computeMatchScore(profile, ['UVM', 'PCIe']);
    const noMatchScore = computeMatchScore(profile, ['CUDA', 'Chisel']);
    expect(matchScore).toBeGreaterThan(noMatchScore);
    expect(matchScore).toBeGreaterThan(0);
  });

  it('weights starred (priority) skills higher than plain must-haves', () => {
    const withoutPriority = computeMatchScore(profile, ['UVM', 'CUDA'], [], [], [], []);
    const withPriorityOnMatched = computeMatchScore(profile, ['UVM', 'CUDA'], [], [], [], ['UVM']);
    expect(withPriorityOnMatched).toBeGreaterThan(withoutPriority);
  });

  it('rewards matching location and designation', () => {
    const withLocation = computeMatchScore(profile, [], [], [], ['Bengaluru']);
    const withoutLocation = computeMatchScore(profile, [], [], [], ['San Jose']);
    expect(withLocation).toBeGreaterThan(withoutLocation);
  });
});
