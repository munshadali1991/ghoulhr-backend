/** Snapshot question embedded in an assessment or returned from the master API. */
export interface PerformanceSchemaQuestion {
  key: string;
  number?: number;
  label: string;
  type: string;
  options?: string[];
  allowComment?: boolean;
  required?: boolean;
  helperText?: string | null;
  placeholder?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

/** Snapshot section embedded in an assessment or returned from the master API. */
export interface PerformanceSchemaSection {
  key: string;
  title: string;
  banner?: string | null;
  /** RBAC role code that fills this section (e.g. EMPLOYEE, MANAGER, HR_ADMIN). */
  role: string;
  filledByRoleName?: string | null;
  scored: boolean;
  sortOrder?: number;
  isActive?: boolean;
  questions: PerformanceSchemaQuestion[];
}

export interface PerformanceSchemaRatingOption {
  label: string;
  weight: number;
  sortOrder?: number;
  isActive?: boolean;
}

/** Frozen assessment schema persisted on performance_assessments.schema. */
export interface PerformanceAssessmentSchema {
  sections: PerformanceSchemaSection[];
  ratingOptions: PerformanceSchemaRatingOption[];
}

/** Master payload returned by GET /settings/performance/master. */
export interface PerformanceMasterPayload extends PerformanceAssessmentSchema {
  sections: (PerformanceSchemaSection & { id?: string; questions: (PerformanceSchemaQuestion & { id?: string })[] })[];
  ratingOptions: (PerformanceSchemaRatingOption & { id?: string })[];
}
