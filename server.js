// Importation des outils qu'on a installés
const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Création de l'application serveur
const app = express();
app.use(cors());

// Récupération des variables secrètes depuis le fichier .env
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.CLE_API_METEO;

// --- NOTRE ROUTE PRINCIPALE ---
// Quand quelqu'un visite /api/meteo, ce code s'exécute
app.get('/api/meteo', async (req, res) => {
    try {
        // L'adresse de l'API OpenWeatherMap pour Paris 
        // (units=metric pour les Celsius, lang=fr pour le français)
        const url = `https://api.openweathermap.org/data/2.5/weather?q=Paris&appid=${API_KEY}&units=metric&lang=fr`;

        // Le serveur demande les infos à OpenWeatherMap
        const reponse = await fetch(url);
        const donnees = await reponse.json();

        // Si la clé API est invalide ou qu'il y a une erreur avec OpenWeatherMap
        if (!reponse.ok) {
            return res.status(reponse.status).json(donnees);
        }

        // Si tout va bien, on renvoie les données météo
        res.json(donnees);

    } catch (erreur) {
        console.error("Erreur serveur :", erreur);
        res.status(500).json({ message: "Erreur lors de la récupération de la météo" });
    }
});

// Allumage du serveur
app.listen(PORT, () => {
    console.log(`✅ Serveur démarré avec succès sur http://localhost:${PORT}`);
});