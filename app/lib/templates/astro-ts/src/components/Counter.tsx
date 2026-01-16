import { useState } from 'react';

interface CounterProps {
  initialCount?: number;
}

export default function Counter({ initialCount = 0 }: CounterProps) {
  const [count, setCount] = useState(initialCount);

  return (
    <div className="counter">
      <p>Compteur: {count}</p>
      <div className="buttons">
        <button onClick={() => setCount((c) => c - 1)}>-</button>
        <button onClick={() => setCount((c) => c + 1)}>+</button>
      </div>
      <style>{`
        .counter {
          padding: 1rem;
          border: 1px solid #ddd;
          border-radius: 8px;
          display: inline-block;
        }
        .buttons {
          display: flex;
          gap: 0.5rem;
          margin-top: 0.5rem;
        }
        button {
          padding: 0.5rem 1rem;
          font-size: 1.2rem;
          cursor: pointer;
          border: 1px solid #ddd;
          border-radius: 4px;
          background: #f5f5f5;
        }
        button:hover {
          background: #e0e0e0;
        }
      `}</style>
    </div>
  );
}
