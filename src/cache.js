'use strict';

/**
 * Petit cache mémoire avec expiration et taille bornée.
 *
 * Deux raisons d'exister : répondre instantanément quand on rebascule entre
 * deux villes, et rester poli avec l'API gratuite d'Open-Meteo.
 *
 * Éviction : les Map JavaScript conservent l'ordre d'insertion, donc la plus
 * ancienne clé est la première du itérateur.
 */
class TtlCache {
  constructor({ maxEntries = 500 } = {}) {
    this.maxEntries = maxEntries;
    /** @type {Map<string, {value: unknown, expiresAt: number}>} */
    this.store = new Map();
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }

    // Remise en fin de file : les clés consultées récemment survivent plus longtemps.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key, value, ttlMs) {
    if (ttlMs <= 0) return value;

    if (this.store.has(key)) this.store.delete(key);
    else if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }

    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  }

  /** Récupère depuis le cache, sinon exécute `produce()` et mémorise le résultat. */
  async wrap(key, ttlMs, produce) {
    const cached = this.get(key);
    if (cached !== undefined) return { value: cached, cached: true };

    const value = await produce();
    this.set(key, value, ttlMs);
    return { value, cached: false };
  }

  clear() {
    this.store.clear();
  }

  get size() {
    return this.store.size;
  }
}

module.exports = { TtlCache };
