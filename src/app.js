'use strict';

const path = require('node:path');
const express = require('express');
const { securityHeaders, createRateLimiter } = require('./security');
const { createApiRouter } = require('./routes/api');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

/**
 * Assemble l'application Express.
 *
 * Séparée de server.js pour que les tests puissent créer une application
 * jetable, avec un faux client météo, sans ouvrir de port fixe.
 */
function createApp({ config, client } = {}) {
  const app = express();

  // Ne pas annoncer le framework utilisé dans les en-têtes de réponse.
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.set('etag', 'strong');

  app.use(securityHeaders);

  // Le site est en lecture seule : aucune autre méthode HTTP n'a de raison
  // d'être acceptée. Corollaire : aucun analyseur de corps de requête n'est
  // monté, donc pas de charge utile JSON à faire exploser.
  app.use((req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

    res.setHeader('Allow', 'GET, HEAD, OPTIONS');
    return res.status(405).json({ error: 'method_not_allowed', message: 'Seules les lectures sont autorisées.' });
  });

  const rateLimiter = createRateLimiter(config.rateLimit);
  const apiRouter = createApiRouter({ config, client });
  app.use('/api', rateLimiter, apiRouter);

  app.use(
    express.static(PUBLIC_DIR, {
      index: 'index.html',
      dotfiles: 'ignore',
      etag: true,
      redirect: false,
      // En développement on veut voir ses modifications immédiatement.
      maxAge: config.env === 'production' ? '1h' : 0
    })
  );

  // Adresses lisibles du type /meteo/france/paris : ces chemins n'existent pas
  // sur le disque, c'est le JavaScript de la page qui les interprète. On renvoie
  // donc index.html, et lui seul décide quelle ville afficher.
  // Le reste continue de répondre 404 : pas de fourre-tout qui masquerait un
  // fichier manquant.
  app.get(/^\/meteo(?:\/|$)/, (req, res, next) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'), { headers: { 'Cache-Control': 'no-cache' } }, (error) => {
      if (error) next(error);
    });
  });

  app.use((req, res) => {
    res.status(404).type('text/plain; charset=utf-8').send('404 — page introuvable');
  });

  // Gestionnaire d'erreurs final : le client reçoit un message utile, les
  // détails techniques (pile d'appels, réponse du service distant) restent
  // dans les journaux du serveur.
  // Le 4e paramètre `next` est indispensable : c'est lui qui indique à Express
  // qu'il s'agit d'un gestionnaire d'erreurs, même s'il n'est pas utilisé.
  app.use((error, req, res, next) => { // eslint-disable-line no-unused-vars
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600 ? error.status : 500;

    if (status >= 500) console.error(`[${req.method} ${req.originalUrl}]`, error);

    if (res.headersSent) return;

    res.status(status).json({
      error: error.code || 'server_error',
      message: status >= 500 ? 'Une erreur est survenue côté serveur.' : error.message,
      ...(error.field ? { field: error.field } : {})
    });
  });

  app.locals.stopBackgroundWork = () => {
    rateLimiter.stop();
    apiRouter.clearCache();
  };

  // Points d'entrée réservés aux tests, pour repartir d'un état propre entre
  // deux cas (compteurs de débit et cache remis à zéro).
  app.locals.resetRateLimit = () => rateLimiter.reset();
  app.locals.clearCache = () => apiRouter.clearCache();

  return app;
}

module.exports = { createApp, PUBLIC_DIR };
