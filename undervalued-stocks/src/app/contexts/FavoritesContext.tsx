import React, { createContext, useContext, useState } from 'react';

const FavoritesContext = createContext([]);

export const FavoritesProvider = ({ children }) => {
  const [favorites, setFavorites] = useState([]);

  const addFavorite = (stock) => {
    setFavorites((prevFavorites) => [...prevFavorites, stock]);
  };

  const removeFavorite = (stockId) => {
    setFavorites((prevFavorites) => prevFavorites.filter(stock => stock.id !== stockId));
  };

  const isFavorite = (stockId) => {
    return favorites.some(stock => stock.id === stockId);
  };

  return (
    <FavoritesContext.Provider value={{ favorites, addFavorite, removeFavorite, isFavorite }}>
      {children}
    </FavoritesContext.Provider>
  );
};

export const useFavorites = () => {
  return useContext(FavoritesContext);
};