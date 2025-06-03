const express = require('express');
const { getUserConnection } = require('../utils');
const { VisitSchema, ClientSchema, FacebookAudienceSchema } = require('../models');

const router = express.Router();

// Endpoint per accedere ai dati delle visite
router.get('/visits', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const skip = (page - 1) * limit;
    
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Se il modello Visit non esiste nella connessione, crealo
    if (!connection.models['Visit']) {
      connection.model('Visit', VisitSchema);
    }
    
    const UserVisit = connection.model('Visit');
    
    // Conta il totale e ottieni i dati paginati
    const total = await UserVisit.countDocuments({});
    const visits = await UserVisit.find({})
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit);
    
    res.json({
      success: true,
      data: visits,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Errore nel recupero delle visite:", error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel recupero delle visite', 
      error: error.message 
    });
  }
});

// Endpoint per accedere ai dati dei clienti
router.get('/clients', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const skip = (page - 1) * limit;
    
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Se il modello Client non esiste nella connessione, crealo
    if (!connection.models['Client']) {
      connection.model('Client', ClientSchema);
    }
    
    const UserClient = connection.model('Client');
    
    // Conta il totale e ottieni i dati paginati
    const total = await UserClient.countDocuments({});
    const clients = await UserClient.find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    res.json({
      success: true,
      data: clients,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Errore nel recupero dei clienti:", error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel recupero dei clienti', 
      error: error.message 
    });
  }
});

// API per accedere ai dati delle audience Facebook
router.get('/audiences', async (req, res) => {
  try {
    console.log("[AUDIENCE API] Richiesta ricevuta per le audience Facebook");
    console.log(`[AUDIENCE API] Headers: ${JSON.stringify(req.headers.origin)}`);
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const skip = (page - 1) * limit;
    
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      console.log("[AUDIENCE API] ERRORE: Nessuna connessione utente disponibile");
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    console.log("[AUDIENCE API] Connessione al database utente ottenuta con successo");
    
    // Se il modello FacebookAudience non esiste nella connessione, crealo
    if (!connection.models['FacebookAudience']) {
      console.log("[AUDIENCE API] Registrazione del modello FacebookAudience sulla connessione");
      connection.model('FacebookAudience', FacebookAudienceSchema);
    }
    
    const UserFacebookAudience = connection.model('FacebookAudience');
    
    // Funzione per normalizzare i documenti audience
    function normalizeAudience(audience) {
      // Se l'audience è un documento Mongoose, convertiamolo in oggetto normale
      const doc = audience.toObject ? audience.toObject() : {...audience};
      
      // Creiamo un nuovo oggetto normalizzato con i dati di base
      const normalized = {
        ...doc,
        email: doc.email || null,
        phone: doc.phone || null,
        firstName: doc.firstName || null,
        lastName: doc.lastName || null,
        location: doc.location || {
          city: doc.city,
          region: doc.region || doc.state,
          country: doc.country,
          country_code: doc.country_code
        }
      };
      
      // Cerca i dati nelle conversioni se presenti
      if (doc.conversions && doc.conversions.length > 0) {
        // Ottieni l'ultima conversione
        const lastConversion = doc.conversions[doc.conversions.length - 1];
        
        // Estrai i dati dal formData, se disponibili
        if (lastConversion.metadata && lastConversion.metadata.formData) {
          const formData = lastConversion.metadata.formData;
          
          // Aggiungi i dati mancanti dall'ultima conversione
          if (!normalized.email && formData.email) normalized.email = formData.email;
          if (!normalized.phone && formData.phone) normalized.phone = formData.phone;
          if (!normalized.firstName && formData.firstName) normalized.firstName = formData.firstName;
          if (!normalized.lastName && formData.lastName) normalized.lastName = formData.lastName;
          
          // Aggiungi il campo consentAds se presente
          if (formData.adOptimizationConsent && !normalized.adOptimizationConsent) {
            normalized.adOptimizationConsent = formData.adOptimizationConsent === true ? 'GRANTED' : 'DENIED';
          }
        }
      }
      
      return normalized;
    }
    
    // Conta il totale e ottieni i dati paginati
    console.log("[AUDIENCE API] Esecuzione query sulla collection FacebookAudience...");
    const total = await UserFacebookAudience.countDocuments({});
    const audiences = await UserFacebookAudience.find({})
      .sort({ lastUpdated: -1 })
      .skip(skip)
      .limit(limit);
    
    console.log(`[AUDIENCE API] Query completata. Trovati ${audiences.length} documenti`);
    
    // Normalizza ogni audience prima di inviarla
    const normalizedAudiences = audiences.map(normalizeAudience);
    
    // Log dei primi documenti per debug se ce ne sono
    if (normalizedAudiences.length > 0) {
      console.log("[AUDIENCE API] Primo documento normalizzato:");
      console.log(JSON.stringify(normalizedAudiences[0], null, 2).substring(0, 300) + "...");
    }
    
    // Configurazione corretta di CORS
    res.header('Access-Control-Allow-Origin', req.headers.origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    res.json({
      success: true,
      data: normalizedAudiences,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
    console.log("[AUDIENCE API] Risposta inviata al client");
    
  } catch (error) {
    console.error('[AUDIENCE API] ERRORE durante il recupero delle audience:', error);
    console.error('[AUDIENCE API] Stack trace:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel recupero delle audience', 
      error: error.message 
    });
  }
});

// Endpoint per esportare i clienti in CSV
router.get('/clients/export', async (req, res) => {
  try {
    console.log("[EXPORT API] Richiesta di esportazione clienti per Facebook");
    
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Se il modello Client non esiste nella connessione, crealo
    if (!connection.models['Client']) {
      connection.model('Client', ClientSchema);
    }
    
    const UserClient = connection.model('Client');
    
    // Ottieni tutti i clienti per l'esportazione
    const clients = await UserClient.find({});
    console.log(`[EXPORT API] Trovati ${clients.length} clienti`);
    
    // Definisci le intestazioni per il CSV secondo il formato Facebook esteso
    const headers = [
      "email",              // Email
      "phone",              // Telefono
      "fn",                 // Nome
      "ln",                 // Cognome
      "country",            // Paese (codice ISO)
      "ct",                 // Città
      "st",                 // Stato/Regione
      "external_id",        // ID esterno (clientId)
      "client_ip_address",  // Indirizzo IP
      "client_user_agent",  // User agent
      "fbc",                // Facebook click parameter
      "fbp",                // Facebook browser parameter
      "lead_id",            // ID del lead originale
      "subscription_id",    // ID abbonamento
      "value",              // Valore cliente (LTV)
      "currency",           // Valuta
      "f_name",             // Nome (formato alternativo)
      "l_name",             // Cognome (formato alternativo)
      "zp",                 // CAP
      "conversion_date",    // Data di conversione
      "source",             // Fonte
      "medium",             // Medium
      "campaign"            // Campagna
    ];
    
    // Funzione per formattare una riga di CSV e pulire i dati
    const formatRow = (client) => {
      // Estrai il nome e cognome
      let firstName = client.firstName || "";
      let lastName = client.lastName || "";
      
      // Se è disponibile solo il fullName, tenta di dividerlo
      if (!firstName && !lastName && client.fullName) {
        const parts = client.fullName.split(' ');
        if (parts.length > 0) firstName = parts[0];
        if (parts.length > 1) lastName = parts.slice(1).join(' ');
      }
      
      // Formatta il telefono in formato internazionale
      let phone = client.phone || "";
      if (phone && !phone.startsWith('+')) {
        phone = phone.replace(/^0/, '+39');
      }
      
      // Estrai dati estesi
      let extData = client.extendedData || {};
      
      // Estrai fbc da fbclid se disponibile
      let fbc = "";
      if (extData.fbclid) {
        const timestamp = extData.fbclidTimestamp || Math.floor(Date.now() / 1000);
        fbc = `fb.1.${timestamp}.${extData.fbclid}`;
      }
      
      // Crea un array di valori secondo l'ordine delle intestazioni
      const values = [
        client.email || "",                 // email
        phone.replace(/\s+/g, ""),          // phone (pulito)
        firstName,                          // fn
        lastName,                           // ln
        extData.country || "IT",            // country (default IT)
        extData.city || "",                 // ct (city)
        client.clientId || "",              // external_id
        extData.ipAddress || "",            // client_ip_address
        extData.userAgent || "",            // client_user_agent
        fbc,                                // fbc
        extData.fbp || "",                  // fbp
        client.leadId || "",                // lead_id
        "",                                 // subscription_id (vuoto)
        (client.value || 0).toString(),     // value
        extData.currency || "EUR",          // currency (default EUR)
        firstName,                          // f_name (duplicate di fn per compatibilità)
        lastName,                           // l_name (duplicate di ln per compatibilità)
        extData.state || extData.province || "", // st (stato/provincia)
        extData.postalCode || extData.zip || "", // zp (CAP)
        client.convertedAt ? new Date(client.convertedAt).toISOString().split('T')[0] : "", // conversion_date
        client.leadSource || "",            // source
        client.medium || "",                // medium
        client.campaign || ""               // campaign
      ];
      
      // Escape dei valori CSV
      return values.map(value => {
        if (typeof value !== 'string') return '';
        const escaped = value.replace(/"/g, '""');
        return `"${escaped}"`;
      }).join(',');
    };
    
    // Crea il contenuto del CSV
    let csv = headers.join(',') + '\n';
    clients.forEach(client => {
      // Include solo record con almeno un identificatore valido
      if (client.email || client.phone || client.clientId || (client.firstName && client.lastName)) {
        csv += formatRow(client) + '\n';
      }
    });
    
    // Imposta gli header per il download
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=clients_facebook_complete.csv');
    
    // Invia il file CSV
    res.send(csv);
    console.log("[EXPORT API] CSV clienti inviato");
  } catch (error) {
    console.error("[EXPORT API] Errore nell'esportazione dei clienti:", error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nell\'esportazione dei clienti', 
      error: error.message 
    });
  }
});

// Endpoint per esportare le audience Facebook in CSV
router.get('/audiences/export', async (req, res) => {
  try {
    console.log("[EXPORT API] Richiesta di esportazione audience per Facebook");
    
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Se il modello FacebookAudience non esiste nella connessione, crealo
    if (!connection.models['FacebookAudience']) {
      connection.model('FacebookAudience', FacebookAudienceSchema);
    }
    
    const UserFacebookAudience = connection.model('FacebookAudience');
    
    // Ottieni tutte le audience per l'esportazione
    const audiences = await UserFacebookAudience.find({});
    console.log(`[EXPORT API] Trovate ${audiences.length} audience`);
    
    // Normalizza i documenti per estrarre i dati anche dalle conversioni
    const normalizedAudiences = audiences.map(audience => {
      const doc = audience.toObject ? audience.toObject() : {...audience};
      const normalized = {...doc};
      
      // Cerca i dati nelle conversioni se presenti
      if (doc.conversions && doc.conversions.length > 0) {
        const lastConversion = doc.conversions[doc.conversions.length - 1];
        if (lastConversion.metadata?.formData) {
          const formData = lastConversion.metadata.formData;
          if (!normalized.email && formData.email) normalized.email = formData.email;
          if (!normalized.phone && formData.phone) normalized.phone = formData.phone;
          if (!normalized.firstName && formData.firstName) normalized.firstName = formData.firstName;
          if (!normalized.lastName && formData.lastName) normalized.lastName = formData.lastName;
        }
      }
      
      return normalized;
    });
    
    // Definisci le intestazioni per il CSV secondo il formato Facebook esteso
    // Include tutti i possibili identificatori supportati da Facebook
    const headers = [
      "email",              // Email
      "phone",              // Telefono
      "fn",                 // Nome
      "ln",                 // Cognome
      "country",            // Paese (codice ISO)
      "ct",                 // Città
      "st",                 // Stato/Regione
      "external_id",        // ID esterno
      "client_ip_address",  // Indirizzo IP
      "client_user_agent",  // User agent
      "fbc",                // Facebook click parameter
      "fbp",                // Facebook browser parameter
      "lead_id",            // Facebook lead ID
      "subscription_id",    // ID abbonamento
      "madid",              // Mobile advertiser ID
      "value",              // Valore cliente
      "f_name",             // Nome (formato alternativo)
      "l_name",             // Cognome (formato alternativo)
      "zp",                 // CAP
      "gen",                // Genere
      "db"                  // Data di nascita
    ];
    
    // Funzione per formattare una riga di CSV e pulire i dati
    const formatRow = (audience) => {
      // Formatta il telefono in formato internazionale
      let phone = audience.phone || "";
      if (phone && !phone.startsWith('+')) {
        phone = phone.replace(/^0/, '+39');
      }
      
      // Estrai ip e user agent
      let ip = "";
      let userAgent = "";
      if (audience.deviceInfo) {
        ip = audience.deviceInfo.ip || "";
        userAgent = audience.deviceInfo.userAgent || "";
      }
      
      // Formatta fbc con fbclid se disponibile
      let fbc = audience.fbc || "";
      if (!fbc && audience.fbclid) {
        const timestamp = audience.fbclidTimestamp || Math.floor(Date.now() / 1000);
        fbc = `fb.1.${timestamp}.${audience.fbclid}`;
      }
      
      // Crea un array di valori secondo l'ordine delle intestazioni
      const values = [
        audience.email || "",                 // email
        phone.replace(/\s+/g, ""),           // phone (pulito)
        audience.firstName || "",             // fn
        audience.lastName || "",              // ln
        audience.country || "IT",             // country (default IT)
        audience.city || "",                  // ct (city)
        audience.userId || "",                // external_id
        ip,                                   // client_ip_address
        userAgent,                            // client_user_agent
        fbc,                                  // fbc
        audience.fbp || "",                   // fbp
        audience.leadId || "",                // lead_id
        "",                                   // subscription_id (vuoto)
        audience.madid || "",                 // madid (mobile advertiser ID)
        (audience.value || 0).toString(),     // value
        audience.firstName || "",             // f_name (duplicate di fn per compatibilità)
        audience.lastName || "",              // l_name (duplicate di ln per compatibilità)
        audience.state || "",                 // st (stato/provincia)
        audience.zip || audience.postalCode || "", // zp (CAP)
        audience.gender || "",                // gen (genere)
        audience.birthdate || ""              // db (data di nascita)
      ];
      
      // Escape dei valori CSV
      return values.map(value => {
        if (typeof value !== 'string') return '';
        const escaped = value.replace(/"/g, '""');
        return `"${escaped}"`;
      }).join(',');
    };
    
    // Crea il contenuto del CSV
    let csv = headers.join(',') + '\n';
    normalizedAudiences.forEach(audience => {
      // Include solo record con almeno un identificatore valido
      if (audience.email || audience.phone || audience.fbclid || audience.userId || (audience.firstName && audience.lastName)) {
        csv += formatRow(audience) + '\n';
      }
    });
    
    // Imposta gli header per il download
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=facebook_audience_complete.csv');
    
    // Invia il file CSV
    res.send(csv);
    console.log("[EXPORT API] CSV audience inviato");
  } catch (error) {
    console.error("[EXPORT API] Errore nell'esportazione delle audience:", error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nell\'esportazione delle audience', 
      error: error.message 
    });
  }
});

module.exports = router;