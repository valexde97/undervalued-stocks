type PrimaryButtonProps = {
  text: string;
  onClick: () => void;
};

export const PrimaryButton = ({text, onClick}: PrimaryButtonProps) => (
  <button onClick={onClick} style={{padding: '1rem 2rem', fontSize: '1rem', cursor: 'pointer' }}>
    {text}
  </button>
);