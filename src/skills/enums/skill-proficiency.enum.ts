export enum SkillProficiency {
  BEGINNER = 'BEGINNER',
  GOOD = 'GOOD',
  EXPERT = 'EXPERT',
}

export const SKILL_PROFICIENCY_VALUES = [
  SkillProficiency.BEGINNER,
  SkillProficiency.GOOD,
  SkillProficiency.EXPERT,
] as const;

export const MAX_SKILL_EXPERIENCE_MONTHS = 720;
