// IATA → name. Type code or name to search.
const AIRLINES = [
  ["SV","Saudia"],["XY","flynas"],["F3","flyadeal"],["EK","Emirates"],["EY","Etihad Airways"],
  ["QR","Qatar Airways"],["TK","Turkish Airlines"],["GF","Gulf Air"],["WY","Oman Air"],["MS","EgyptAir"],
  ["RJ","Royal Jordanian"],["ME","Middle East Airlines"],["KU","Kuwait Airways"],["FZ","flydubai"],
  ["G9","Air Arabia"],["PK","Pakistan Intl Airlines"],["AI","Air India"],["6E","IndiGo"],["UK","Vistara"],
  ["SG","SpiceJet"],["UL","SriLankan Airlines"],["BG","Biman Bangladesh"],["BS","US-Bangla Airlines"],
  ["GA","Garuda Indonesia"],["MH","Malaysia Airlines"],["SQ","Singapore Airlines"],["TG","Thai Airways"],
  ["PR","Philippine Airlines"],["CX","Cathay Pacific"],["KE","Korean Air"],["JL","Japan Airlines"],
  ["NH","ANA"],["BA","British Airways"],["LH","Lufthansa"],["AF","Air France"],["KL","KLM"],
  ["LX","Swiss"],["OS","Austrian Airlines"],["SN","Brussels Airlines"],["AY","Finnair"],["SK","SAS"],
  ["IB","Iberia"],["TP","TAP Portugal"],["AZ","ITA Airways"],["AC","Air Canada"],["AA","American Airlines"],
  ["DL","Delta Air Lines"],["UA","United Airlines"],["WN","Southwest Airlines"],["B6","JetBlue"],
  ["QF","Qantas"],["NZ","Air New Zealand"],["ET","Ethiopian Airlines"],["KQ","Kenya Airways"],
  ["SA","South African Airways"],["MS","EgyptAir"],["AT","Royal Air Maroc"],
];

function searchAirlines(q){
  q = String(q||"").trim().toUpperCase();
  if (!q) return AIRLINES.slice(0,8);
  return AIRLINES.filter(([c,n]) => c.startsWith(q) || n.toUpperCase().includes(q)).slice(0,8);
}
