/**
 * Open WhatsApp share link in a new tab.
 * Free, no API. Phone normalised to digits; if missing country code,
 * Saudi (+966) is assumed.
 */
export function normalisePhone(raw: string | null | undefined, defaultCC = "966"): string {
  let p = (raw ?? "").replace(/\D/g, "");
  if (!p) return "";
  if (p.startsWith("00")) p = p.slice(2);
  if (p.startsWith("0")) p = defaultCC + p.slice(1);
  if (p.length <= 10 && !p.startsWith(defaultCC)) p = defaultCC + p;
  return p;
}

export function whatsAppUrl(phone: string | null | undefined, text: string): string {
  const p = normalisePhone(phone);
  const t = encodeURIComponent(text);
  return p ? `https://wa.me/${p}?text=${t}` : `https://wa.me/?text=${t}`;
}

export function openWhatsApp(phone: string | null | undefined, text: string) {
  window.open(whatsAppUrl(phone, text), "_blank", "noopener,noreferrer");
}
