export class BoundedCache<K, V> {
  readonly #values = new Map<K, V>();

  public constructor(private readonly maxEntries: number) {
    if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
      throw new RangeError("maxEntries must be a positive integer");
    }
  }

  public get size(): number {
    return this.#values.size;
  }

  public get(key: K): V | undefined {
    const value = this.#values.get(key);
    if (value === undefined) {
      return undefined;
    }
    this.#values.delete(key);
    this.#values.set(key, value);
    return value;
  }

  public set(key: K, value: V): void {
    this.#values.delete(key);
    this.#values.set(key, value);
    while (this.#values.size > this.maxEntries) {
      const oldest = this.#values.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.#values.delete(oldest);
    }
  }

  public delete(key: K): boolean {
    return this.#values.delete(key);
  }

  public clear(): void {
    this.#values.clear();
  }
}
