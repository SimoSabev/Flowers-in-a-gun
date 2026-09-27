const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "2018-10-13" -> "October 13, 2018". Parsed by hand so the server's time zone can't shift the day. */
export function formatDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

/** RFC 822 date for RSS, at noon UTC so the calendar day is stable in every reader. */
export function rfc822(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toUTCString();
}
