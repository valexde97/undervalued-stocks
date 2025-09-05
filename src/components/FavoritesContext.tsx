import { createContext, useContext, useState, useEffect, ReactNode } from "react";


type FavoritesContextType = {
favorites: string[];
toggleFavorite: (ticker: string) => void;
clearFavorites: () => void;
};


const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);


export const useFavorites = () => {
const context = useContext(FavoritesContext);
if (!context) {
throw new Error("useFavorites must be used within a FavoritesProvider");
}
return context;
};


export const FavoritesProvider = ({ children }: { children: ReactNode }) => {
const [favorites, setFavorites] = useState<string[]>([]);


useEffect(() => {
const stored = localStorage.getItem("favorites");
if (stored) {
try {
const parsed = JSON.parse(stored);
if (Array.isArray(parsed)) {
setFavorites(parsed);
}
} catch (e) {
console.error("Failed to parse favorites from localStorage", e);
}
}
}, []);


useEffect(() => {
localStorage.setItem("favorites", JSON.stringify(favorites));
}, [favorites]);


const toggleFavorite = (ticker: string) => {
setFavorites((prev) => (prev.includes(ticker) ? prev.filter((t) => t !== ticker) : [...prev, ticker]));
};


const clearFavorites = () => {
setFavorites([]);
};


return (
<FavoritesContext.Provider value={{ favorites, toggleFavorite, clearFavorites }}>
{children}
</FavoritesContext.Provider>
);
};