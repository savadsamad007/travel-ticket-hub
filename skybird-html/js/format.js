const CURRENCY = "SAR";
function fmt(n){ const v = Number(n||0); return CURRENCY + " " + v.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}); }
function num(n){ return Number(n||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}); }
function dateOnly(d){ if(!d) return "—"; const x=new Date(d); return isNaN(x)?String(d):x.toLocaleDateString(); }
function dateTime(d){ if(!d) return "—"; const x=new Date(d); return isNaN(x)?String(d):x.toLocaleString(); }
function todayISO(){ return new Date().toISOString().slice(0,10); }

// Auto "/" every 3 chars for routes like RUH/TRV/COK/ABD
function formatRouteInput(v){
  const raw = String(v||"").toUpperCase().replace(/[^A-Z]/g,"");
  const parts = [];
  for (let i=0; i<raw.length; i+=3) parts.push(raw.slice(i,i+3));
  return parts.join("/");
}
function bindRouteInput(el){
  el.addEventListener("input", () => {
    const cursorEnd = el.selectionStart === el.value.length;
    el.value = formatRouteInput(el.value);
    if (cursorEnd) el.setSelectionRange(el.value.length, el.value.length);
  });
}

function escapeHtml(s){ return String(s??"").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }

// Number to English words (for vouchers)
function numToWords(num){
  num = Math.round(Number(num)*100)/100;
  const a=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const b=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  function n(x){
    x = Math.floor(x);
    if (x<20) return a[x];
    if (x<100) return b[Math.floor(x/10)] + (x%10?' '+a[x%10]:'');
    if (x<1000) return a[Math.floor(x/100)]+' Hundred'+(x%100?' '+n(x%100):'');
    if (x<1000000) return n(Math.floor(x/1000))+' Thousand'+(x%1000?' '+n(x%1000):'');
    return n(Math.floor(x/1000000))+' Million'+(x%1000000?' '+n(x%1000000):'');
  }
  const i = Math.floor(num), d = Math.round((num-i)*100);
  return (i?n(i):'Zero') + (d?' and '+n(d)+'/100':'') + ' Only';
}
