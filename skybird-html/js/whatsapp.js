function normalizePhone(p){
  let s = String(p||"").replace(/[^\d]/g,"");
  if (!s) return "";
  if (s.startsWith("00")) s = s.slice(2);
  // assume Saudi if 9 digits starting with 5
  if (s.length === 9 && s.startsWith("5")) s = "966" + s;
  if (s.length === 10 && s.startsWith("05")) s = "966" + s.slice(1);
  return s;
}
function openWhatsApp(phone, text){
  const p = normalizePhone(phone);
  const url = "https://wa.me/" + p + "?text=" + encodeURIComponent(text||"");
  window.open(url, "_blank");
}
