const RICH_TEXT_TAG_PATTERN = /<\/?(?:p|div|br|h[1-6]|ol|ul|li|blockquote|pre|strong|b|em|i|u|s|strike|a|img|span)(?:\s[^>]*)?>/i;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Quill's HTML model collapses newlines when a legacy plain-text note is fed
 * directly into it. Convert only non-HTML note bodies into explicit Quill
 * paragraphs so old local and synced notes retain every line boundary.
 */
export function normalizeNoteBodyForRichTextEditor(value: unknown): string {
  const source = typeof value === 'string' ? value : String(value ?? '');
  if (!source || RICH_TEXT_TAG_PATTERN.test(source)) {
    return source;
  }

  return source
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.length > 0 ? `<p>${escapeHtml(line)}</p>` : '<p><br></p>')
    .join('');
}
