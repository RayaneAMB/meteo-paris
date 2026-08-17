// Adresses lisibles : /meteo/france/paris plutôt qu'un paquet de paramètres.
//
// Schéma :
//   /meteo/{pays}/{ville}          cas normal            → /meteo/japon/tokyo
//   /meteo/{ville}                 pays omis (toléré)    → /meteo/tokyo
//   /meteo/@{lat},{lon}            position sans nom     → /meteo/@48.86,2.35
//   ?ll={lat},{lon}                ancre de précision, ajoutée seulement quand
//                                  le nom seul ne permet pas de retrouver le
//                                  lieu exact (voir README).

// Lettres que la décomposition Unicode (NFD) ne sépare pas de leur signe.
const TRANSLITERATION = {
  ø: 'o',
  æ: 'ae',
  œ: 'oe',
  ß: 'ss',
  đ: 'd',
  ð: 'd',
  þ: 'th',
  ł: 'l',
  ı: 'i',
  ħ: 'h',
  ŋ: 'n'
};

/** « Île-de-France » → « ile-de-france ». */
export function slug(texte) {
  return String(texte ?? '')
    .toLowerCase()
    .replace(/[øæœßđðþłıħŋ]/g, (lettre) => TRANSLITERATION[lettre] ?? lettre)
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '') // retire les accents décomposés
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '');
}

/** « le-caire » → « Le Caire », pour afficher un nom à peu près présentable. */
export function deslug(texte) {
  return String(texte ?? '')
    .split('-')
    .filter(Boolean)
    .map((mot) => mot.charAt(0).toUpperCase() + mot.slice(1))
    .join(' ');
}

// Deux décimales : même précision que celle appliquée par le serveur.
const coord = (valeur) => String(Math.round(valeur * 100) / 100);

/** Adresse canonique d'un lieu. */
export function cheminDeLieu(lieu, { precis = false } = {}) {
  if (!lieu) return '/';

  const ville = slug(lieu.nom);
  const pays = slug(lieu.pays);

  // Sans nom exploitable (« Ma position »), on tombe sur les coordonnées.
  if (!ville || !pays) return `/meteo/@${coord(lieu.lat)},${coord(lieu.lon)}`;

  const chemin = `/meteo/${pays}/${ville}`;
  return precis ? `${chemin}?ll=${coord(lieu.lat)},${coord(lieu.lon)}` : chemin;
}

function paireDeCoordonnees(texte) {
  const [lat, lon] = String(texte ?? '')
    .split(',')
    .map((valeur) => Number(valeur.trim()));

  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

/**
 * Analyse l'adresse courante.
 * Renvoie null si ce n'est pas une route de lieu (l'appelant décide alors quoi
 * afficher). Rien n'est jamais utilisé sans validation : une adresse est une
 * saisie utilisateur comme une autre.
 */
export function lireChemin(pathname, search = '') {
  let segments;
  try {
    segments = decodeURIComponent(pathname).split('/').filter(Boolean);
  } catch {
    return null; // pourcentage mal encodé dans l'adresse
  }

  if (segments[0] !== 'meteo' || segments.length < 2) return null;
  const reste = segments.slice(1);

  if (reste[0].startsWith('@')) {
    const point = paireDeCoordonnees(reste[0].slice(1));
    return point ? { type: 'coordonnees', ...point } : null;
  }

  const aDeuxSegments = reste.length >= 2;
  const villeSlug = slug(aDeuxSegments ? reste[1] : reste[0]);
  if (!villeSlug) return null;

  let precision = null;
  try {
    precision = paireDeCoordonnees(new URLSearchParams(search).get('ll'));
  } catch {
    precision = null;
  }

  return {
    type: 'nom',
    paysSlug: aDeuxSegments ? slug(reste[0]) : null,
    villeSlug,
    nomAffichable: deslug(aDeuxSegments ? reste[1] : reste[0]),
    precision
  };
}

/**
 * Ancien format d'adresse (#lat=...&lon=...&nom=...).
 * Conservé pour que les liens déjà enregistrés en favori continuent d'ouvrir la
 * bonne ville ; ils sont réécrits au format propre dès l'arrivée.
 */
export function lireHashHerite(hash) {
  const brut = String(hash ?? '').replace(/^#/, '');
  if (!brut.includes('lat=')) return null;

  const params = new URLSearchParams(brut);
  return {
    nom: params.get('nom'),
    pays: params.get('pays'),
    codePays: params.get('codePays'),
    region: params.get('region'),
    lat: params.get('lat'),
    lon: params.get('lon')
  };
}
