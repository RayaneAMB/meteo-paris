// Préférences et favoris, conservés dans le navigateur.
//
// Tout est enveloppé dans des try/catch : en navigation privée, ou si le quota
// est atteint, localStorage lève une exception. Une préférence qu'on n'arrive
// pas à sauvegarder ne doit pas casser le site.

const CLE_PREFS = 'meteo-monde:prefs';
const CLE_FAVORIS = 'meteo-monde:favoris';
const MAX_FAVORIS = 14;

const PREFS_DEFAUT = { systeme: 'metric', theme: 'auto', dernierLieu: null };

/** Quelques villes réparties sur le globe, pour un premier lancement non vide. */
export const FAVORIS_DEFAUT = [
  { nom: 'Paris', pays: 'France', codePays: 'FR', region: 'Île-de-France', lat: 48.8566, lon: 2.3522 },
  { nom: 'New York', pays: 'États-Unis', codePays: 'US', region: 'New York', lat: 40.7143, lon: -74.006 },
  { nom: 'Tokyo', pays: 'Japon', codePays: 'JP', region: 'Tokyo', lat: 35.6895, lon: 139.6917 },
  { nom: 'Le Caire', pays: 'Égypte', codePays: 'EG', region: 'Le Caire', lat: 30.0626, lon: 31.2497 },
  { nom: 'Rio de Janeiro', pays: 'Brésil', codePays: 'BR', region: 'Rio de Janeiro', lat: -22.9028, lon: -43.2075 },
  { nom: 'Sydney', pays: 'Australie', codePays: 'AU', region: 'Nouvelle-Galles du Sud', lat: -33.8679, lon: 151.2073 }
];

function lireJson(cle) {
  try {
    const brut = window.localStorage.getItem(cle);
    return brut ? JSON.parse(brut) : null;
  } catch {
    return null;
  }
}

function ecrireJson(cle, valeur) {
  try {
    window.localStorage.setItem(cle, JSON.stringify(valeur));
    return true;
  } catch {
    return false;
  }
}

/**
 * Valide un lieu venant du stockage ou de l'URL.
 *
 * Les données du localStorage et du fragment d'URL sont modifiables par
 * n'importe qui : on ne fait confiance à rien, on revérifie types et bornes.
 */
export function lieuValide(brut) {
  if (!brut || typeof brut !== 'object') return null;

  const lat = Number(brut.lat);
  const lon = Number(brut.lon);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) return null;

  const texte = (valeur, max) => (typeof valeur === 'string' && valeur.trim() ? valeur.trim().slice(0, max) : null);

  return {
    nom: texte(brut.nom, 80) ?? 'Lieu inconnu',
    pays: texte(brut.pays, 60),
    codePays: texte(brut.codePays, 3),
    region: texte(brut.region, 80),
    lat,
    lon
  };
}

export const memeLieu = (a, b) =>
  Boolean(a && b) && Math.abs(a.lat - b.lat) < 0.02 && Math.abs(a.lon - b.lon) < 0.02;

export function lirePrefs() {
  const stockees = lireJson(CLE_PREFS) ?? {};

  return {
    systeme: stockees.systeme === 'imperial' ? 'imperial' : 'metric',
    theme: ['clair', 'sombre', 'auto'].includes(stockees.theme) ? stockees.theme : 'auto',
    dernierLieu: lieuValide(stockees.dernierLieu)
  };
}

export function ecrirePrefs(patch) {
  const prefs = { ...PREFS_DEFAUT, ...lirePrefs(), ...patch };
  return ecrireJson(CLE_PREFS, prefs);
}

export function lireFavoris() {
  const stockes = lireJson(CLE_FAVORIS);
  if (!Array.isArray(stockes)) return FAVORIS_DEFAUT.slice();

  const propres = stockes.map(lieuValide).filter(Boolean).slice(0, MAX_FAVORIS);
  return propres;
}

export function ecrireFavoris(liste) {
  return ecrireJson(CLE_FAVORIS, liste.slice(0, MAX_FAVORIS));
}

export { MAX_FAVORIS };
