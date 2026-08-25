import { extractEmployeeCodeFromFilename } from './filename.util';

describe('extractEmployeeCodeFromFilename', () => {
  it('extracts code before extension', () => {
    expect(extractEmployeeCodeFromFilename('EMP-2026-0001.pdf')).toBe(
      'EMP-2026-0001',
    );
  });

  it('extracts code before underscore suffix', () => {
    expect(
      extractEmployeeCodeFromFilename('EMP-2026-0001_FY2526.pdf'),
    ).toBe('EMP-2026-0001');
  });

  it('handles nested zip paths', () => {
    expect(
      extractEmployeeCodeFromFilename('folder/EMP-2026-0002_Form16.pdf'),
    ).toBe('EMP-2026-0002');
  });

  it('returns null for empty name', () => {
    expect(extractEmployeeCodeFromFilename('')).toBeNull();
  });
});
