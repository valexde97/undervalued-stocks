export const Home = () => {
  const handleSearch = () => {
    alert("Searching undervalued stocks...");
  };

  return (
    <>
      <h2>Welcome!</h2>
      <p>Press the button, to find undervalued stocks.</p>
      <button onClick={handleSearch}>Search stocks</button>
    </>
  );
};