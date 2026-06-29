import { extname } from 'path';

const MAX_FILENAME_LENGTH = 100;

export function sanitizeFilename(originalFileName: string): string {
  const base = (originalFileName || 'file').split(/[/\\]/).pop() || 'file';
  const ext = extname(base).toLowerCase().replace(/[^a-z0-9.]/g, '');
  const stem = base
    .slice(0, base.length - extname(base).length)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '');

  const safeStem = (stem || 'file').slice(0, MAX_FILENAME_LENGTH);
  const safeExt = ext.startsWith('.') ? ext.slice(0, 16) : ext ? `.${ext.slice(0, 15)}` : '';
  return `${safeStem}${safeExt}`.slice(0, MAX_FILENAME_LENGTH + 16);
}

export function extensionFromFilename(fileName: string): string {
  const ext = extname(fileName || '').toLowerCase();
  return ext || '';
}
