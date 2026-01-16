import { describe, it, expect } from 'vitest';
import { greet } from './greet';

describe('greet', () => {
  it('retourne un message de salutation correct', () => {
    const result = greet('Alice');
    expect(result).toBe('Bonjour, Alice ! 👋');
  });

  it('fonctionne avec différents noms', () => {
    expect(greet('Bob')).toContain('Bob');
    expect(greet('Charlie')).toContain('Charlie');
  });

  it('lance une erreur si le nom est vide', () => {
    expect(() => greet('')).toThrow('Le nom ne peut pas être vide');
  });

  it('lance une erreur si le nom ne contient que des espaces', () => {
    expect(() => greet('   ')).toThrow('Le nom ne peut pas être vide');
  });
});
