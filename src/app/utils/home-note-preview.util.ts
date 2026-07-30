export function homeNotePlainText(input: unknown): string {
  if (input === null || input === undefined) {
    return '';
  }

  let value = String(input)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/div>/gi, ' ')
    .replace(/<div[^>]*>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<p[^>]*>/gi, ' ')
    .replace(/<\/li>/gi, ' ')
    .replace(/<li[^>]*>/gi, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<[^>]*>/g, ' ');

  try {
    const parser = new DOMParser();
    const dom = parser.parseFromString(value, 'text/html');
    value = dom.body.textContent || '';
  } catch {
    // The fallback string has already had markup removed.
  }

  return value.replace(/\s+/g, ' ').trim();
}

export function homeNotePreview(input: unknown, maxLength = 40): string {
  const source = input === null || input === undefined ? '' : String(input);
  const plainText = homeNotePlainText(input);
  return source.length > maxLength
    ? `${plainText.slice(0, maxLength)}...`
    : plainText;
}
