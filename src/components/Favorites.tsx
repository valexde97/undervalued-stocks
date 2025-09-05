import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useFavorites } from "../components/FavoritesContext";
import { useAppSelector } from "../store/hooks";
import StockList from "./StockList";
import type { Stock } from "../types/stock";
import layout from "../pages/home.module.css"; // FIX: correct relative path from components/


function buildMinimalStock(ticker: string, q: any): Stock {
const price = typeof q?.c === "number" ? q.c : undefined;
const changePct = typeof q?.dp === "number" ? q.dp : undefined;
return {
ticker,
name: ticker,
price,
changePct,
category: undefined as any,
sector: undefined,
industry: undefined,
country: undefined,
marketCap: undefined,
pe: undefined,
ps: undefined,
pb: undefined,
} as unknown as Stock;
}
const Favorites = () => {
const { t } = useTranslation();
const { favorites, clearFavorites } = useFavorites();
const storeItems = useAppSelector((s) => s.stocks.items);


const [extra, setExtra] = useState<Record<string, Stock>>({});
const [loading, setLoading] = useState(false);


const missingTickers = useMemo(() => {
const have = new Set(storeItems.map((s) => s.ticker));
return favorites.filter((f) => !have.has(f));
}, [favorites, storeItems]);


useEffect(() => {
let cancelled = false;
async function run() {
if (missingTickers.length === 0) return;
try {
setLoading(true);
const qs = encodeURIComponent(missingTickers.join(","));
const res = await fetch(`/api/fh/quotes-batch?symbols=${qs}`);
const data = await res.json();
if (cancelled) return;
const out: Record<string, Stock> = {};
const quotes = data?.quotes ?? {};
for (const tk of missingTickers) out[tk] = buildMinimalStock(tk, quotes[tk]);
setExtra(out);
}catch (e) {
// eslint-disable-next-line no-console
console.warn("Failed to load favorite quotes:", e);
} finally {
if (!cancelled) setLoading(false);
}
}
run();
return () => { cancelled = true; };
}, [missingTickers]);


const favoriteStocks: Stock[] = useMemo(() => {
const map: Record<string, Stock> = {};
for (const s of storeItems) map[s.ticker] = s;
for (const tk of Object.keys(extra)) map[tk] = extra[tk];
return favorites.map((tk) => map[tk]).filter(Boolean) as Stock[];
}, [favorites, storeItems, extra]);


return (
<motion.div className={layout.page} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
<div className={layout.container}>
<h2>{t("yourFavorites")}</h2>


{favoriteStocks.length > 0 && (
<button onClick={clearFavorites} style={{ marginBottom: "1rem" }}>🧹 {t("clearFavorites")}</button>
)}


{favoriteStocks.length > 0 ? (
<StockList stocks={favoriteStocks} />
) : (
<p>{loading ? "Loading…" : t("noFavorites")}</p>
)}
</div>
</motion.div>
);
};


export default Favorites;