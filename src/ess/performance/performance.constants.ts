import { PerformanceAnswer } from '../entities/performance-answer.entity';
import type { PerformanceAssessmentSchema } from './performance-schema.types';

export const PERFORMANCE_DEFAULT_TEMPLATE_KEY = 'annual-review-v1';

export const MAX_RATING_WEIGHT = 5;

/**
 * Authoritative score: average of weighted rating answers in scored sections,
 * scaled to 100. Only snapshot scored keys (scored section + rating type) count.
 */
export function computeAssessmentScore(
  answers: PerformanceAnswer[],
  schema: PerformanceAssessmentSchema | null | undefined,
): number {
  if (!schema?.sections?.length) {
    return 0;
  }

  const weightByLabel = new Map(
    (schema.ratingOptions ?? []).map((o) => [o.label.toUpperCase(), o.weight]),
  );

  const scoredKeys = new Set<string>();
  for (const section of schema.sections) {
    if (!section.scored) continue;
    for (const question of section.questions) {
      if (question.type === 'rating' && question.isActive !== false) {
        scoredKeys.add(question.key);
      }
    }
  }

  const ratings = answers
    .filter((a) => scoredKeys.has(a.questionKey))
    .map((a) => a.valueRating)
    .filter((r): r is string => Boolean(r))
    .map((r) => weightByLabel.get(r.toUpperCase()))
    .filter((w): w is number => typeof w === 'number');

  if (ratings.length === 0) {
    return 0;
  }

  const maxWeight = Math.max(
    MAX_RATING_WEIGHT,
    ...Array.from(weightByLabel.values()),
    1,
  );
  const total = ratings.reduce((sum, w) => sum + w, 0);
  const average = total / ratings.length;
  const scaled = (average / maxWeight) * 100;
  return Math.round(scaled * 100) / 100;
}
