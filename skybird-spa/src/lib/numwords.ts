// English number-to-words for currency. Up to billions.
const a = ["","one","two","three","four","five","six","seven","eight","nine","ten",
  "eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
const b = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];

function below1000(n: number): string {
  if (n === 0) return "";
  if (n < 20) return a[n];
  if (n < 100) return b[Math.floor(n/10)] + (n%10 ? "-" + a[n%10] : "");
  return a[Math.floor(n/100)] + " hundred" + (n%100 ? " " + below1000(n%100) : "");
}

export function numberToWords(n: number): string {
  if (n === 0) return "zero";
  const sign = n < 0 ? "minus " : "";
  n = Math.abs(Math.floor(n));
  const parts: string[] = [];
  const units = ["", "thousand", "million", "billion"];
  let i = 0;
  while (n > 0) {
    const chunk = n % 1000;
    if (chunk) parts.unshift(below1000(chunk) + (units[i] ? " " + units[i] : ""));
    n = Math.floor(n / 1000);
    i++;
  }
  return sign + parts.join(" ");
}

export function amountInWords(amount: number, currency = "SAR"): string {
  const whole = Math.floor(Math.abs(amount));
  const cents = Math.round((Math.abs(amount) - whole) * 100);
  const w = numberToWords(whole);
  const cap = w.charAt(0).toUpperCase() + w.slice(1);
  if (!cents) return `${cap} ${currency} only`;
  return `${cap} ${currency} and ${numberToWords(cents)} halalas only`;
}
