'use strict';

/**
 * Table des codes météo WMO 4677 renvoyés par Open-Meteo.
 *
 * `icon` est une clé d'icône dessinée côté navigateur (public/icons.js) :
 * comme ça, aucune image n'est téléchargée depuis un serveur tiers.
 * `severe` sert à afficher un bandeau d'alerte pour les orages et la grêle.
 */
const WEATHER_CODES = {
  0: { label: 'Ciel dégagé', icon: 'clear' },
  1: { label: 'Principalement dégagé', icon: 'mostly-clear' },
  2: { label: 'Partiellement nuageux', icon: 'partly-cloudy' },
  3: { label: 'Couvert', icon: 'overcast' },
  45: { label: 'Brouillard', icon: 'fog' },
  48: { label: 'Brouillard givrant', icon: 'fog' },
  51: { label: 'Bruine légère', icon: 'drizzle' },
  53: { label: 'Bruine modérée', icon: 'drizzle' },
  55: { label: 'Bruine dense', icon: 'drizzle' },
  56: { label: 'Bruine verglaçante légère', icon: 'freezing-rain' },
  57: { label: 'Bruine verglaçante dense', icon: 'freezing-rain' },
  61: { label: 'Pluie faible', icon: 'rain' },
  63: { label: 'Pluie modérée', icon: 'rain' },
  65: { label: 'Pluie forte', icon: 'heavy-rain' },
  66: { label: 'Pluie verglaçante faible', icon: 'freezing-rain' },
  67: { label: 'Pluie verglaçante forte', icon: 'freezing-rain' },
  71: { label: 'Neige faible', icon: 'snow' },
  73: { label: 'Neige modérée', icon: 'snow' },
  75: { label: 'Neige forte', icon: 'heavy-snow' },
  77: { label: 'Grains de neige', icon: 'snow' },
  80: { label: 'Averses faibles', icon: 'showers' },
  81: { label: 'Averses modérées', icon: 'showers' },
  82: { label: 'Averses violentes', icon: 'heavy-rain', severe: true },
  85: { label: 'Averses de neige faibles', icon: 'snow-showers' },
  86: { label: 'Averses de neige fortes', icon: 'heavy-snow', severe: true },
  95: { label: 'Orage', icon: 'thunder', severe: true },
  96: { label: 'Orage et grêle faible', icon: 'thunder-hail', severe: true },
  99: { label: 'Orage et grêle forte', icon: 'thunder-hail', severe: true }
};

const UNKNOWN_CONDITION = { code: null, label: 'Conditions inconnues', icon: 'unknown', severe: false };

/** Traduit un code WMO en objet exploitable par l'interface. */
function describeWeather(code) {
  if (!Number.isFinite(code)) return { ...UNKNOWN_CONDITION };

  const entry = WEATHER_CODES[code];
  if (!entry) return { ...UNKNOWN_CONDITION, code };

  return { code, label: entry.label, icon: entry.icon, severe: entry.severe === true };
}

module.exports = { WEATHER_CODES, describeWeather };
