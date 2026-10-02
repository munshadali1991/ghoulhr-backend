export function extractEmployeeCodeFromFilename(fileName: string): string | null {
  const base = fileName.split(/[/\\]/).pop() || fileName;
  const withoutExt = base.replace(/\.[^.]+$/, '');
  const code = withoutExt.split('_')[0]?.trim();
  return code || null;
}
