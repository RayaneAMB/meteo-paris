'use strict';

// Charge le fichier .env s'il existe. Aucune variable n'est obligatoire :
// l'application fonctionne telle quelle, avec les valeurs par défaut ci-dessous.
require('dotenv').config({ quiet: true });

/**
 * Lit une variable d'environnement entière en refusant les valeurs absurdes,
 * plutôt que de laisser un NaN se propager jusqu'au serveur.
 */
function readInt(name, fallback, { min, max }) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;

  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(
      `Variable d'environnement invalide : ${name}="${raw}" (entier attendu entre ${min} et ${max})`
    );
  }
  return value;
}

function readBool(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  if (['1', 'true', 'yes', 'oui'].includes(raw.toLowerCase())) return true;
  if (['0', 'false', 'no', 'non'].includes(raw.toLowerCase())) return false;
  throw new Error(`Variable d'environnement invalide : ${name}="${raw}" (true ou false attendu)`);
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: readInt('PORT', 3000, { min: 1, max: 65535 }),

  // On écoute sur la boucle locale par défaut : le serveur n'est pas exposé au
  // réseau tant que l'utilisateur ne le demande pas explicitement.
  host: process.env.HOST || '127.0.0.1',

  // À activer uniquement derrière un reverse proxy de confiance (nginx, Caddy...).
  // Sinon n'importe qui pourrait usurper son IP via X-Forwarded-For et contourner
  // la limite de débit.
  trustProxy: readBool('TRUST_PROXY', false),

  rateLimit: {
    windowMs: readInt('RATE_LIMIT_WINDOW_MS', 60_000, { min: 1_000, max: 3_600_000 }),
    max: readInt('RATE_LIMIT_MAX', 60, { min: 1, max: 100_000 }),
    maxTrackedClients: readInt('RATE_LIMIT_MAX_CLIENTS', 10_000, { min: 100, max: 1_000_000 })
  },

  upstream: {
    timeoutMs: readInt('UPSTREAM_TIMEOUT_MS', 8_000, { min: 500, max: 60_000 })
  },

  cache: {
    weatherTtlMs: readInt('CACHE_WEATHER_TTL_MS', 5 * 60_000, { min: 0, max: 3_600_000 }),
    searchTtlMs: readInt('CACHE_SEARCH_TTL_MS', 60 * 60_000, { min: 0, max: 24 * 3_600_000 }),
    maxEntries: readInt('CACHE_MAX_ENTRIES', 500, { min: 1, max: 100_000 })
  }
};

module.exports = config;
