type HeaderProps = {
  title: string;
};

export const Header = ({title}:HeaderProps) => (
  <header style={{ padding: '1rem', backgroundColor: '#333', color: '#fff' }}>
    <h1>{title} (Coming soon...)</h1>
  </header>
);