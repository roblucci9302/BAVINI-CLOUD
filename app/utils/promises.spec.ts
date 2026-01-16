import { describe, it, expect } from 'vitest';
import { withResolvers } from './promises';

describe('withResolvers', () => {
  it('should return an object with promise, resolve, and reject', () => {
    const result = withResolvers<string>();

    expect(result).toHaveProperty('promise');
    expect(result).toHaveProperty('resolve');
    expect(result).toHaveProperty('reject');
    expect(result.promise).toBeInstanceOf(Promise);
    expect(typeof result.resolve).toBe('function');
    expect(typeof result.reject).toBe('function');
  });

  it('should resolve the promise when resolve is called', async () => {
    const { promise, resolve } = withResolvers<string>();

    resolve('test value');

    await expect(promise).resolves.toBe('test value');
  });

  it('should reject the promise when reject is called', async () => {
    const { promise, reject } = withResolvers<string>();

    reject(new Error('test error'));

    await expect(promise).rejects.toThrow('test error');
  });

  it('should work with different types', async () => {
    const numberResolver = withResolvers<number>();
    numberResolver.resolve(42);
    await expect(numberResolver.promise).resolves.toBe(42);

    const objectResolver = withResolvers<{ foo: string }>();
    objectResolver.resolve({ foo: 'bar' });
    await expect(objectResolver.promise).resolves.toEqual({ foo: 'bar' });

    const arrayResolver = withResolvers<number[]>();
    arrayResolver.resolve([1, 2, 3]);
    await expect(arrayResolver.promise).resolves.toEqual([1, 2, 3]);
  });

  it('should handle void type', async () => {
    const { promise, resolve } = withResolvers<void>();

    resolve();

    await expect(promise).resolves.toBeUndefined();
  });

  it('should reject with any error type', async () => {
    const { promise, reject } = withResolvers<string>();

    reject('string error');

    await expect(promise).rejects.toBe('string error');
  });
});
