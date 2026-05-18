/**
 * Intent Classifier — Auto-detect user intent from natural language request
 * Supports English + Spanish keyword matching
 */

export type TaskType =
  | 'bug-fix'
  | 'feature'
  | 'refactor'
  | 'typo'
  | 'docs'
  | 'security'
  | 'exploration'
  | 'test'
  | 'unknown';

export interface IntentResult {
  taskType: TaskType;
  keywords: string[];
  confidence: number; // 0-1
}

interface IntentRule {
  patterns: string[];
  type: TaskType;
  weight?: number;
}

const INTENT_RULES: IntentRule[] = [
  { patterns: ['fix', 'bug', 'error', 'crash', 'broken', 'arreglar', 'falla', 'fallo', 'roto'], type: 'bug-fix' },
  { patterns: ['add', 'implement', 'create', 'new feature', 'agregar', 'añadir', 'nueva funcionalidad', 'feature'], type: 'feature' },
  { patterns: ['refactor', 'restructure', 'clean up', 'limpiar', 'reestructurar', 'optimizar código'], type: 'refactor' },
  { patterns: ['typo', 'spelling', 'readme', 'comment', 'ortografía', 'error tipográfico', 'comentario'], type: 'typo', weight: 2 },
  { patterns: ['document', 'doc', 'readme', 'documentar', 'documentación'], type: 'docs' },
  { patterns: ['auth', 'login', 'password', 'crypto', 'security', 'encrypt', 'autenticación', 'contraseña', 'seguridad'], type: 'security' },
  { patterns: ['understand', 'how does', 'explain', 'explore', 'entender', 'cómo funciona', 'explicar', 'explorar'], type: 'exploration' },
  { patterns: ['test', 'tests', 'spec', 'coverage', 'prueba', 'testear', 'cobertura'], type: 'test' },
];

/**
 * Classify user request into task type based on keywords
 */
export function classifyIntent(rawRequest: string): IntentResult {
  const lower = rawRequest.toLowerCase();

  // Score each task type
  const scores = new Map<TaskType, number>();
  const matchedKeywords: string[] = [];

  for (const rule of INTENT_RULES) {
    for (const pattern of rule.patterns) {
      const patternLower = pattern.toLowerCase();
      // Use substring matching (allows 'crashes' to match 'crash')
      if (lower.includes(patternLower)) {
        scores.set(rule.type, (scores.get(rule.type) || 0) + (rule.weight || 1));
        if (!matchedKeywords.includes(patternLower)) {
          matchedKeywords.push(patternLower);
        }
      }
    }
  }

  // Deduplicate overlapping substring matches within each type:
  // If a type has matches for 'doc', 'document', 'documentación' all in the same text,
  // they likely come from the same occurrence. Cap the count for each type
  // to the number of distinct non-overlapping occurrences.
  for (const [type, score] of scores) {
    const typePatterns = INTENT_RULES
      .filter(r => r.type === type)
      .flatMap(r => r.patterns)
      .map(p => p.toLowerCase())
      .sort((a, b) => b.length - a.length); // longest first

    let occurrences = 0;
    let remaining = lower;
    for (const pat of typePatterns) {
      if (remaining.includes(pat)) {
        occurrences++;
        // Remove this occurrence so shorter substrings don't double-count
        remaining = remaining.replace(pat, ' ');
      }
    }
    // Use the minimum of the raw score and the deduplicated occurrences
    // but preserve weighted scores by scaling
    scores.set(type, Math.min(score, occurrences * 2));
  }

  // Find highest scoring type
  let bestType: TaskType = 'unknown';
  let bestScore = 0;

  for (const [type, score] of scores) {
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }

  // Calculate confidence
  let confidence = 0.5; // base

  if (bestScore > 0) {
    confidence += 0.2; // clear keyword match
    if (bestScore >= 2) confidence += 0.15; // multiple matches
    if (bestScore >= 3) confidence += 0.1;
  }

  // Penalize ambiguous requests
  if (rawRequest.length < 20) confidence -= 0.1; // too vague
  if (rawRequest.length > 300) confidence -= 0.1; // too complex/ambiguous

  // If multiple types have similar scores, reduce confidence
  const sortedScores = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  if (sortedScores.length >= 2 && sortedScores[0][1] === sortedScores[1][1]) {
    confidence -= 0.2; // ambiguous between two types
  }

  confidence = Math.max(0, Math.min(1, confidence));

  return {
    taskType: bestType,
    keywords: matchedKeywords,
    confidence,
  };
}
