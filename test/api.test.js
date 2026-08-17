'use strict';

// Tests du serveur, sans réseau : le client Open-Meteo est remplacé par un faux.
// Lancement : npm test

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { describeWeather } = require('../src/weatherCodes');
const { TtlCache } = require('../src/cache');

const config = {
  env: 'test',
  port: 0,
  host: '127.0.0.1',
  trustProxy: false,
  // Large pour l'application partagée : la limite est testée à part, sur une
  // instance dédiée, pour ne pas contraindre les autres cas.
  rateLimit: { windowMs: 60_000, max: 50, maxTrackedClients: 100 },
  upstream: { timeoutMs: 1_000 },
  cache: { weatherTtlMs: 60_000, searchTtlMs: 60_000, maxEntries: 50 }
};

/** Compte les appels pour vérifier que le cache évite les requêtes inutiles. */
const faux = {
  appelsSearch: 0,
  appelsForecast: 0,
  prochaineErreur: null,

  async searchPlaces(query, options) {
    faux.appelsSearch += 1;
    if (faux.prochaineErreur) throw faux.prochaineErreur;
    return [
      {
        id: '35.6895,139.6917',
        name: 'Tokyo',
        country: 'Japon',
        countryCode: 'JP',
        region: 'Tokyo',
        latitude: 35.6895,
        longitude: 139.6917,
        timezone: 'Asia/Tokyo',
        population: 9733276,
        elevation: 44,
        recu: { query, limit: options.limit }
      }
    ];
  },

  async getForecast({ latitude, longitude }) {
    faux.appelsForecast += 1;
    if (faux.prochaineErreur) throw faux.prochaineErreur;
    return {
      location: { latitude, longitude, timezone: 'Europe/Paris', utcOffsetSeconds: 7200, elevation: 42 },
      current: { time: '2026-08-17T12:00', temperature: 21, condition: describeWeather(95), isDay: true },
      hourly: [],
      daily: [],
      units: { temperature: '°C' },
      fetchedAt: new Date().toISOString()
    };
  }
};

let serveur;
let base;
let app;

before(async () => {
  app = createApp({ config, client: faux });
  await new Promise((resolve) => {
    serveur = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${serveur.address().port}`;
});

after(async () => {
  app.locals.stopBackgroundWork?.();
  await new Promise((resolve) => serveur.close(resolve));
});

beforeEach(() => {
  faux.appelsSearch = 0;
  faux.appelsForecast = 0;
  faux.prochaineErreur = null;

  // Sans ça, les requêtes d'un test épuiseraient le quota des suivants.
  app.locals.resetRateLimit();
  app.locals.clearCache();
});

const get = (chemin, options) => fetch(base + chemin, options);

describe('validation des entrées', () => {
  test('refuse une recherche vide', async () => {
    const reponse = await get('/api/search?q=%20%20');
    assert.equal(reponse.status, 400);

    const corps = await reponse.json();
    assert.equal(corps.error, 'invalid_request');
    assert.equal(corps.field, 'q');
  });

  test('refuse une recherche trop longue', async () => {
    const reponse = await get(`/api/search?q=${'a'.repeat(81)}`);
    assert.equal(reponse.status, 400);
  });

  test('nettoie les caractères de contrôle et les espaces en trop', async () => {
    const reponse = await get(`/api/search?q=${encodeURIComponent('  Tok\n\ryo  ')}`);
    assert.equal(reponse.status, 200);

    const corps = await reponse.json();
    assert.equal(corps.query, 'Tok yo');
  });

  test('refuse une latitude hors bornes', async () => {
    for (const mauvais of ['91', '-91', 'abc', 'NaN', 'Infinity', '']) {
      const reponse = await get(`/api/weather?lat=${encodeURIComponent(mauvais)}&lon=0`);
      assert.equal(reponse.status, 400, `lat=${mauvais} devrait être refusé`);
    }
  });

  test('refuse une longitude hors bornes', async () => {
    const reponse = await get('/api/weather?lat=0&lon=181');
    assert.equal(reponse.status, 400);
    assert.equal((await reponse.json()).field, 'lon');
  });

  test('refuse une limite de résultats absurde', async () => {
    for (const mauvais of ['0', '11', '2.5', 'beaucoup']) {
      const reponse = await get(`/api/search?q=Tokyo&limit=${mauvais}`);
      assert.equal(reponse.status, 400, `limit=${mauvais} devrait être refusé`);
    }
  });

  test('arrondit les coordonnées à 2 décimales avant de les transmettre', async () => {
    const reponse = await get('/api/weather?lat=48.856614&lon=2.352222');
    assert.equal(reponse.status, 200);

    const corps = await reponse.json();
    assert.equal(corps.location.latitude, 48.86);
    assert.equal(corps.location.longitude, 2.35);
  });
});

describe('cache', () => {
  test('ne rappelle pas le service pour une même position', async () => {
    const premiere = await get('/api/weather?lat=10&lon=10');
    const seconde = await get('/api/weather?lat=10&lon=10');

    assert.equal(premiere.headers.get('x-cache'), 'MISS');
    assert.equal(seconde.headers.get('x-cache'), 'HIT');
    assert.equal(faux.appelsForecast, 1);
  });

  test('la recherche est insensible à la casse', async () => {
    await get('/api/search?q=Berlin');
    const seconde = await get('/api/search?q=BERLIN');

    assert.equal(seconde.headers.get('x-cache'), 'HIT');
    assert.equal(faux.appelsSearch, 1);
  });

  test('expire les entrées et borne sa taille', () => {
    const cache = new TtlCache({ maxEntries: 2 });

    cache.set('a', 1, 60_000);
    assert.equal(cache.get('a'), 1);

    cache.set('b', 2, -1); // durée nulle ou négative : rien n'est mémorisé
    assert.equal(cache.get('b'), undefined);

    cache.set('c', 3, 60_000);
    cache.set('d', 4, 60_000); // dépasse la limite : la plus ancienne saute
    assert.equal(cache.size, 2);
    assert.equal(cache.get('a'), undefined);
    assert.equal(cache.get('d'), 4);
  });
});

describe('erreurs du service distant', () => {
  test('renvoie 504 sans divulguer les détails techniques quand le service est trop lent', async () => {
    const erreur = new Error("détail interne : clé=secret, pile d'appels...");
    erreur.status = 504;
    erreur.code = 'upstream_timeout';
    faux.prochaineErreur = erreur;

    const reponse = await get('/api/weather?lat=1&lon=1');
    assert.equal(reponse.status, 504);

    const corps = await reponse.json();
    assert.equal(corps.error, 'upstream_timeout');
    assert.ok(!JSON.stringify(corps).includes('secret'), 'aucun détail interne ne doit fuiter');
  });

  test('transforme une erreur inattendue en 500 générique', async () => {
    faux.prochaineErreur = new Error('bang: mot de passe=hunter2');

    const reponse = await get('/api/weather?lat=2&lon=2');
    assert.equal(reponse.status, 500);

    const corps = await reponse.json();
    assert.equal(corps.error, 'server_error');
    assert.equal(corps.message, 'Une erreur est survenue côté serveur.');
    assert.ok(!JSON.stringify(corps).includes('hunter2'));
  });
});

describe('sécurité', () => {
  test('envoie les en-têtes de sécurité et masque le framework', async () => {
    const reponse = await get('/api/health');

    const csp = reponse.headers.get('content-security-policy');
    assert.match(csp, /default-src 'self'/);
    assert.ok(!csp.includes('unsafe-inline'), "la CSP ne doit pas autoriser les styles/scripts en ligne");
    assert.equal(reponse.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(reponse.headers.get('x-frame-options'), 'DENY');
    assert.equal(reponse.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(reponse.headers.get('x-powered-by'), null);
  });

  test('refuse toute méthode autre que la lecture', async () => {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const reponse = await get('/api/search?q=Tokyo', { method });
      assert.equal(reponse.status, 405, `${method} devrait être refusé`);
      assert.equal(reponse.headers.get('allow'), 'GET, HEAD, OPTIONS');
    }
  });

  test('répond en JSON sur une route d’API inconnue', async () => {
    const reponse = await get('/api/nexistepas');
    assert.equal(reponse.status, 404);
    assert.match(reponse.headers.get('content-type'), /application\/json/);
    assert.equal((await reponse.json()).error, 'not_found');
  });

  test('limite le débit et indique quand réessayer', async () => {
    // Instance dédiée : 3 requêtes autorisées par fenêtre.
    const strict = createApp({
      config: { ...config, rateLimit: { windowMs: 60_000, max: 3, maxTrackedClients: 10 } },
      client: faux
    });
    const serveurStrict = await new Promise((resolve) => {
      const s = strict.listen(0, '127.0.0.1', () => resolve(s));
    });
    const baseStricte = `http://127.0.0.1:${serveurStrict.address().port}`;

    try {
      const codes = [];
      for (let i = 0; i < 5; i += 1) {
        const reponse = await fetch(`${baseStricte}/api/health`);
        codes.push(reponse.status);

        assert.equal(reponse.headers.get('ratelimit-limit'), '3');
        if (reponse.status === 429) {
          assert.ok(Number(reponse.headers.get('retry-after')) > 0);
          assert.equal((await reponse.json()).error, 'too_many_requests');
        }
      }

      assert.equal(codes.filter((code) => code === 200).length, 3);
      assert.equal(codes.filter((code) => code === 429).length, 2);
    } finally {
      strict.locals.stopBackgroundWork();
      await new Promise((resolve) => serveurStrict.close(resolve));
    }
  });
});

describe('site statique', () => {
  test('sert la page d’accueil', async () => {
    const reponse = await get('/');
    assert.equal(reponse.status, 200);
    assert.match(reponse.headers.get('content-type'), /text\/html/);

    const html = await reponse.text();
    assert.match(html, /Météo Monde/);
    // La page ne doit contenir ni script ni style en ligne, sinon la CSP la casse.
    assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html), 'aucun <script> en ligne');
    assert.ok(!/<style/.test(html), 'aucun <style> en ligne');
    assert.ok(!/\sstyle="/.test(html), 'aucun attribut style');
  });

  test('sert les modules JavaScript et la feuille de style', async () => {
    for (const fichier of ['/app.js', '/render.js', '/icons.js', '/format.js', '/store.js', '/styles.css']) {
      const reponse = await get(fichier);
      assert.equal(reponse.status, 200, `${fichier} devrait être servi`);
    }
  });

  test('renvoie 404 sur une page inconnue', async () => {
    assert.equal((await get('/pas-de-page')).status, 404);
  });
});

describe('adresses lisibles', () => {
  test('sert l’application sur les chemins /meteo/...', async () => {
    const chemins = [
      '/meteo',
      '/meteo/japon/tokyo',
      '/meteo/france/paris',
      '/meteo/tokyo',
      '/meteo/@48.86,2.35',
      '/meteo/papouasie-nouvelle-guinee/tokyo'
    ];

    for (const chemin of chemins) {
      const reponse = await get(chemin);
      assert.equal(reponse.status, 200, `${chemin} devrait servir la page`);
      assert.match(reponse.headers.get('content-type'), /text\/html/);
      assert.match(await reponse.text(), /Météo Monde/);
    }
  });

  test('ne devient pas un fourre-tout : les autres chemins restent en 404', async () => {
    for (const chemin of ['/meteorologie', '/meteos/paris', '/pas-meteo', '/src/config.js', '/package.json', '/.env']) {
      assert.equal((await get(chemin)).status, 404, `${chemin} ne devrait pas servir la page`);
    }
  });

  test('ne sert jamais un fichier du projet via un chemin /meteo/...', async () => {
    // La route /meteo/... ignore complètement le chemin demandé : elle renvoie
    // toujours index.html. Aucune remontée d'arborescence n'est donc possible.
    // Note : fetch() normalise « %2e%2e » en « .. » puis simplifie le chemin
    // avant l'envoi ; selon la tentative, le serveur voit donc soit /meteo/...
    // soit un chemin déjà réduit. L'invariant vérifié ici vaut dans les deux cas.
    const tentatives = [
      '/meteo/%2e%2e/%2e%2e/server.js',
      '/meteo/../../server.js',
      '/meteo/..%2f..%2fsrc/config.js',
      '/meteo/france/../../../.env'
    ];

    for (const chemin of tentatives) {
      const reponse = await get(chemin);
      assert.ok([200, 404].includes(reponse.status), `${chemin} : statut inattendu ${reponse.status}`);

      const corps = await reponse.text();
      assert.ok(!corps.includes('require('), `${chemin} ne doit pas renvoyer de code serveur`);
      assert.ok(!corps.includes('CLE_API'), `${chemin} ne doit rien renvoyer d'un .env`);

      if (reponse.status === 200) {
        assert.match(corps, /<!DOCTYPE html>/i, `${chemin} ne devrait renvoyer que la page`);
      }
    }
  });
});

describe('codes météo WMO', () => {
  test('traduit les codes connus', () => {
    assert.deepEqual(describeWeather(0), { code: 0, label: 'Ciel dégagé', icon: 'clear', severe: false });
    assert.equal(describeWeather(61).icon, 'rain');
    assert.equal(describeWeather(75).icon, 'heavy-snow');
  });

  test('marque les phénomènes dangereux', () => {
    for (const code of [95, 96, 99, 82]) {
      assert.equal(describeWeather(code).severe, true, `le code ${code} devrait être signalé`);
    }
    assert.equal(describeWeather(3).severe, false);
  });

  test('reste utilisable sur un code inconnu ou absent', () => {
    assert.equal(describeWeather(1234).icon, 'unknown');
    assert.equal(describeWeather(null).icon, 'unknown');
    assert.equal(describeWeather(undefined).label, 'Conditions inconnues');
  });
});
