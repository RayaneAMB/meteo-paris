// Conversions d'unités et mise en forme des nombres.
// Le serveur renvoie toujours du métrique ; la conversion se fait ici, à
// l'affichage, pour ne pas invalider le cache quand on change d'unité.

const nombre = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const nombre1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

export const SYSTEMES = {
  metric: { temp: '°C', vent: 'km/h', pluie: 'mm', distance: 'km', pression: 'hPa' },
  imperial: { temp: '°F', vent: 'mph', pluie: 'in', distance: 'mi', pression: 'inHg' }
};

const estNombre = (valeur) => typeof valeur === 'number' && Number.isFinite(valeur);

/** Température : arrondie à l'entier, avec le degré collé au chiffre. */
export function temp(celsius, systeme = 'metric', { unite = false } = {}) {
  if (!estNombre(celsius)) return '--';

  const valeur = systeme === 'imperial' ? celsius * 1.8 + 32 : celsius;
  const arrondi = Math.round(valeur);
  // -0 est un vrai piège en JS : Math.round(-0.4) vaut -0 et s'affiche « -0 ».
  const propre = arrondi === 0 ? 0 : arrondi;
  return unite ? `${nombre.format(propre)}°${systeme === 'imperial' ? 'F' : 'C'}` : `${nombre.format(propre)}°`;
}

/** Température sans le symbole degré (pour les libellés composés). */
export function tempBrute(celsius, systeme = 'metric') {
  if (!estNombre(celsius)) return null;
  return systeme === 'imperial' ? celsius * 1.8 + 32 : celsius;
}

export function vent(kmh, systeme = 'metric') {
  if (!estNombre(kmh)) return '--';
  const valeur = systeme === 'imperial' ? kmh * 0.621371 : kmh;
  return nombre.format(Math.round(valeur));
}

export function pluie(mm, systeme = 'metric') {
  if (!estNombre(mm)) return '--';
  if (systeme === 'imperial') return nombre1.format(Math.round(mm * 0.0393701 * 100) / 100);
  return nombre1.format(mm);
}

export function distance(metres, systeme = 'metric') {
  if (!estNombre(metres)) return '--';
  const valeur = systeme === 'imperial' ? metres * 0.000621371 : metres / 1000;
  return valeur >= 10 ? nombre.format(Math.round(valeur)) : nombre1.format(Math.round(valeur * 10) / 10);
}

export function pression(hPa, systeme = 'metric') {
  if (!estNombre(hPa)) return '--';
  if (systeme === 'imperial') return nombre1.format(Math.round(hPa * 0.02953 * 100) / 100);
  return nombre.format(Math.round(hPa));
}

export function pourcent(valeur) {
  if (!estNombre(valeur)) return '--';
  return nombre.format(Math.round(valeur));
}

const ROSE = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];

const ROSE_LONG = {
  N: 'nord',
  NNE: 'nord-nord-est',
  NE: 'nord-est',
  ENE: 'est-nord-est',
  E: 'est',
  ESE: 'est-sud-est',
  SE: 'sud-est',
  SSE: 'sud-sud-est',
  S: 'sud',
  SSO: 'sud-sud-ouest',
  SO: 'sud-ouest',
  OSO: 'ouest-sud-ouest',
  O: 'ouest',
  ONO: 'ouest-nord-ouest',
  NO: 'nord-ouest',
  NNO: 'nord-nord-ouest'
};

/** Degrés → point cardinal (le vent « vient de » cette direction). */
export function cardinal(degres) {
  if (!estNombre(degres)) return null;
  const index = Math.round((((degres % 360) + 360) % 360) / 22.5) % 16;
  const abrege = ROSE[index];
  return { abrege, long: ROSE_LONG[abrege] };
}

/** « de » ou « d' » selon l'initiale : « de nord-est », mais « d'ouest ». */
export function elision(mot) {
  if (typeof mot !== 'string' || mot.length === 0) return '';
  return /^[aeiouyàâäéèêëîïôöùûü]/i.test(mot) ? `d'${mot}` : `de ${mot}`;
}

/** Échelle de l'OMS pour l'indice UV. */
export function niveauUv(uv) {
  if (!estNombre(uv)) return { libelle: '—', ratio: 0 };

  const ratio = Math.min(1, Math.max(0, uv / 11));
  if (uv < 3) return { libelle: 'faible', ratio };
  if (uv < 6) return { libelle: 'modéré', ratio };
  if (uv < 8) return { libelle: 'élevé', ratio };
  if (uv < 11) return { libelle: 'très élevé', ratio };
  return { libelle: 'extrême', ratio: 1 };
}

/** Ressenti du vent, en mots (échelle de Beaufort simplifiée). */
export function forceVent(kmh) {
  if (!estNombre(kmh)) return null;
  if (kmh < 2) return 'calme';
  if (kmh < 12) return 'légère brise';
  if (kmh < 29) return 'brise modérée';
  if (kmh < 50) return 'vent soutenu';
  if (kmh < 75) return 'vent fort';
  if (kmh < 103) return 'tempête';
  return 'ouragan';
}

/** « à l'instant », « il y a 3 min »... pour l'horodatage de mise à jour. */
export function ilYA(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';

  const secondes = Math.round((Date.now() - date.getTime()) / 1000);
  if (secondes < 45) return "à l'instant";
  if (secondes < 90) return 'il y a 1 min';
  if (secondes < 3600) return `il y a ${Math.round(secondes / 60)} min`;
  if (secondes < 7200) return 'il y a 1 h';
  if (secondes < 86400) return `il y a ${Math.round(secondes / 3600)} h`;
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

/** Durée en heures et minutes (durée du jour). */
export function duree(minutes) {
  if (!estNombre(minutes) || minutes <= 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

/** « 2026-08-17T14:30 » → « 14:30 » (l'heure est déjà locale au lieu). */
export function heureDeIso(iso) {
  return typeof iso === 'string' && iso.length >= 16 ? iso.slice(11, 16) : '--:--';
}

/** Minutes écoulées depuis minuit, à partir d'un horodatage local ISO. */
export function minutesDeIso(iso) {
  if (typeof iso !== 'string' || iso.length < 16) return null;
  const h = Number(iso.slice(11, 13));
  const m = Number(iso.slice(14, 16));
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}
