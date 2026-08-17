'use strict';

const config = require('./src/config');
const { createApp } = require('./src/app');

const app = createApp({ config });

const server = app.listen(config.port, config.host, () => {
  const { address, port } = server.address();
  const displayHost = address === '::' || address === '0.0.0.0' ? 'localhost' : address;
  console.log(`✅ Météo Monde démarré sur http://${displayHost}:${port}`);
  console.log(`   Environnement : ${config.env} — données fournies par Open-Meteo (sans clé d'API)`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `❌ Le port ${config.port} est déjà utilisé. Arrête l'autre programme, ` +
        `ou lance le serveur sur un autre port : PORT=3001 npm start`
    );
  } else if (error.code === 'EACCES') {
    console.error(`❌ Permission refusée sur le port ${config.port}. Choisis un port supérieur à 1024.`);
  } else {
    console.error('❌ Impossible de démarrer le serveur :', error);
  }
  process.exitCode = 1;
});

// Les connexions inactives sont fermées au bout d'un moment : une connexion
// ouverte indéfiniment est une ressource immobilisée pour rien.
server.headersTimeout = 20_000;
server.requestTimeout = 30_000;
server.keepAliveTimeout = 10_000;

/** Arrêt propre : on laisse les requêtes en cours se terminer, sans traîner. */
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`\n${signal} reçu — arrêt en cours...`);
  app.locals.stopBackgroundWork?.();

  const forceExit = setTimeout(() => {
    console.error('Arrêt forcé après 5 s.');
    process.exit(1);
  }, 5_000).unref();

  server.close((error) => {
    clearTimeout(forceExit);
    if (error) {
      console.error('Erreur pendant la fermeture :', error);
      process.exit(1);
    }
    console.log('Serveur arrêté proprement.');
  });

  // Coupe les connexions persistantes qui empêcheraient close() d'aboutir.
  server.closeIdleConnections?.();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  console.error('Promesse rejetée sans gestionnaire :', reason);
});
