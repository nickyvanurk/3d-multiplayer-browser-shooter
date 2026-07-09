import sanitizeHtml from 'sanitize-html';

export function sanitize(input: string): string {
  return sanitizeHtml(input);
}
