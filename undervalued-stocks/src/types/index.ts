// filepath: c:\Users\lasco\OneDrive\Desktop\InvApp\undervalued-stocks\src\types\index.ts
export interface Stock {
    ticker: string;
    companyName: string;
    price: number;
    priceHistory: PriceHistory[];
}

export interface PriceHistory {
    date: string;
    price: number;
}

export interface ApiResponse {
    data: Stock[];
    status: string;
}

export interface FavoritesContextType {
    favorites: Stock[];
    addFavorite: (stock: Stock) => void;
    removeFavorite: (ticker: string) => void;
}

export interface ThemeContextType {
    theme: string;
    toggleTheme: () => void;
}

export interface LanguageContextType {
    language: string;
    setLanguage: (lang: string) => void;
}