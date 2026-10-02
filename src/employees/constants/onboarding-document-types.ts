/** HR onboarding document types stored in employee_documents. */
export const ONBOARDING_DOCUMENT_TYPES = [
  'OFFER_LETTER',
  'APPOINTMENT_LETTER',
  'RESUME',
  'EXPERIENCE_PROOF',
  'PAN_CARD',
  'AADHAAR_CARD',
  'PASSPORT_PHOTO',
  'CANCELLED_CHEQUE',
] as const;

export type OnboardingDocumentType = (typeof ONBOARDING_DOCUMENT_TYPES)[number];

export function isOnboardingDocumentType(type: string | null | undefined): boolean {
  return Boolean(type && (ONBOARDING_DOCUMENT_TYPES as readonly string[]).includes(type));
}
