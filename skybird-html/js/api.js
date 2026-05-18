// Google Apps Script Web App endpoint
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxZsRJF-HnOQT9kxn_bRFwjEDH8mV62Swgm3sp3cSvcQ-sRlipFxck9ghfPKHgOIHz4YQ/exec";
const TOKEN_KEY = "skybird_token";

function getToken(){ return localStorage.getItem(TOKEN_KEY) || ""; }
function setToken(t){ if(t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); }

async function gas(action, data = {}) {
  // Use text/plain to avoid CORS preflight on Apps Script
  const res = await fetch(WEB_APP_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, data, token: getToken() }),
    redirect: "follow",
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); }
  catch(e){ throw new Error("Bad response from server: " + text.slice(0,200)); }
  if (!json.ok) throw new Error(json.error || "Request failed");
  return json.data;
}
