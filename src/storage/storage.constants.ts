export const STORAGE_CATEGORIES = [
  'employee-documents',
  'organization-files',
  'staging',
] as const;

export type StorageCategory = (typeof STORAGE_CATEGORIES)[number];

export const STORAGE_MODULES = [
  'onboarding',
  'leave',
  'profile-photos',
  'branding',
] as const;

export type StorageModule = (typeof STORAGE_MODULES)[number];

export const STORAGE_DRIVERS = {
  S3: 's3',
  INLINE_BASE64: 'inline_base64',
} as const;

export const DEFAULT_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const LOGO_MAX_FILE_BYTES = 2 * 1024 * 1024;
export const PROFILE_PHOTO_MAX_FILE_BYTES = 2 * 1024 * 1024;

export const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'image/gif',
]);

export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
]);

export const ALLOWED_DOCUMENT_EXTENSIONS = [
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.txt',
  '.ppt',
  '.pptx',
  '.gif',
];

export const ALLOWED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
