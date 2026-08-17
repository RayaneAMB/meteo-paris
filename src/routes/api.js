'use strict';

const express = require('express');
const { TtlCache } = require('../cache');
const { searchPlaces, getForecast, UpstreamError } = require('../openMeteo');

const MAX_QUERY_LENGTH = 80;
const MAX_SEARCH_RESULTS = 10;

/** Erreur de saisie : la requête du navigateur est en cause, pas le service distant. */
class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
    this.code = 'invalid_request';
    this.field = field;
  }
}

/**
 * Nettoie le texte de recherche.
 *
 * On refuse les caractères de contrôle et on borne la longueur : la valeur part
 * ensuite dans une requête HTTP, autant ne laisser passer que du texte normal.
 */
function parseQuery(raw) {
  if (typeof raw !== 'string') throw new ValidationError('Paramètre « q » manquant.', 'q');

  // Caractères de contrôle (CR, LF, tabulations...) remplacés par une espace,
  // puis espaces multiples réduites.
  const cleaned = raw
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length === 0) throw new ValidationError('Le nom de lieu est vide.', 'q');
  if (cleaned.length > MAX_QUERY_LENGTH) {
    throw new ValidationError(`Le nom de lieu dépasse ${MAX_QUERY_LENGTH} caractères.`, 'q');
  }

  return cleaned;
}

function parseCoordinate(raw, { field, min, max }) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new ValidationError(`Paramètre « ${field} » manquant.`, field);
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new ValidationError(`« ${field} » doit être un nombre entre ${min} et ${max}.`, field);
  }

  // Arrondi à 2 décimales (~1 km) : la résolution des modèles météo est bien
  // plus grossière que ça, et on évite d'envoyer une position GPS exacte à un
  // service tiers. Effet de bord utile : le cache est mutualisé entre voisins.
  return Math.round(value * 100) / 100;
}

function parseLimit(raw) {
  if (raw === undefined) return 8;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > MAX_SEARCH_RESULTS) {
    throw new ValidationError(`« limit » doit être un entier entre 1 et ${MAX_SEARCH_RESULTS}.`, 'limit');
  }
  return value;
}

/**
 * Construit le routeur /api.
 *
 * Les clients HTTP sont injectés pour que les tests puissent brancher un faux
 * service sans toucher au réseau.
 */
function createApiRouter({ config, client = { searchPlaces, getForecast } } = {}) {
  const router = express.Router();
  const cache = new TtlCache({ maxEntries: config.cache.maxEntries });
  const timeoutMs = config.upstream.timeoutMs;

  router.get('/health', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ status: 'ok', uptime: Math.round(process.uptime()) });
  });

  router.get('/search', async (req, res, next) => {
    try {
      const query = parseQuery(req.query.q);
      const limit = parseLimit(req.query.limit);

      const { value, cached } = await cache.wrap(
        `search:${limit}:${query.toLowerCase()}`,
        config.cache.searchTtlMs,
        () => client.searchPlaces(query, { limit, timeoutMs })
      );

      res.setHeader('Cache-Control', 'public, max-age=600');
      res.setHeader('X-Cache', cached ? 'HIT' : 'MISS');
      res.json({ query, results: value });
    } catch (error) {
      next(error);
    }
  });

  router.get('/weather', async (req, res, next) => {
    try {
      const latitude = parseCoordinate(req.query.lat, { field: 'lat', min: -90, max: 90 });
      const longitude = parseCoordinate(req.query.lon, { field: 'lon', min: -180, max: 180 });

      const { value, cached } = await cache.wrap(
        `weather:${latitude},${longitude}`,
        config.cache.weatherTtlMs,
        () => client.getForecast({ latitude, longitude, timeoutMs })
      );

      // « private » : la réponse dépend d'une position, elle n'a rien à faire
      // dans un cache partagé.
      res.setHeader('Cache-Control', 'private, max-age=120');
      res.setHeader('X-Cache', cached ? 'HIT' : 'MISS');
      res.json(value);
    } catch (error) {
      next(error);
    }
  });

  // Toute autre route sous /api répond en JSON, pas en HTML.
  router.use((req, res) => {
    res.status(404).json({ error: 'not_found', message: 'Cette route d’API n’existe pas.' });
  });

  router.clearCache = () => cache.clear();

  return router;
}

module.exports = { createApiRouter, ValidationError, UpstreamError };
