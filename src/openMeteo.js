'use strict';

const { describeWeather } = require('./weatherCodes');

// Open-Meteo est gratuit et ne demande aucune clé d'API pour un usage non
// commercial : rien à cacher dans un .env, donc aucun secret à fuiter.
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

const CURRENT_FIELDS = [
  'temperature_2m',
  'relative_humidity_2m',
  'apparent_temperature',
  'is_day',
  'precipitation',
  'weather_code',
  'cloud_cover',
  'pressure_msl',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m'
];

const HOURLY_FIELDS = [
  'temperature_2m',
  'apparent_temperature',
  'relative_humidity_2m',
  'weather_code',
  'precipitation',
  'precipitation_probability',
  'wind_speed_10m',
  'wind_direction_10m',
  'uv_index',
  'visibility',
  'is_day'
];

const DAILY_FIELDS = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'apparent_temperature_max',
  'apparent_temperature_min',
  'sunrise',
  'sunset',
  'uv_index_max',
  'precipitation_sum',
  'precipitation_probability_max',
  'wind_speed_10m_max',
  'wind_gusts_10m_max',
  'wind_direction_10m_dominant'
];

/** Erreur imputable au service distant (indisponible, trop lent, réponse illisible). */
class UpstreamError extends Error {
  constructor(message, { status = 502, code = 'upstream_error', cause } = {}) {
    super(message, { cause });
    this.name = 'UpstreamError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Appelle Open-Meteo avec un délai maximum.
 *
 * L'URL est construite avec URLSearchParams à partir de valeurs déjà validées :
 * impossible pour une entrée utilisateur de détourner la requête vers un autre
 * hôte (pas de SSRF).
 */
async function fetchJson(baseUrl, params, { timeoutMs }) {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  let response;
  try {
    response = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'meteo-monde/2.0 (projet personnel)' },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'error'
    });
  } catch (error) {
    const timedOut = error.name === 'TimeoutError' || error.name === 'AbortError';
    throw new UpstreamError(
      timedOut ? 'Le service météo met trop de temps à répondre.' : 'Service météo injoignable.',
      { status: timedOut ? 504 : 502, code: timedOut ? 'upstream_timeout' : 'upstream_unreachable', cause: error }
    );
  }

  if (!response.ok) {
    // On ne renvoie jamais le corps de la réponse distante au navigateur : il
    // peut contenir des détails d'implémentation inutiles à exposer.
    throw new UpstreamError(`Le service météo a répondu ${response.status}.`, {
      status: response.status === 429 ? 429 : 502,
      code: response.status === 429 ? 'upstream_rate_limited' : 'upstream_error'
    });
  }

  try {
    return await response.json();
  } catch (error) {
    throw new UpstreamError('Réponse illisible du service météo.', { cause: error });
  }
}

const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const str = (value) => (typeof value === 'string' && value.length > 0 ? value : null);

/** Recherche de lieux par nom, partout dans le monde. */
async function searchPlaces(query, { limit = 8, language = 'fr', timeoutMs }) {
  const data = await fetchJson(
    GEOCODING_URL,
    { name: query, count: limit, language, format: 'json' },
    { timeoutMs }
  );

  // Aucun résultat : l'API renvoie un objet sans clé `results`.
  const results = Array.isArray(data.results) ? data.results : [];

  return results
    .filter((place) => num(place.latitude) !== null && num(place.longitude) !== null)
    .map((place) => ({
      id: `${place.latitude.toFixed(4)},${place.longitude.toFixed(4)}`,
      name: str(place.name) ?? 'Lieu sans nom',
      country: str(place.country),
      countryCode: str(place.country_code),
      region: str(place.admin1),
      latitude: place.latitude,
      longitude: place.longitude,
      timezone: str(place.timezone),
      population: num(place.population),
      elevation: num(place.elevation)
    }));
}

/**
 * Dans les tableaux horaires, retrouve l'index de l'heure en cours.
 * Les horodatages sont des chaînes ISO locales ("2026-08-17T19:00"), donc
 * comparables directement dans l'ordre lexicographique.
 */
function findCurrentHourIndex(times, currentTime) {
  if (!Array.isArray(times) || times.length === 0) return 0;
  if (!currentTime) return 0;

  const currentHour = currentTime.slice(0, 13); // "AAAA-MM-JJTHH"
  const index = times.findIndex((time) => typeof time === 'string' && time.slice(0, 13) >= currentHour);
  return index === -1 ? 0 : index;
}

/** Prévisions complètes pour un point du globe : maintenant, 24 h, 7 jours. */
async function getForecast({ latitude, longitude, hours = 24, days = 7, timeoutMs }) {
  const data = await fetchJson(
    FORECAST_URL,
    {
      latitude,
      longitude,
      current: CURRENT_FIELDS.join(','),
      hourly: HOURLY_FIELDS.join(','),
      daily: DAILY_FIELDS.join(','),
      timezone: 'auto',
      forecast_days: days,
      wind_speed_unit: 'kmh',
      temperature_unit: 'celsius',
      precipitation_unit: 'mm'
    },
    { timeoutMs }
  );

  if (!data || typeof data.current !== 'object' || data.current === null) {
    throw new UpstreamError('Données météo incomplètes reçues du service.');
  }

  const current = data.current;
  const hourly = data.hourly ?? {};
  const daily = data.daily ?? {};

  const startIndex = findCurrentHourIndex(hourly.time, current.time);
  const at = (field, index) => num(Array.isArray(hourly[field]) ? hourly[field][index] : null);

  const hourlySeries = [];
  const hourlyTimes = Array.isArray(hourly.time) ? hourly.time : [];
  for (let i = startIndex; i < Math.min(startIndex + hours, hourlyTimes.length); i += 1) {
    hourlySeries.push({
      time: hourlyTimes[i],
      temperature: at('temperature_2m', i),
      apparentTemperature: at('apparent_temperature', i),
      humidity: at('relative_humidity_2m', i),
      precipitation: at('precipitation', i),
      precipitationProbability: at('precipitation_probability', i),
      windSpeed: at('wind_speed_10m', i),
      windDirection: at('wind_direction_10m', i),
      isDay: at('is_day', i) === 1,
      condition: describeWeather(at('weather_code', i))
    });
  }

  const dailyDay = (field, index) => num(Array.isArray(daily[field]) ? daily[field][index] : null);
  const dailyStr = (field, index) => str(Array.isArray(daily[field]) ? daily[field][index] : null);

  const dailySeries = [];
  const dailyTimes = Array.isArray(daily.time) ? daily.time : [];
  for (let i = 0; i < dailyTimes.length; i += 1) {
    dailySeries.push({
      date: dailyTimes[i],
      min: dailyDay('temperature_2m_min', i),
      max: dailyDay('temperature_2m_max', i),
      apparentMin: dailyDay('apparent_temperature_min', i),
      apparentMax: dailyDay('apparent_temperature_max', i),
      sunrise: dailyStr('sunrise', i),
      sunset: dailyStr('sunset', i),
      uvIndexMax: dailyDay('uv_index_max', i),
      precipitationSum: dailyDay('precipitation_sum', i),
      precipitationProbabilityMax: dailyDay('precipitation_probability_max', i),
      windSpeedMax: dailyDay('wind_speed_10m_max', i),
      windGustsMax: dailyDay('wind_gusts_10m_max', i),
      windDirectionDominant: dailyDay('wind_direction_10m_dominant', i),
      condition: describeWeather(dailyDay('weather_code', i))
    });
  }

  return {
    location: {
      latitude: num(data.latitude),
      longitude: num(data.longitude),
      elevation: num(data.elevation),
      timezone: str(data.timezone) ?? 'UTC',
      timezoneAbbreviation: str(data.timezone_abbreviation),
      utcOffsetSeconds: num(data.utc_offset_seconds) ?? 0
    },
    current: {
      time: str(current.time),
      isDay: num(current.is_day) === 1,
      temperature: num(current.temperature_2m),
      apparentTemperature: num(current.apparent_temperature),
      humidity: num(current.relative_humidity_2m),
      precipitation: num(current.precipitation),
      cloudCover: num(current.cloud_cover),
      pressure: num(current.pressure_msl),
      windSpeed: num(current.wind_speed_10m),
      windDirection: num(current.wind_direction_10m),
      windGusts: num(current.wind_gusts_10m),
      // L'indice UV et la visibilité n'existent pas dans `current` : on les
      // prend dans la série horaire, à l'heure en cours.
      uvIndex: at('uv_index', startIndex),
      visibility: at('visibility', startIndex),
      condition: describeWeather(num(current.weather_code))
    },
    hourly: hourlySeries,
    daily: dailySeries,
    units: { temperature: '°C', windSpeed: 'km/h', precipitation: 'mm', pressure: 'hPa', visibility: 'm' },
    fetchedAt: new Date().toISOString()
  };
}

module.exports = { searchPlaces, getForecast, UpstreamError };
