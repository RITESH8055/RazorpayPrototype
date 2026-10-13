export const inr = (x: number) => "₹" + Math.round(x).toLocaleString("en-IN");
export const lakh = (x: number) => (x >= 100000 ? `₹${(x / 100000).toFixed(x >= 1e6 ? 1 : 2).replace(/\.?0+$/, "")} lakh` : inr(x));
export const fmtDate = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
