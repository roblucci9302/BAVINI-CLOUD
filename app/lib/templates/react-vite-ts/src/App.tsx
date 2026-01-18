import { useState } from 'react';

/**
 * Composant principal de l'application
 */
export default function App() {
  const [count, setCount] = useState(0);

  const handleIncrement = (): void => {
    setCount((prev) => prev + 1);
  };

  return (
    <main className="app">
      <h1>{{ PROJECT_NAME }}</h1>
      <p>Compteur : {count}</p>
      <button onClick={handleIncrement} type="button">
        Incrémenter
      </button>
    </main>
  );
}
