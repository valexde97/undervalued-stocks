import { PrimaryButton } from '../components/PrimaryButton';

export const Home = () => {
  const handleSearch = () => {
    alert("Searching for undervalued stocks...");
  };

  return (
    <>
      <h2>Welcome!</h2>
      <p>Click the button below to search for undervalued stocks.</p>
      <PrimaryButton text="Find Undervalued Stocks" onClick={handleSearch} />
    </>
  );
};