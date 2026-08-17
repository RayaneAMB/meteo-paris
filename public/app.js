// Point d'entrée du site : état, événements, appels à l'API locale.
// Le rendu du DOM est délégué à render.js, la mise en forme à format.js.

import { weatherIcon, uiIcon } from './icons.js';
import * as f from './format.js';
import { appliquerCiel, rendreTuiles, rendreHoraire, rendreJours } from './render.js';
import { slug, deslug, cheminDeLieu, lireChemin, lireHashHerite } from './routes.js';
import {
  lirePrefs,
  ecrirePrefs,
  lireFavoris,
  ecrireFavoris,
  lieuValide,
  memeLieu,
  MAX_FAVORIS
} from './store.js';

const $ = (id) => document.getElementById(id);

const el = {
  racine: document.documentElement,
  recherche: $('recherche'),
  effacer: $('effacer'),
  spinner: $('finder-spinner'),
  suggestions: $('suggestions'),
  favorisList: $('favoris-list'),
  maPosition: $('ma-position'),
  theme: $('theme'),
  uniteMetric: $('unite-metric'),
  uniteImperial: $('unite-imperial'),
  board: $('board'),
  alerte: $('alerte'),
  erreur: $('erreur'),
  erreurTexte: $('erreur-texte'),
  reessayer: $('reessayer'),
  rafraichir: $('rafraichir'),
  placeNom: $('place-nom'),
  placeRegion: $('place-region'),
  placePays: $('place-pays'),
  placeHeure: $('place-heure'),
  favoriToggle: $('favori-toggle'),
  heroIcone: $('hero-icone'),
  heroTemp: $('hero-temp'),
  heroUnite: $('hero-unite'),
  heroCondition: $('hero-condition'),
  heroRessenti: $('hero-ressenti'),
  heroMax: $('hero-max'),
  heroMin: $('hero-min'),
  tuilesGrid: $('tuiles-grid'),
  horaireInner: $('horaire-inner'),
  joursList: $('jours-list'),
  maj: $('maj'),
  annonce: $('annonce')
};

const LIEU_DEFAUT = {
  nom: 'Paris',
  pays: 'France',
  codePays: 'FR',
  region: 'Île-de-France',
  lat: 48.8566,
  lon: 2.3522
};

const prefs = lirePrefs();

const etat = {
  systeme: prefs.systeme,
  theme: prefs.theme,
  lieu: null,
  meteo: null,
  favoris: lireFavoris(),
  premierChargement: true,
  chargement: false,
  /** @type {AbortController|null} */ requeteMeteo: null,
  /** @type {AbortController|null} */ requeteSuggestions: null,
  suggestions: [],
  indexActif: -1,
  minuteurClock: null,
  minuteurSuggestions: null
};

/* --------------------------------------------------------------- Utilitaires */

function annoncer(message) {
  el.annonce.textContent = message;
}

/** Un fetch qui échoue proprement : message lisible, jamais de détail technique brut. */
async function appelApi(chemin, signal) {
  const reponse = await fetch(chemin, { signal, headers: { accept: 'application/json' } });

  let donnees = null;
  try {
    donnees = await reponse.json();
  } catch {
    throw new Error('Réponse illisible du serveur.');
  }

  if (!reponse.ok) {
    const message =
      typeof donnees?.message === 'string' && donnees.message.length < 300
        ? donnees.message
        : `Le serveur a répondu ${reponse.status}.`;
    throw new Error(message);
  }
  return donnees;
}

/* -------------------------------------------------------------------- Thème */

const CYCLE_THEME = ['auto', 'clair', 'sombre'];
const GLYPHE_THEME = { auto: 'auto', clair: 'soleil', sombre: 'lune' };
const LIBELLE_THEME = { auto: 'automatique', clair: 'clair', sombre: 'sombre' };

const prefereSombre = window.matchMedia('(prefers-color-scheme: dark)');

function appliquerTheme() {
  const resolu = etat.theme === 'auto' ? (prefereSombre.matches ? 'dark' : 'light') : etat.theme === 'sombre' ? 'dark' : 'light';

  el.racine.dataset.theme = etat.theme;
  el.racine.dataset.resolvedTheme = resolu;
  $('glyph-theme').innerHTML = uiIcon(GLYPHE_THEME[etat.theme]);
  el.theme.title = `Thème : ${LIBELLE_THEME[etat.theme]}`;
}

prefereSombre.addEventListener('change', () => {
  if (etat.theme === 'auto') appliquerTheme();
});

el.theme.addEventListener('click', () => {
  const suivant = CYCLE_THEME[(CYCLE_THEME.indexOf(etat.theme) + 1) % CYCLE_THEME.length];
  etat.theme = suivant;
  ecrirePrefs({ theme: suivant });
  appliquerTheme();
  annoncer(`Thème ${LIBELLE_THEME[suivant]}`);
});

/* -------------------------------------------------------------------- Unités */

function appliquerUnites() {
  const metrique = etat.systeme === 'metric';
  el.uniteMetric.classList.toggle('is-active', metrique);
  el.uniteImperial.classList.toggle('is-active', !metrique);
  el.uniteMetric.setAttribute('aria-pressed', String(metrique));
  el.uniteImperial.setAttribute('aria-pressed', String(!metrique));
}

function changerSysteme(systeme) {
  if (etat.systeme === systeme) return;
  etat.systeme = systeme;
  ecrirePrefs({ systeme });
  appliquerUnites();
  // Les données sont déjà là : un simple nouveau rendu suffit, pas de requête.
  if (etat.meteo) rendreTout();
}

el.uniteMetric.addEventListener('click', () => changerSysteme('metric'));
el.uniteImperial.addEventListener('click', () => changerSysteme('imperial'));

/* ------------------------------------------------------------------ Favoris */

function estFavori(lieu) {
  return etat.favoris.some((favori) => memeLieu(favori, lieu));
}

function rendreFavoris() {
  // Deux boutons côte à côte dans le <li> : imbriquer un bouton dans un autre
  // serait du HTML invalide.
  const puces = etat.favoris.map((favori) => {
    const li = document.createElement('li');
    li.className = `puce${memeLieu(favori, etat.lieu) ? ' is-active' : ''}`;

    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = 'puce__nom';
    bouton.textContent = favori.nom; // textContent : aucun risque d'injection
    bouton.addEventListener('click', () => chargerLieu(favori, { empiler: true }));

    const retirer = document.createElement('button');
    retirer.type = 'button';
    retirer.className = 'puce__retirer';
    retirer.textContent = '✕';
    retirer.title = `Retirer ${favori.nom}`;
    retirer.setAttribute('aria-label', `Retirer ${favori.nom} des favoris`);
    retirer.addEventListener('click', () => {
      etat.favoris = etat.favoris.filter((autre) => !memeLieu(autre, favori));
      ecrireFavoris(etat.favoris);
      rendreFavoris();
      majBoutonFavori();
      annoncer(`${favori.nom} retiré des favoris`);
    });

    li.append(bouton, retirer);
    return li;
  });

  el.favorisList.replaceChildren(...puces);
}

function majBoutonFavori() {
  if (!etat.lieu) return;
  const actif = estFavori(etat.lieu);
  el.favoriToggle.hidden = false;
  el.favoriToggle.setAttribute('aria-pressed', String(actif));
  el.favoriToggle.title = actif ? 'Retirer des favoris' : 'Ajouter aux favoris';
  $('glyph-star').innerHTML = uiIcon('etoile');
}

el.favoriToggle.addEventListener('click', () => {
  if (!etat.lieu) return;

  if (estFavori(etat.lieu)) {
    etat.favoris = etat.favoris.filter((favori) => !memeLieu(favori, etat.lieu));
    annoncer(`${etat.lieu.nom} retiré des favoris`);
  } else if (etat.favoris.length >= MAX_FAVORIS) {
    afficherErreur(`Maximum ${MAX_FAVORIS} favoris : retires-en un d'abord.`);
    return;
  } else {
    etat.favoris = [...etat.favoris, etat.lieu];
    annoncer(`${etat.lieu.nom} ajouté aux favoris`);
  }

  ecrireFavoris(etat.favoris);
  rendreFavoris();
  majBoutonFavori();
});

/* --------------------------------------------------------------- Suggestions */

function fermerSuggestions() {
  el.suggestions.hidden = true;
  el.suggestions.replaceChildren();
  el.recherche.setAttribute('aria-expanded', 'false');
  el.recherche.removeAttribute('aria-activedescendant');
  etat.suggestions = [];
  etat.indexActif = -1;
}

function surlignerSuggestion(index) {
  const options = [...el.suggestions.querySelectorAll('.suggestion')];
  options.forEach((option, i) => option.classList.toggle('is-active', i === index));
  etat.indexActif = index;

  if (index >= 0 && options[index]) {
    el.recherche.setAttribute('aria-activedescendant', options[index].id);
    options[index].scrollIntoView({ block: 'nearest' });
  } else {
    el.recherche.removeAttribute('aria-activedescendant');
  }
}

function rendreSuggestions(resultats) {
  etat.suggestions = resultats;
  el.suggestions.replaceChildren();

  if (resultats.length === 0) {
    const vide = document.createElement('li');
    vide.className = 'suggestions__vide';
    vide.textContent = 'Aucun lieu trouvé. Vérifie l’orthographe.';
    el.suggestions.append(vide);
    el.suggestions.hidden = false;
    el.recherche.setAttribute('aria-expanded', 'true');
    return;
  }

  resultats.forEach((lieu, index) => {
    const li = document.createElement('li');
    li.className = 'suggestion';
    li.id = `suggestion-${index}`;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', 'false');

    const colonne = document.createElement('div');
    colonne.className = 'suggestion__col';

    const nom = document.createElement('span');
    nom.className = 'suggestion__nom';
    nom.textContent = lieu.name;

    const detail = document.createElement('span');
    detail.className = 'suggestion__lieu';
    detail.textContent = [lieu.region, lieu.country].filter(Boolean).join(', ');

    colonne.append(nom, detail);
    li.append(colonne);

    if (lieu.countryCode) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = lieu.countryCode;
      li.append(badge);
    }

    li.addEventListener('mousedown', (evenement) => {
      evenement.preventDefault(); // garde le focus dans le champ
      choisirSuggestion(index);
    });
    li.addEventListener('mouseenter', () => surlignerSuggestion(index));

    el.suggestions.append(li);
  });

  el.suggestions.hidden = false;
  el.recherche.setAttribute('aria-expanded', 'true');
  surlignerSuggestion(-1);
}

function choisirSuggestion(index) {
  const brut = etat.suggestions[index];
  if (!brut) return;

  const lieu = lieuValide({
    nom: brut.name,
    pays: brut.country,
    codePays: brut.countryCode,
    region: brut.region,
    lat: brut.latitude,
    lon: brut.longitude
  });
  if (!lieu) return;

  el.recherche.value = '';
  el.effacer.hidden = true;
  fermerSuggestions();
  el.recherche.blur();
  chargerLieu(lieu, { empiler: true });
}

async function chercher(texte) {
  etat.requeteSuggestions?.abort();
  const controleur = new AbortController();
  etat.requeteSuggestions = controleur;
  el.spinner.hidden = false;

  try {
    const donnees = await appelApi(`/api/search?q=${encodeURIComponent(texte)}&limit=8`, controleur.signal);
    if (controleur.signal.aborted) return;
    rendreSuggestions(Array.isArray(donnees.results) ? donnees.results : []);
  } catch (erreur) {
    if (erreur.name === 'AbortError') return;
    rendreSuggestions([]);
  } finally {
    if (etat.requeteSuggestions === controleur) {
      el.spinner.hidden = true;
      etat.requeteSuggestions = null;
    }
  }
}

el.recherche.addEventListener('input', () => {
  const texte = el.recherche.value.trim();
  el.effacer.hidden = texte.length === 0;

  clearTimeout(etat.minuteurSuggestions);
  if (texte.length < 2) {
    etat.requeteSuggestions?.abort();
    el.spinner.hidden = true;
    fermerSuggestions();
    return;
  }

  // Anti-rebond : on attend que la frappe se calme avant d'interroger le serveur.
  etat.minuteurSuggestions = setTimeout(() => chercher(texte), 260);
});

el.recherche.addEventListener('keydown', (evenement) => {
  const nombre = etat.suggestions.length;

  switch (evenement.key) {
    case 'ArrowDown':
      if (nombre === 0) return;
      evenement.preventDefault();
      surlignerSuggestion((etat.indexActif + 1) % nombre);
      break;
    case 'ArrowUp':
      if (nombre === 0) return;
      evenement.preventDefault();
      surlignerSuggestion(etat.indexActif <= 0 ? nombre - 1 : etat.indexActif - 1);
      break;
    case 'Enter':
      if (nombre === 0) return;
      evenement.preventDefault();
      choisirSuggestion(etat.indexActif >= 0 ? etat.indexActif : 0);
      break;
    case 'Escape':
      fermerSuggestions();
      break;
    default:
      break;
  }
});

el.effacer.addEventListener('click', () => {
  el.recherche.value = '';
  el.effacer.hidden = true;
  fermerSuggestions();
  el.recherche.focus();
});

document.addEventListener('click', (evenement) => {
  if (!evenement.target.closest('.finder')) fermerSuggestions();
});

/* --------------------------------------------------------------- Géolocalisation */

el.maPosition.addEventListener('click', () => {
  if (!('geolocation' in navigator)) {
    afficherErreur("Ton navigateur ne propose pas la géolocalisation.");
    return;
  }

  el.maPosition.disabled = true;
  annoncer('Recherche de ta position…');

  navigator.geolocation.getCurrentPosition(
    (position) => {
      el.maPosition.disabled = false;
      const lieu = lieuValide({
        nom: 'Ma position',
        // Open-Meteo ne propose pas de géocodage inverse : plutôt que d'ajouter
        // un troisième service, on affiche le fuseau horaire renvoyé par la
        // prévision comme repère géographique.
        region: null,
        lat: position.coords.latitude,
        lon: position.coords.longitude
      });
      if (lieu) chargerLieu(lieu, { empiler: true });
    },
    (erreur) => {
      el.maPosition.disabled = false;
      const messages = {
        1: 'Position refusée. Autorise la géolocalisation dans ton navigateur.',
        2: 'Position indisponible pour le moment.',
        3: 'La localisation a pris trop de temps.'
      };
      afficherErreur(messages[erreur.code] ?? 'Impossible de récupérer ta position.');
    },
    { timeout: 10_000, maximumAge: 300_000, enableHighAccuracy: false }
  );
});

/* ------------------------------------------------------------------- Erreurs */

function afficherErreur(message) {
  el.erreurTexte.textContent = message;
  el.erreur.hidden = false;
  annoncer(message);
}

function cacherErreur() {
  el.erreur.hidden = true;
}

el.reessayer.addEventListener('click', () => {
  cacherErreur();
  if (etat.lieu) chargerLieu(etat.lieu, { forcer: true });
});

el.rafraichir.addEventListener('click', () => {
  if (etat.lieu) chargerLieu(etat.lieu, { forcer: true });
});

/* -------------------------------------------------------------------- Rendu */

const SQUELETTES = ['place-nom', 'hero-temp', 'hero-condition'];

function marquerChargement(actif) {
  etat.chargement = actif;
  el.board.setAttribute('aria-busy', String(actif));

  if (etat.premierChargement) {
    SQUELETTES.forEach((id) => $(id).classList.toggle('squelette', actif));
  } else {
    el.board.classList.toggle('is-stale', actif);
  }
}

/** Horloge du lieu affiché, recalculée dans son propre fuseau horaire. */
function demarrerHorloge(fuseau) {
  clearInterval(etat.minuteurClock);

  const formateur = new Intl.DateTimeFormat('fr-FR', {
    timeZone: fuseau,
    hour: '2-digit',
    minute: '2-digit'
  });

  const battement = () => {
    try {
      el.placeHeure.textContent = formateur.format(new Date());
    } catch {
      el.placeHeure.textContent = '--:--';
    }
  };

  battement();
  etat.minuteurClock = setInterval(battement, 15_000);
}

function rendreTout() {
  const meteo = etat.meteo;
  const lieu = etat.lieu;
  if (!meteo || !lieu) return;

  const actuel = meteo.current;
  const jour = meteo.daily[0] ?? {};
  const unites = f.SYSTEMES[etat.systeme];

  el.placeNom.textContent = lieu.nom;
  el.placeRegion.textContent = [lieu.region, lieu.pays].filter(Boolean).join(', ') || meteo.location.timezone;
  el.placePays.hidden = !lieu.codePays;
  if (lieu.codePays) el.placePays.textContent = lieu.codePays;

  el.heroIcone.innerHTML = weatherIcon(actuel.condition?.icon, actuel.isDay);
  el.heroTemp.textContent = f.temp(actuel.temperature, etat.systeme).replace('°', '');
  el.heroUnite.textContent = unites.temp;
  el.heroCondition.textContent = actuel.condition?.label ?? '—';
  el.heroRessenti.textContent = f.temp(actuel.apparentTemperature, etat.systeme);
  el.heroMax.textContent = f.temp(jour.max, etat.systeme);
  el.heroMin.textContent = f.temp(jour.min, etat.systeme);

  appliquerCiel(actuel.condition, actuel.isDay);
  demarrerHorloge(meteo.location.timezone);

  rendreTuiles(el.tuilesGrid, meteo, etat.systeme);
  rendreHoraire(el.horaireInner, meteo, etat.systeme);
  rendreJours(el.joursList, meteo, etat.systeme);

  // Bandeau d'alerte : uniquement pour les phénomènes marqués « severe »
  // (orages, grêle, averses violentes) dans les prochaines heures.
  const severeMaintenant = actuel.condition?.severe;
  const severeBientot = meteo.hourly.slice(0, 12).find((heure) => heure.condition?.severe);

  if (severeMaintenant || severeBientot) {
    el.alerte.hidden = false;
    el.alerte.textContent = severeMaintenant
      ? `⚡ ${actuel.condition.label} en cours sur ${lieu.nom}.`
      : `⚡ ${severeBientot.condition.label} prévu vers ${f.heureDeIso(severeBientot.time)}.`;
  } else {
    el.alerte.hidden = true;
    el.alerte.textContent = '';
  }

  el.maj.textContent = f.ilYA(meteo.fetchedAt);

  // Titre d'onglet utile : lisible dans les favoris et l'historique.
  document.title = `${lieu.nom} ${f.temp(actuel.temperature, etat.systeme)} — Météo Monde`;

  rendreFavoris();
  majBoutonFavori();
}

/* ------------------------------------------------------------------ Adresses */

/**
 * Écrit l'adresse du lieu affiché.
 *
 * `empiler` ajoute une entrée d'historique (choix d'une ville : les flèches
 * précédent/suivant du navigateur fonctionnent alors). Une simple actualisation
 * remplace l'entrée courante.
 */
function ecrireUrl(lieu, { empiler = false, precis = false } = {}) {
  const cible = cheminDeLieu(lieu, { precis });
  const actuelle = `${window.location.pathname}${window.location.search}`;
  if (cible === actuelle) return;

  window.history[empiler ? 'pushState' : 'replaceState']({ lieu }, '', cible);
}

/**
 * Retrouve un lieu à partir de son adresse lisible (/meteo/japon/tokyo).
 *
 * Le géocodeur peut renvoyer plusieurs villes homonymes : on privilégie celle
 * dont le nom correspond exactement au segment d'adresse, puis la plus peuplée.
 */
async function resoudreParNom({ paysSlug, villeSlug }, signal) {
  const requete = villeSlug.replace(/-/g, ' ');
  const donnees = await appelApi(`/api/search?q=${encodeURIComponent(requete)}&limit=10`, signal);
  const resultats = Array.isArray(donnees.results) ? donnees.results : [];
  if (resultats.length === 0) return null;

  const duPays = paysSlug
    ? resultats.filter((lieu) => slug(lieu.country) === paysSlug || slug(lieu.countryCode) === paysSlug)
    : resultats;
  const bassin = duPays.length > 0 ? duPays : resultats;

  const exacts = bassin.filter((lieu) => slug(lieu.name) === villeSlug);
  const classes = (exacts.length > 0 ? exacts : bassin).sort(
    (a, b) => (b.population ?? 0) - (a.population ?? 0)
  );
  const choix = classes[0];

  return lieuValide({
    nom: choix.name,
    pays: choix.country,
    codePays: choix.countryCode,
    region: choix.region,
    lat: choix.latitude,
    lon: choix.longitude
  });
}

/**
 * Certains noms ne se retrouvent pas à partir de leur seule version sans
 * accents : « Reykjahlíð » devient « reykjahlid », que le géocodeur ne connaît
 * pas. Dans ce cas seulement, on ancre l'adresse avec les coordonnées (?ll=),
 * pour qu'un lien partagé ouvre toujours le bon endroit.
 */
// Tolérance volontairement plus large que celle des favoris : deux bases de
// données ne placent pas le centre d'une grande ville au même endroit (quelques
// kilomètres d'écart pour Rio de Janeiro, par exemple). À cette échelle la météo
// est identique — et le serveur arrondit déjà les coordonnées au kilomètre.
const TOLERANCE_URL_DEGRES = 0.05;

async function verifierPrecisionUrl(lieu) {
  if (!slug(lieu.pays) || !slug(lieu.nom)) return;

  try {
    const retrouve = await resoudreParNom({ paysSlug: slug(lieu.pays), villeSlug: slug(lieu.nom) });
    const memeEndroit =
      retrouve &&
      Math.abs(retrouve.lat - lieu.lat) < TOLERANCE_URL_DEGRES &&
      Math.abs(retrouve.lon - lieu.lon) < TOLERANCE_URL_DEGRES;

    // memeLieu : ne modifie l'adresse que si l'utilisateur regarde toujours ce
    // lieu (il a pu changer de ville pendant la vérification).
    if (!memeEndroit && memeLieu(lieu, etat.lieu)) ecrireUrl(lieu, { precis: true });
  } catch {
    // Vérification purement cosmétique : son échec ne doit rien casser.
  }
}

/** Aiguille l'application vers ce que demande l'adresse courante. */
async function suivreUrl() {
  // Anciens liens (#lat=...) : on les honore, puis on réécrit proprement.
  const herite = lireHashHerite(window.location.hash);
  if (herite) {
    const lieu = lieuValide(herite);
    window.history.replaceState(null, '', cheminDeLieu(lieu ?? LIEU_DEFAUT));
    await chargerLieu(lieu ?? LIEU_DEFAUT);
    return;
  }

  const route = lireChemin(window.location.pathname, window.location.search);

  // Racine du site : dernière ville consultée, sinon Paris.
  if (!route) {
    await chargerLieu(prefs.dernierLieu ?? LIEU_DEFAUT);
    return;
  }

  if (route.type === 'coordonnees') {
    const lieu = lieuValide({ nom: 'Position', lat: route.lat, lon: route.lon });
    if (lieu) await chargerLieu(lieu);
    else afficherErreur('Ces coordonnées sont invalides.');
    return;
  }

  // Coordonnées présentes dans l'adresse : inutile d'interroger le géocodeur.
  if (route.precision) {
    const lieu = lieuValide({
      nom: route.nomAffichable,
      pays: route.paysSlug ? deslug(route.paysSlug) : null,
      lat: route.precision.lat,
      lon: route.precision.lon
    });
    if (lieu) await chargerLieu(lieu, { verifierUrl: false });
    return;
  }

  marquerChargement(true);
  try {
    const lieu = await resoudreParNom(route);
    if (lieu) {
      await chargerLieu(lieu, { verifierUrl: false });
      return;
    }
    marquerChargement(false);
    afficherErreur(`Impossible de trouver « ${route.nomAffichable} ». Essaie la recherche.`);
  } catch (erreur) {
    marquerChargement(false);
    afficherErreur(erreur.message || 'La recherche du lieu a échoué.');
  }
}

/* ------------------------------------------------------------- Chargement */

async function chargerLieu(lieuBrut, { forcer = false, empiler = false, verifierUrl = true } = {}) {
  const lieu = lieuValide(lieuBrut);
  if (!lieu) {
    afficherErreur('Ce lieu est invalide.');
    return;
  }

  if (!forcer && memeLieu(lieu, etat.lieu) && etat.meteo && !etat.chargement) return;

  etat.requeteMeteo?.abort();
  const controleur = new AbortController();
  etat.requeteMeteo = controleur;

  etat.lieu = lieu;
  ecrireUrl(lieu, { empiler });
  cacherErreur();
  marquerChargement(true);
  rendreFavoris();

  try {
    const meteo = await appelApi(
      `/api/weather?lat=${encodeURIComponent(lieu.lat)}&lon=${encodeURIComponent(lieu.lon)}`,
      controleur.signal
    );
    if (controleur.signal.aborted) return;

    etat.meteo = meteo;
    etat.premierChargement = false;
    SQUELETTES.forEach((id) => $(id).classList.remove('squelette'));

    // « Ma position » n'a pas de nom de ville : le fuseau horaire fait un
    // repère lisible (« Europe/Paris »).
    if (lieu.nom === 'Ma position' && !lieu.region) {
      etat.lieu = { ...lieu, region: meteo.location.timezone };
    }

    rendreTout();
    ecrirePrefs({ dernierLieu: etat.lieu });
    annoncer(`Météo de ${lieu.nom} : ${meteo.current.condition?.label ?? ''}, ${f.temp(meteo.current.temperature, etat.systeme)}`);

    // Vérifie en arrière-plan que l'adresse lisible mène bien ici (voir
    // verifierPrecisionUrl). La réponse est mise en cache par le serveur : sur
    // les visites suivantes, cette vérification ne coûte aucun appel réseau.
    if (verifierUrl) verifierPrecisionUrl(etat.lieu);
  } catch (erreur) {
    if (erreur.name === 'AbortError') return;
    afficherErreur(
      navigator.onLine === false
        ? 'Tu sembles hors ligne. La météo affichée peut être périmée.'
        : erreur.message || 'Impossible de récupérer la météo.'
    );
  } finally {
    if (etat.requeteMeteo === controleur) {
      etat.requeteMeteo = null;
      marquerChargement(false);
    }
  }
}

/* ------------------------------------------------------- Rafraîchissement auto */

const FRAICHEUR_MS = 10 * 60_000;

function donneesPerimees() {
  if (!etat.meteo) return true;
  const age = Date.now() - new Date(etat.meteo.fetchedAt).getTime();
  return !Number.isFinite(age) || age > FRAICHEUR_MS;
}

setInterval(() => {
  if (document.visibilityState === 'visible' && donneesPerimees() && etat.lieu) {
    chargerLieu(etat.lieu, { forcer: true });
  }
  if (etat.meteo) el.maj.textContent = f.ilYA(etat.meteo.fetchedAt);
}, 60_000);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && donneesPerimees() && etat.lieu) {
    chargerLieu(etat.lieu, { forcer: true });
  }
});

// Boutons précédent/suivant du navigateur : on relit simplement l'adresse.
window.addEventListener('popstate', () => {
  suivreUrl();
});

/* ------------------------------------------------------------------ Démarrage */

function initialiser() {
  $('brand-mark').innerHTML = uiIcon('brand');
  $('finder-icon').innerHTML = uiIcon('loupe');
  $('glyph-position').innerHTML = uiIcon('position');
  $('glyph-star').innerHTML = uiIcon('etoile');

  appliquerTheme();
  appliquerUnites();
  rendreFavoris();

  suivreUrl();
}

initialiser();
