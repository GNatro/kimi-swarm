/**
 * Challenge Engine — 6-Lens + Red Team adversarial review
 */

export interface LensReview {
  lens: string;
  findings: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  recommendation: string;
}

export interface ChallengeResult {
  subject: string;
  reviews: LensReview[];
  overallRisk: number; // 1-25
  redTeamAttacks: string[];
  summary: string;
  wordCount: number;
}

const LENSES = [
  {
    name: 'ARCHITECT',
    questions: [
      'Does this violate single responsibility?',
      'Are the interfaces clear and stable?',
      'Does it introduce circular dependencies?',
      'Is the abstraction level appropriate?',
    ],
  },
  {
    name: 'SRE',
    questions: [
      'What happens on deploy failure?',
      'Is there a rollback plan?',
      'Does it increase resource usage?',
      'Are there single points of failure?',
    ],
  },
  {
    name: 'SECURITY',
    questions: [
      'What new attack surfaces are introduced?',
      'Is input validation adequate?',
      'Are secrets handled properly?',
      'Does it comply with least privilege?',
    ],
  },
  {
    name: 'QA',
    questions: [
      'How will this be tested?',
      'What edge cases are missed?',
      'Is test coverage affected?',
      'Are there race conditions?',
    ],
  },
  {
    name: 'OPERATOR',
    questions: [
      'Can this be monitored in production?',
      'Are logs adequate for debugging?',
      'Does it require manual intervention?',
      'Is documentation updated?',
    ],
  },
  {
    name: 'RED TEAM',
    questions: [
      'How would I break this intentionally?',
      'What assumptions can I violate?',
      'What happens if I feed garbage input?',
      'Can I exploit timing or ordering?',
    ],
  },
];

export async function runChallenge(subject: string): Promise<ChallengeResult> {
  const reviews: LensReview[] = [];
  
  for (const lens of LENSES) {
    const findings = lens.questions.map(q => `${q} → Analyze and answer.`);
    
    // Auto-generate severity based on keywords
    const severity = autoSeverity(subject, lens.name);
    
    reviews.push({
      lens: lens.name,
      findings,
      severity,
      recommendation: `Based on ${lens.name} analysis: [specific recommendation]`,
    });
  }

  // Red Team attacks
  const redTeamAttacks = generateRedTeamAttacks(subject);

  // Calculate overall risk
  const severityScores = { low: 1, medium: 2, high: 3, critical: 4 };
  const totalScore = reviews.reduce((sum, r) => sum + severityScores[r.severity], 0);
  const overallRisk = Math.min(25, totalScore + redTeamAttacks.length);

  const summary = generateSummary(subject, reviews, overallRisk);
  const wordCount = countWords(summary);

  return {
    subject,
    reviews,
    overallRisk,
    redTeamAttacks,
    summary,
    wordCount,
  };
}

function autoSeverity(subject: string, lens: string): LensReview['severity'] {
  const s = subject.toLowerCase();
  if (s.includes('auth') || s.includes('security') || s.includes('password')) {
    return lens === 'SECURITY' || lens === 'RED TEAM' ? 'critical' : 'high';
  }
  if (s.includes('database') || s.includes('schema')) {
    return lens === 'SRE' || lens === 'OPERATOR' ? 'high' : 'medium';
  }
  if (s.includes('api') || s.includes('endpoint')) {
    return lens === 'SECURITY' ? 'high' : 'medium';
  }
  return 'medium';
}

function generateRedTeamAttacks(subject: string): string[] {
  const attacks = [
    `Feed malformed input to ${subject} and observe behavior`,
    `Race condition: trigger ${subject} twice simultaneously`,
    `Resource exhaustion: provide maximum-size input`,
    `Access control: attempt ${subject} with minimal privileges`,
    `Dependency confusion: what if a dependency is compromised?`,
  ];
  return attacks;
}

function generateSummary(subject: string, reviews: LensReview[], risk: number): string {
  const lines: string[] = [];
  lines.push(`# 🔍 Challenge-Grade Review: "${subject}"`);
  lines.push('');
  lines.push(`**Overall Risk Score: ${risk}/25** ${risk >= 13 ? '⚠️ ABOVE THRESHOLD' : ''}`);
  lines.push('');
  lines.push('## 6-Lens Analysis');
  lines.push('');
  
  for (const review of reviews) {
    const icon = review.severity === 'critical' ? '🔴' : 
                 review.severity === 'high' ? '🟠' : 
                 review.severity === 'medium' ? '🟡' : '🟢';
    lines.push(`### ${icon} ${review.lens} (${review.severity.toUpperCase()})`);
    for (const finding of review.findings) {
      lines.push(`- ${finding}`);
    }
    lines.push(`**Recommendation:** ${review.recommendation}`);
    lines.push('');
  }
  
  lines.push('## Red Team Attacks');
  lines.push('');
  // Red team attacks would be populated here
  
  lines.push('## Conclusion');
  lines.push(`This change has a risk score of ${risk}. ${risk >= 13 ? 'Recommendation: Split into smaller PRs.' : 'Proceed with standard review.'}`);
  
  return lines.join('\n');
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}
