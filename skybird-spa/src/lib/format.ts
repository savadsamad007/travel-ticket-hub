/**
 * Format an airport-code route: insert "/" after every 3 letters.
 * Strips non-letters and uppercases. Caps at 6 segments.
 * Examples:
 *   "ruhjedcok"  -> "RUH/JED/COK"
 *   "ruh/jed"    -> "RUH/JED"
 *   "ruhje"      -> "RUH/JE"
 */
export function formatRoute(input: string): string {
  const clean = (input || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (!clean) return "";
  const parts: string[] = [];
  for (let i = 0; i < clean.length && parts.length < 6; i += 3) {
    parts.push(clean.slice(i, i + 3));
  }
  return parts.join("/");
}
