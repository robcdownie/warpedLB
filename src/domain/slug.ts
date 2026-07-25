// Deterministic, stable ID generation. The SAME artist name must produce the
// SAME id on every device so that shared selections reference identical records.

/** Normalize a display name into a stable slug id. */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/ø/gi, 'o')
    .replace(/&/g, 'and')
    .toLowerCase()
    .replace(/['".,!?()/\\:+@]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export function artistId(name: string): string {
  return slugify(name);
}

export function mainPerformanceId(day: 'saturday' | 'sunday', name: string): string {
  const dayCode = day === 'saturday' ? 'sat' : 'sun';
  return `main-${dayCode}-${slugify(name)}`;
}

export function unpluggedPerformanceId(name: string): string {
  return `unplugged-${slugify(name)}`;
}
