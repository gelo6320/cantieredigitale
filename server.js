const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const dotenv = require('dotenv');
const session = require('express-session');
const bcrypt = require('bcrypt');
const MongoStore = require('connect-mongo');
const Papa = require('papaparse');
const cookieParser = require('cookie-parser');
const nodemailer = require('nodemailer');
const cors = require('cors');
const fs = require('fs');
const compression = require('compression');
const axios = require('axios');
const crypto = require('crypto');

// Carica variabili d'ambiente
dotenv.config();

// Inizializza Express
const app = express();
const PORT = process.env.PORT || 3000;

// Aggiungi questo middleware all'inizio, prima degli altri middleware
app.use(compression({
  level: 6, // livello di compressione (1-9, 9 è la massima compressione ma più lenta)
  threshold: 0, // soglia in bytes, 0 significa comprimere tutto
  filter: (req, res) => {
    // Non comprimere le risposte già compresse
    if (req.headers['x-no-compression']) {
      return false;
    }
    // Usa la funzione di compressione predefinita
    return compression.filter(req, res);
  }
}));

// Middleware
app.use(bodyParser.json());
app.use(cookieParser());

// Configurazione CORS
app.use(cors({
  origin: function(origin, callback) {
    // Consenti richieste senza origine (come app mobile o curl)
    if (!origin) return callback(null, true);
    
    // Lista dei domini consentiti
    const allowedOrigins = [
      'https://costruzionedigitale.com',
      'https://www.costruzionedigitale.com',
      'http://localhost:3000'
    ];
    
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
      callback(null, origin);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
}));

// Configurazione sessione
app.use(session({
  secret: process.env.SESSION_SECRET || 'neosmile-secret-key',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URL || process.env.MONGODB_URI,
    collectionName: 'sessions',
    ttl: 24 * 60 * 60
  }),
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
    // Rimuovere maxAge per far sì che il cookie di sessione scada alla chiusura del browser
  }
}));

// Connessione a MongoDB
mongoose.connect(process.env.MONGODB_URI)
.then(() => {
  console.log('MongoDB connesso con successo');
  console.log('URI:', process.env.MONGODB_URI.replace(/:[^:]*@/, ':****@')); // Nasconde la password
})
.catch(err => console.error('Errore connessione MongoDB:', err));

// Schema per i dati del form
const FormDataSchema = new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
  message: String,
  source: String,
  fbclid: String,
  fbclidTimestamp: Number, // Aggiungere questa linea
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// Schema utente admin
const AdminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});

// Schema Cookie Consent
const CookieConsentSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  essential: { type: Boolean, default: true },
  analytics: { type: Boolean, default: false },
  marketing: { type: Boolean, default: false },
  configured: { type: Boolean, default: false },  // Nuovo campo per tracciare se è stato configurato in questa sessione
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// NUOVO: Schema per le prenotazioni
const BookingSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  message: String,
  bookingDate: { type: String, required: true },
  bookingTime: { type: String, required: true },
  bookingTimestamp: { type: Date, required: true },
  status: { 
    type: String, 
    enum: ['pending', 'confirmed', 'cancelled', 'completed'], 
    default: 'pending' 
  },
  source: String,
  fbclid: String,
  fbclidTimestamp: Number, // Aggiungere questa linea
  createdAt: { type: Date, default: Date.now }
});

const FacebookLeadSchema = new mongoose.Schema({
  leadId: String,
  formId: String,
  adId: String,
  pageId: String,
  adgroupId: String,
  createdTime: Number,
  name: String,
  email: String,
  phone: String,
  customFields: Object,
  rawData: Object,
  processed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

// Modelli
const FormData = mongoose.model('FormData', FormDataSchema);
const Admin = mongoose.model('Admin', AdminSchema);
const CookieConsent = mongoose.model('CookieConsent', CookieConsentSchema);
const Booking = mongoose.model('Booking', BookingSchema); // Nuovo modello
const FacebookLead = mongoose.model('FacebookLead', FacebookLeadSchema);

// Middleware per verificare il consenso ai cookie
const checkCookieConsent = async (req, res, next) => {
  console.log('=============== CHECK COOKIE CONSENT ===============');
  console.log('Path:', req.path);
  console.log('Cookie userId:', req.cookies.userId);
  console.log('Cookie user_cookie_consent:', req.cookies.user_cookie_consent);
  // I cookie essenziali sono sempre consentiti
  if (req.path === '/api/cookie-consent' || req.path.startsWith('/admin')) {
    return next();
  }
  
  const userId = req.cookies.userId || generateUserId();
  
  // Se l'utente non ha un ID cookie, impostalo e consideralo come nuova sessione
  if (!req.cookies.userId) {
    res.cookie('userId', userId, { 
      // Cookie valido solo per la sessione (nessun maxAge)
      httpOnly: true,
      sameSite: 'strict'
    });
    
    // Resetta le preferenze nel DB se esiste un consenso precedente
    await CookieConsent.findOneAndUpdate(
      { userId },
      { 
        essential: true,
        analytics: false,
        marketing: false,
        configured: false,  // Aggiungi questo campo per tracciare se è stato configurato in questa sessione
        updatedAt: new Date()
      },
      { upsert: true }
    );
    
    // Imposta le preferenze base per questa nuova sessione
    req.cookieConsent = {
      essential: true,
      analytics: false,
      marketing: false,
      configured: false
    };
    
    return next();
  }
  
  try {
    // Cerca il consenso cookie per questo utente
    let consent = await CookieConsent.findOne({ userId });
    
    // Se non esiste ancora un consenso, crea uno con solo cookie essenziali
    if (!consent) {
      consent = await CookieConsent.create({
        userId,
        essential: true,
        analytics: false,
        marketing: false,
        configured: false
      });
    }
    
    // Aggiungi le preferenze cookie all'oggetto req per l'uso nei controller
    req.cookieConsent = {
      essential: consent.essential,
      analytics: consent.analytics,
      marketing: consent.marketing,
      configured: consent.configured || false
    };
    
    next();
  } catch (error) {
    console.error('Errore durante la verifica del consenso cookie:', error);
    // In caso di errore, procedi comunque ma senza cookie non essenziali
    req.cookieConsent = {
      essential: true,
      analytics: false,
      marketing: false,
      configured: false
    };
    next();
  }
};

// Genera un ID utente casuale per il tracciamento del consenso cookie
function generateUserId() {
  return 'user_' + Math.random().toString(36).substring(2, 15) + 
          Math.random().toString(36).substring(2, 15);
}

// Applica il middleware di controllo cookie a tutte le route
app.use(checkCookieConsent);

// Configura Nodemailer per l'invio di email
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  debug: true, // Mostra log di debug
  logger: true // Abilita il logger
});

// Verifica la connessione all'avvio
transporter.verify(function(error, success) {
  if (error) {
    console.error('Errore nella configurazione del trasportatore email:', error);
  } else {
    console.log('Server email pronto per l\'invio');
  }
});

// Middleware per catturare fbclid e inviare PageView alla CAPI (solo per la prima visita)
app.use(async (req, res, next) => {
  // Estrai fbclid dalla query
  let fbclid = req.query.fbclid;
  
  // Se non c'è nella query diretta, controlla l'header referer
  if (!fbclid && req.headers.referer) {
    try {
      const refererUrl = new URL(req.headers.referer);
      fbclid = refererUrl.searchParams.get('fbclid');
    } catch (e) {
      console.error('Errore nel parsing del referer URL:', e);
    }
  }
  
  console.log('========== FBCLID MIDDLEWARE ==========');
  console.log(`URL richiesto: ${req.originalUrl}`);
  console.log(`fbclid trovato nella query: ${fbclid || 'NESSUNO'}`);
  console.log(`fbclid già tracciato in sessione: ${req.session && req.session.fbclidTracked ? 'SÌ' : 'NO'}`);
  
  // Verifica se l'fbclid è già presente nella sessione
  const sessionFbclid = req.session && req.session.fbclid;
  if (!fbclid && sessionFbclid) {
    console.log(`fbclid non trovato nella query ma presente in sessione: ${sessionFbclid}`);
    fbclid = sessionFbclid;
  }
  
  // Procedi solo se c'è un fbclid nella URL e non è stato già tracciato questo fbclid
  if (fbclid && (!req.session || !req.session.fbclidTracked || req.session.fbclid !== fbclid)) {
    // Salva fbclid in sessione se presente
    if (req.session) {
      req.session.fbclid = fbclid;
      req.session.fbclidTimestamp = Date.now(); // Aggiungere questa linea
      req.session.fbclidTracked = true;
      console.log(`fbclid "${fbclid}" salvato in sessione e marcato come tracciato`);
    }
    
    try {
      // Genera un ID evento univoco per la deduplicazione
      const eventId = 'pageview_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
      console.log(`Generato eventId: ${eventId}`);
      
      // Costruzione del payload con solo fbclid (senza dati personali)
      const payload = {
        data: [{
          event_name: 'PageView',
          event_time: Math.floor(Date.now() / 1000),
          event_id: eventId,
          event_source_url: req.headers.referer || `https://${req.get('host')}${req.originalUrl}`,
          user_data: {
            client_user_agent: req.headers['user-agent'] || '',
            // Non includere fbclid direttamente in user_data
          },
          custom_data: {}
        }],
        access_token: process.env.ACCESS_TOKEN,
        partner_agent: 'costruzionedigitale-nodejs',
        test_event_code: process.env.NODE_ENV === 'production' ? undefined : process.env.FACEBOOK_TEST_EVENT_CODE
      };
      
      // Aggiungi fbclid al campo corretto
      if (fbclid) {
        // L'fbclid deve essere passato come parametro esterno per il matching
        const timestamp = Date.now();
        payload.data[0].user_data.fbc = `fb.1.${timestamp}.${fbclid}`;
        console.log(`fbclid convertito in fbc e aggiunto ai dati utente: ${payload.data[0].user_data.fbc}`);
      }
      
      console.log('Payload PageView preparato:');
      console.log(JSON.stringify(payload.data[0], null, 2));
      
      // Invia l'evento PageView alla CAPI
      console.log('Invio evento PageView a Facebook...');
      const response = await axios.post(
        `https://graph.facebook.com/v17.0/1543790469631614/events`,
        payload
      );
      
      console.log('CAPI PageView iniziale inviato con successo');
      console.log('Risposta da Facebook:', JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.error('❌ ERRORE invio PageView a CAPI:');
      if (error.response) {
        console.error('Status:', error.response.status);
        console.error('Dati errore:', JSON.stringify(error.response.data, null, 2));
      } else {
        console.error('Errore completo:', error.message);
      }
    }
  } else if (fbclid && req.session && req.session.fbclidTracked && req.session.fbclid === fbclid) {
    console.log(`Nessun evento inviato: fbclid "${fbclid}" già tracciato in precedenza`);
  } else if (req.session && req.session.fbclid) {
    console.log(`fbclid non trovato nell'URL ma presente in sessione: ${req.session.fbclid}`);
  } else {
    console.log('Nessun evento inviato: fbclid non presente nell\'URL');
  }
  
  console.log('====================================');
  next();
});

// ----- ROUTES PER IL FRONTEND -----

// Sul server (da aggiungere a server.js)
app.post('/api/cookie-consent/reset', async (req, res) => {
  try {
    const userId = req.cookies.userId;
    
    if (userId) {
      // Rimuovi il record dal database
      await CookieConsent.findOneAndDelete({ userId });
    }
    
    // Cancella i cookie
    res.clearCookie('userId');
    res.clearCookie('user_cookie_consent');
    
    res.status(200).json({ 
      success: true, 
      message: 'Preferenze cookie resettate con successo'
    });
  } catch (error) {
    console.error('Errore nel reset delle preferenze cookie:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel reset delle preferenze cookie'
    });
  }
});

// Route form webhook per Facebook
app.get('/webhook/facebook-leads', (req, res) => {
  try {
    // Verifica dell'autenticazione del webhook
    const VERIFY_TOKEN = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN;
    
    console.log('Richiesta di verifica webhook ricevuta');
    console.log('Query params:', req.query);
    
    // Verifica del modo - per la configurazione iniziale
    if (req.query['hub.mode'] === 'subscribe' && 
        req.query['hub.verify_token'] === VERIFY_TOKEN) {
      console.log('Webhook verificato con successo!');
      return res.status(200).send(req.query['hub.challenge']);
    }
    
    // Se è una semplice visita all'URL senza parametri di verifica
    if (!req.query['hub.mode']) {
      return res.status(200).send('Webhook endpoint attivo. Usa questo URL nella configurazione di Facebook.');
    }
    
    // Se la verifica fallisce
    console.log('Verifica webhook fallita: token non valido');
    res.status(403).send('Forbidden: token non valido');
  } catch (error) {
    console.error('Errore nella verifica del webhook:', error);
    res.status(500).send('Errore interno');
  }
});

// Webhook per ricevere lead da Facebook
app.post('/webhook/facebook-leads', async (req, res) => {
  try {
    // Verifica dell'autenticazione del webhook
    const VERIFY_TOKEN = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN;
    
    // Verifica del modo - per la configurazione iniziale
    if (req.query['hub.mode'] === 'subscribe' && 
        req.query['hub.verify_token'] === VERIFY_TOKEN) {
      console.log('Webhook verificato con successo!');
      return res.status(200).send(req.query['hub.challenge']);
    }
    
    // Elabora la notifica di lead
    const data = req.body;
    
    // Verifica che sia una notifica di lead
    if (data.object === 'page' && data.entry && data.entry.length > 0) {
      for (const entry of data.entry) {
        for (const change of entry.changes) {
          if (change.field === 'leadgen' && change.value) {
            const leadData = change.value;
            console.log('Nuovo lead ricevuto:', leadData);
            
            // L'ID del lead è in leadData.leadgen_id
            const leadId = leadData.leadgen_id;
            const formId = leadData.form_id;
            
            try {
              // Recupera i dettagli completi del lead tramite API Graph
              await retrieveLeadDetails(leadId, formId);
            } catch (error) {
              console.log('Impossibile recuperare dettagli completi, salvataggio dati di base del lead');
              
              // Salva almeno i dati di base nel modello FacebookLead
              try {
                const newLead = await FacebookLead.create({
                  leadId: leadData.leadgen_id,
                  formId: leadData.form_id,
                  adId: leadData.ad_id,
                  pageId: leadData.page_id,
                  adgroupId: leadData.adgroup_id,
                  createdTime: leadData.created_time,
                  name: 'Lead da Facebook',
                  email: 'lead@facebook.com',  // Email placeholder
                  phone: '',
                  rawData: leadData
                });
                
                console.log('Lead Facebook di base salvato nel database con ID:', newLead._id);
              } catch (dbError) {
                console.error('Errore nel salvataggio dei dati di base del lead:', dbError);
              }
            }
          }
        }
      }
    }
    
    // Rispondi con successo a Facebook
    res.status(200).send('EVENT_RECEIVED');
  } catch (error) {
    console.error('Errore webhook lead:', error);
    res.status(500).send('ERRORE_INTERNO');
  }
});

// Funzione per recuperare i dettagli completi del lead
async function retrieveLeadDetails(leadId, formId) {
  try {
    // Assicurati di avere un token d'accesso con i permessi necessari
    const response = await axios.get(
      `https://graph.facebook.com/v17.0/${leadId}?access_token=${process.env.FACEBOOK_ACCESS_TOKEN}`
    );
    
    const leadDetails = response.data;
    console.log('Dettagli lead:', leadDetails);
    
    // Estrai i campi del form (dipende dalla struttura del tuo form)
    const fieldsData = {};
    if (leadDetails.field_data && leadDetails.field_data.length > 0) {
      for (const field of leadDetails.field_data) {
        fieldsData[field.name] = field.values[0];
      }
    }
    
    // Crea un nuovo lead nel modello FacebookLead
    const newLead = await FacebookLead.create({
      leadId: leadId,
      formId: formId,
      adId: leadDetails.ad_id,
      pageId: leadDetails.page_id,
      adgroupId: leadDetails.adgroup_id,
      createdTime: leadDetails.created_time,
      name: fieldsData.full_name || fieldsData.name || 'N/A',
      email: fieldsData.email || 'N/A',
      phone: fieldsData.phone_number || fieldsData.phone || 'N/A',
      customFields: fieldsData,
      rawData: leadDetails
    });
    
    console.log('Lead Facebook salvato nel database:', newLead._id);
    
    // Opzionale: invia una conferma via email
    // sendLeadNotificationEmail(newLead);
    
    return newLead;
  } catch (error) {
    console.error('Errore recupero dettagli lead:', error);
    throw error;
  }
}

// Route per la gestione dell'invio del form
app.post('/api/submit-form', async (req, res) => {
  try {
    // Genera un ID evento univoco per la deduplicazione
    const eventId = 'event_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
    
    // Aggiungi fbclid al formData se presente nella sessione
    const formDataWithFbclid = { ...req.body };
    if (req.session && req.session.fbclid) {
      formDataWithFbclid.fbclid = req.session.fbclid;
      formDataWithFbclid.fbclidTimestamp = req.session.fbclidTimestamp || Date.now(); // Aggiungere questa linea
      console.log(`Salvato fbclid "${req.session.fbclid}" con i dati del form`);
    }
    
    // Salva i dati nel database
    const formData = new FormData(formDataWithFbclid);
    await formData.save();
    
    // Invia evento alla Facebook Conversion API
    try {
      const userData = {
        email: req.body.email,
        phone: req.body.phone,
        name: req.body.name
      };
      
      const eventData = {
        sourceUrl: req.headers.referer || 'https://costruzionedigitale.com',
        customData: {
          form_type: req.body.source || 'contact_form',
          content_name: 'Richiesta di contatto'
        }
      };
      
      console.log('Invio evento Lead alla CAPI dal form di contatto...');
      console.log('Dati form:', req.body);
      // Invia l'evento come Lead
      await sendFacebookConversionEvent('Lead', userData, eventData, eventId, req);
    } catch (conversionError) {
      console.error('Errore completo nell\'invio dell\'evento alla CAPI:', conversionError);
    }
    
    console.log('Dati salvati in MongoDB:', formDataWithFbclid);
    
    // Restituisci l'eventId per la deduplicazione lato client
    res.status(200).json({ success: true, eventId });
  } catch (error) {
    console.error('Errore nel salvataggio dei dati:', error);
    res.status(500).json({ success: false, error: 'Errore nel salvataggio dei dati' });
  }
});

app.post('/api/submit-booking', async (req, res) => {
  try {
    // Genera un ID evento univoco per la deduplicazione
    const eventId = 'event_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
    
    // Assicurati che il timestamp della prenotazione sia valido
    const bookingData = { ...req.body };
    
    // Aggiungi fbclid alla prenotazione se presente nella sessione
    if (req.session && req.session.fbclid) {
      bookingData.fbclid = req.session.fbclid;
      bookingData.fbclidTimestamp = req.session.fbclidTimestamp || Date.now(); // Aggiungere questa linea
      console.log(`Salvato fbclid "${req.session.fbclid}" con i dati della prenotazione`);
    }

    // Parse del timestamp se è una stringa, mantenendo l'ora locale
    if (typeof bookingData.bookingTimestamp === 'string') {
        // Crea un timestamp dal valore ISO string mantenendo l'ora corretta
        const bookingTimestamp = new Date(bookingData.bookingTimestamp);
        
        // Estrai l'ora dalla stringa dell'orario fornita
        // perché il timestamp ISO potrebbe aver modificato il fuso orario
        if (bookingData.bookingTime) {
            const hourString = bookingData.bookingTime.split(':')[0];
            const hour = parseInt(hourString, 10);
            
            // Assicurati che sia l'ora corretta nel database
            const date = new Date(bookingTimestamp);
            date.setHours(hour, 0, 0, 0);
            bookingData.bookingTimestamp = date;
            
            console.log('Submit - Orario dalla stringa:', hour + ':00');
            console.log('Submit - Data prenotazione:', bookingData.bookingDate);
            console.log('Submit - Timestamp aggiornato:', date.toISOString());
        } else {
            bookingData.bookingTimestamp = bookingTimestamp;
        }
    }
    
    // Controlla se già esiste una prenotazione per lo stesso orario
    const bookingHour = new Date(bookingData.bookingTimestamp).getHours();
    const bookingDay = new Date(bookingData.bookingTimestamp).setHours(0, 0, 0, 0);
    
    console.log('Controllo prenotazioni esistenti per ora:', bookingHour, 'e giorno:', new Date(bookingDay).toISOString());
    
    const existingBooking = await Booking.findOne({
        $and: [
            // Stessa data (ignorando l'ora)
            {
                bookingTimestamp: {
                    $gte: new Date(bookingDay),
                    $lt: new Date(bookingDay + 24 * 60 * 60 * 1000)
                }
            },
            // Stessa ora
            {
                $expr: {
                    $eq: [{ $hour: "$bookingTimestamp" }, bookingHour]
                }
            },
            // Non cancellata
            { status: { $ne: 'cancelled' } }
        ]
    });
    
    if (existingBooking) {
      return res.status(409).json({ 
        success: false, 
        error: 'Questo orario è già stato prenotato. Per favore, seleziona un altro orario.' 
      });
    }
    
    // Crea un nuovo documento di prenotazione
    const booking = new Booking(bookingData);
    
    // Salva la prenotazione
    await booking.save();
    
    console.log('Nuova prenotazione salvata:', {
      name: booking.name,
      email: booking.email,
      date: booking.bookingDate,
      time: booking.bookingTime,
      timestamp: booking.bookingTimestamp,
      fbclid: booking.fbclid // Log del fbclid salvato
    });
    
    // Invia email di conferma all'utente
    try {
      await sendBookingConfirmationEmail(booking);
    } catch (emailError) {
      console.error('Errore invio email:', emailError);
      // Continuiamo comunque perché la prenotazione è stata salvata
    }
    
    // Invia evento alla Facebook Conversion API
    try {
      const userData = {
        email: req.body.email,
        phone: req.body.phone,
        name: req.body.name
      };
      
      const eventData = {
        sourceUrl: req.headers.referer || 'https://costruzionedigitale.com',
        customData: {
          form_type: 'booking_call',
          content_name: 'Prenotazione chiamata',
          booking_date: req.body.bookingDate,
          booking_time: req.body.bookingTime
        }
      };
      
      console.log('Invio eventi alla CAPI dalla prenotazione...');
      console.log('Dati prenotazione:', {
        name: req.body.name,
        email: req.body.email,
        date: req.body.bookingDate,
        time: req.body.bookingTime
      });
      
      // Invia l'evento come Lead e Schedule
      console.log('Invio evento Lead...');
      await sendFacebookConversionEvent('Lead', userData, eventData, eventId + '_lead', req);
      
      console.log('Invio evento Schedule...');
      await sendFacebookConversionEvent('Schedule', userData, eventData, eventId + '_schedule', req);
    } catch (conversionError) {
      console.error('Errore completo nell\'invio degli eventi alla CAPI:', conversionError);
    }
    
    // Restituisci l'eventId per la deduplicazione lato client
    res.status(200).json({ 
      success: true, 
      eventId, 
      message: 'Prenotazione completata con successo'
    });
  } catch (error) {
    console.error('Errore nella prenotazione:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Errore durante la prenotazione',
      details: error.message
    });
  }
});

// NUOVO: Route per verificare disponibilità delle date
app.get('/api/booking/availability', async (req, res) => {
  try {
    const { date } = req.query;
    
    if (!date) {
      return res.status(400).json({ success: false, error: 'Data non specificata' });
    }
    
    // Converte la data in formato ISO in un oggetto Date
    // Assicurandosi che la data sia interpretata come mezzanotte UTC
    const selectedDate = new Date(date + 'T00:00:00.000Z');
    
    // Log per debugging
    console.log('Data richiesta:', date);
    console.log('Data convertita:', selectedDate);
    
    // Imposta la data a mezzanotte locale
    selectedDate.setHours(0, 0, 0, 0);
    
    // Trova le prenotazioni per la data selezionata
    const nextDay = new Date(selectedDate);
    nextDay.setDate(nextDay.getDate() + 1);
    
    console.log('Cercando prenotazioni tra', selectedDate, 'e', nextDay);
    
    const bookings = await Booking.find({
      bookingTimestamp: {
        $gte: selectedDate,
        $lt: nextDay
      },
      status: { $ne: 'cancelled' }
    });
    
    console.log('Prenotazioni trovate:', bookings.length);
    
    // Slot orari disponibili (9:00 - 17:00)
    const workHours = [9, 10, 11, 12, 14, 15, 16, 17];
    
    // Trova gli slot già prenotati
    const bookedSlots = bookings.map(booking => {
      // Estrai solo l'ora dal timestamp della prenotazione
      if (booking.bookingTimestamp) {
        // Crea un oggetto date locale senza conversione UTC
        const bookingDate = new Date(booking.bookingTimestamp);
        // Ajusta l'orario per il fuso UTC+2 (Roma)
        const localHour = bookingDate.getHours();
        return localHour;
      }
      
      // Fallback: estrai l'ora dalla stringa dell'orario se il timestamp non è valido
      if (booking.bookingTime) {
        const hourStr = booking.bookingTime.split(':')[0];
        return parseInt(hourStr, 10);
      }
      
      return null;
    }).filter(hour => hour !== null);
    
    console.log('Orari prenotati:', bookedSlots);
    
    // Genera l'array di disponibilità
    const availability = workHours.map(hour => ({
      hour,
      formatted: `${hour}:00`,
      available: !bookedSlots.includes(hour)
    }));
    
    res.status(200).json({ 
      success: true, 
      date: selectedDate.toISOString().split('T')[0],
      availability,
      message: 'Disponibilità recuperata con successo'
    });
  } catch (error) {
    console.error('Errore nel recupero disponibilità:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Errore nel recupero disponibilità',
      details: error.message 
    });
  }
});

// API pubblica per ottenere le prenotazioni
app.get('/api/bookings', async (req, res) => {
  try {
    // Parametri per paginazione e filtri
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    // Imposta filtri se presenti
    let query = {};
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      query = {
        $or: [
          { name: searchRegex },
          { email: searchRegex },
          { phone: searchRegex }
        ]
      };
    }
    
    // Filtro per stato
    if (req.query.status) {
      query.status = req.query.status;
    }
    
    // Filtro per data
    if (req.query.after) {
      query.bookingTimestamp = { $gte: new Date(req.query.after) };
    }
    
    if (req.query.before) {
      if (!query.bookingTimestamp) query.bookingTimestamp = {};
      query.bookingTimestamp.$lte = new Date(req.query.before);
    }
    
    // Conta totale documenti per paginazione
    const total = await Booking.countDocuments(query);
    
    // Ottieni i dati con ordinamento, paginazione e filtri
    const bookings = await Booking.find(query)
      .sort({ bookingTimestamp: 1 }) // Ordina per data della prenotazione
      .skip(skip)
      .limit(limit);
    
    res.status(200).json({
      success: true,
      data: bookings,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Errore recupero prenotazioni:', error);
    res.status(500).json({ success: false, message: 'Errore nel recupero delle prenotazioni' });
  }
});

// API pubblica per aggiornare lo stato di una prenotazione
app.put('/api/bookings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    // Verifica che lo stato sia valido
    const validStatuses = ['pending', 'confirmed', 'cancelled', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Stato non valido' });
    }
    
    // Trova e aggiorna la prenotazione
    const booking = await Booking.findByIdAndUpdate(
      id, 
      { status }, 
      { new: true }
    );
    
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Prenotazione non trovata' });
    }
    
    // Se lo stato è cambiato a "confirmed", invia un'email di conferma
    if (status === 'confirmed') {
      await sendBookingStatusEmail(booking, 'confirmed');
    }
    
    // Se lo stato è cambiato a "cancelled", invia un'email di cancellazione
    if (status === 'cancelled') {
      await sendBookingStatusEmail(booking, 'cancelled');
    }
    
    res.status(200).json({ success: true, data: booking });
  } catch (error) {
    console.error('Errore aggiornamento prenotazione:', error);
    res.status(500).json({ success: false, message: 'Errore nell\'aggiornamento della prenotazione' });
  }
});

// ----- ROUTES PER GESTIONE COOKIE -----

// Route per ottenere lo stato attuale del consenso ai cookie
app.get('/api/cookie-consent', async (req, res) => {
  try {
    const userId = req.cookies.userId;
    
    if (!userId) {
      return res.status(200).json({
        essential: true,
        analytics: false,
        marketing: false,
        configured: false
      });
    }
    
    const consent = await CookieConsent.findOne({ userId });
    
    if (!consent) {
      return res.status(200).json({
        essential: true,
        analytics: false,
        marketing: false,
        configured: false
      });
    }
    
    res.status(200).json({
      essential: consent.essential,
      analytics: consent.analytics,
      marketing: consent.marketing,
      configured: consent.configured || false
    });
  } catch (error) {
    console.error('Errore nel recupero del consenso cookie:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel recupero delle preferenze cookie'
    });
  }
});

// Route per salvare il consenso ai cookie
app.post('/api/cookie-consent', async (req, res) => {
  try {
    const { essential, analytics, marketing } = req.body;
    const userId = req.cookies.userId || generateUserId();
    
    console.log('=============== SALVATAGGIO COOKIE CONSENT ===============');
    console.log('Cookie userId ricevuto:', req.cookies.userId);
    console.log('userId utilizzato:', userId);
    console.log('Cookie consent ricevuto:', req.cookies.user_cookie_consent);
    console.log('Body della richiesta:', req.body);
    
    // Se l'utente non ha ancora un ID, imposta il cookie
    if (!req.cookies.userId) {
      res.cookie('userId', userId, { 
        maxAge: 365 * 24 * 60 * 60 * 1000, // 1 anno (cambiato da session-only)
        httpOnly: true,
        sameSite: 'strict'
      });
    }
    
    // Imposta anche il cookie di consenso nel browser per garantire la sincronizzazione
    res.cookie('user_cookie_consent', JSON.stringify({
      essential: essential !== undefined ? essential : true,
      analytics: analytics !== undefined ? analytics : false,
      marketing: marketing !== undefined ? marketing : false,
      configured: true
    }), { 
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 anno
      path: '/',
      sameSite: 'strict'
    });
    
    // Cerca il consenso esistente o crea nuovo
    let consent = await CookieConsent.findOne({ userId });
    
    if (consent) {
      // Aggiorna il consenso esistente
      consent.essential = essential !== undefined ? essential : true; // Essential è sempre true
      consent.analytics = analytics !== undefined ? analytics : false;
      consent.marketing = marketing !== undefined ? marketing : false;
      consent.configured = true;  // Segna come configurato
      consent.updatedAt = new Date();
      await consent.save();
    } else {
      // Crea un nuovo record di consenso
      consent = await CookieConsent.create({
        userId,
        essential: essential !== undefined ? essential : true,
        analytics: analytics !== undefined ? analytics : false,
        marketing: marketing !== undefined ? marketing : false,
        configured: true  // Segna come configurato
      });
    }
    
    res.status(200).json({ 
      success: true, 
      message: 'Preferenze cookie salvate con successo',
      consent: {
        essential: consent.essential,
        analytics: consent.analytics,
        marketing: consent.marketing,
        configured: consent.configured
      }
    });
  } catch (error) {
    console.error('Errore nel salvataggio del consenso cookie:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel salvataggio delle preferenze cookie'
    });
  }
});

// Funzione per formattare la fonte 
function formatSource(source) {
  switch (source) {
    case 'hero-form':
      return 'Form Hero';
    case 'popup-form':
      return 'Form Popup';
    case 'contatti-form':
      return 'Form Contatti';
    case 'booking-form':
      return 'Prenotazione Chiamata';
    default:
      return source || 'Sconosciuto';
  }
}

// Funzione per formattare lo stato della prenotazione
function formatStatus(status) {
  switch (status) {
    case 'pending':
      return 'In attesa';
    case 'confirmed':
      return 'Confermata';
    case 'cancelled':
      return 'Cancellata';
    case 'completed':
      return 'Completata';
    default:
      return status || 'Sconosciuto';
  }
}

// Funzione per inviare eventi alla Facebook Conversion API
async function sendFacebookConversionEvent(eventName, userData, eventData, eventId, req) {
  console.log(`\n========== INVIO EVENTO ${eventName} ==========`);
  
  try {
    // Verifica che l'access token sia configurato
    if (!process.env.ACCESS_TOKEN) {
      console.error('❌ Facebook Access Token non configurato');
      return false;
    }

    // Inizializza con le impostazioni predefinite
    let hasConsent = false;
    let userFbclid = null;
    let consentSource = "nessuna fonte";
    
    // PASSO 1: Controlla prima i cookie del browser
    if (req && req.cookies && req.cookies.user_cookie_consent) {
      try {
        const cookieConsent = JSON.parse(req.cookies.user_cookie_consent);
        if (cookieConsent && cookieConsent.configured) {
          hasConsent = cookieConsent.marketing === true;
          consentSource = "cookie browser";
          console.log(`Consenso marketing da cookie browser: ${hasConsent ? 'SÌ' : 'NO'}`);
        }
      } catch (e) {
        console.error('Errore nel parsing del cookie di consenso:', e);
      }
    }
    
    // PASSO 2: Se non abbiamo un consenso dai cookie, controlla il database
    if (!hasConsent && req && req.cookies && req.cookies.userId) {
      try {
        // Cerca direttamente nel database
        const userConsent = await CookieConsent.findOne({ userId: req.cookies.userId });
        
        if (userConsent && userConsent.configured) {
          hasConsent = userConsent.marketing === true;
          consentSource = "database";
          console.log(`Consenso marketing da database: ${hasConsent ? 'SÌ' : 'NO'}`);
          
          // Sincronizza il cookie se necessario
          if (!req.cookies.user_cookie_consent) {
            console.log('Sincronizzazione cookie consenso dal database al browser');
            res.cookie('user_cookie_consent', JSON.stringify({
              essential: userConsent.essential,
              analytics: userConsent.analytics,
              marketing: userConsent.marketing,
              configured: userConsent.configured
            }), { 
              maxAge: 365 * 24 * 60 * 60 * 1000, // 1 anno
              path: '/',
              sameSite: 'strict'
            });
          }
        }
      } catch (dbError) {
        console.error('Errore nel recupero consenso dal database:', dbError);
      }
    }
    
    console.log(`Fonte consenso: ${consentSource}`);
    
    // Ottieni fbclid dalla sessione se disponibile
    if (req && req.session && req.session.fbclid) {
      userFbclid = req.session.fbclid;
      console.log(`fbclid in sessione: ${userFbclid}`);
    }

    // Per gli eventi che non sono PageView, verifica il consenso ai cookie di marketing
    if (eventName !== 'PageView' && !hasConsent) {
      // Se non c'è consenso di marketing ma abbiamo un fbclid, possiamo usare solo quello
      if (userFbclid) {
        console.log('Consenso marketing NON fornito ma fbclid disponibile: invio solo fbclid');
        
        const payload = {
          data: [{
            event_name: eventName,
            event_time: Math.floor(Date.now() / 1000),
            event_id: eventId,
            event_source_url: eventData.sourceUrl || 'https://costruzionedigitale.com',
            user_data: {
              client_user_agent: req.headers['user-agent'] || '',
              fbc: `fb.1.${Date.now()}.${userFbclid}`
            },
            custom_data: eventData.customData || {}
          }],
          access_token: process.env.ACCESS_TOKEN,
          partner_agent: 'costruzionedigitale-nodejs',
          test_event_code: process.env.NODE_ENV === 'production' ? undefined : process.env.FACEBOOK_TEST_EVENT_CODE
        };
      
        const response = await axios.post(
          `https://graph.facebook.com/v17.0/1543790469631614/events`,
          payload
        );
      
        console.log(`✅ CAPI ${eventName} inviato solo con fbclid (no dati utente)`);
        return true;
      }
      
      console.log(`❌ Evento ${eventName} NON inviato: consenso marketing non fornito e fbclid non disponibile`);
      return false;
    }

    console.log('Preparazione dati con hashing per la privacy...');
    // Preparazione dei dati dell'utente con hashing per la privacy
    const hashedUserData = {
      em: userData.email ? crypto.createHash('sha256').update(userData.email.toLowerCase().trim()).digest('hex') : undefined,
      ph: userData.phone ? crypto.createHash('sha256').update(userData.phone.replace(/\D/g, '')).digest('hex') : undefined,
      fn: userData.name ? crypto.createHash('sha256').update(userData.name.split(' ')[0].toLowerCase().trim()).digest('hex') : undefined,
      ln: userData.name && userData.name.includes(' ') ? crypto.createHash('sha256').update(userData.name.split(' ').slice(1).join(' ').toLowerCase().trim()).digest('hex') : undefined,
      client_user_agent: req.headers['user-agent'] || ''
    };

    // Filtro per rimuovere valori undefined
    Object.keys(hashedUserData).forEach(key => 
      hashedUserData[key] === undefined && delete hashedUserData[key]
    );

    console.log('Dati utente dopo hashing:');
    console.log(JSON.stringify(hashedUserData, null, 2));

    // Costruzione del payload
    const payload = {
      data: [{
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        event_source_url: eventData.sourceUrl || 'https://costruzionedigitale.com',
        user_data: hashedUserData,
        custom_data: eventData.customData || {}
      }],
      access_token: process.env.ACCESS_TOKEN,
      partner_agent: 'costruzionedigitale-nodejs',
      test_event_code: process.env.NODE_ENV === 'production' ? undefined : process.env.FACEBOOK_TEST_EVENT_CODE
    };
  
    // Aggiungi fbc se l'fbclid è disponibile in sessione
    if (req && req.session && req.session.fbclid) {
      // Formato fbc: fb.1.TIMESTAMP.fbclid
      const timestamp = req.session.fbclidTimestamp || Date.now();
      hashedUserData.fbc = `fb.1.${timestamp}.${req.session.fbclid}`;
      console.log(`fbclid convertito in fbc e aggiunto ai dati utente: ${hashedUserData.fbc}`);
    }

    console.log('Payload completo preparato:');
    console.log(JSON.stringify(payload.data[0], null, 2));
    
    // Invio dell'evento alla CAPI
    console.log('Invio evento a Facebook...');
    const response = await axios.post(
      `https://graph.facebook.com/v17.0/1543790469631614/events`,
      payload
    );

    console.log(`✅ CAPI ${eventName} inviato con successo!`);
    console.log('Risposta da Facebook:', JSON.stringify(response.data, null, 2));
    console.log('=========================================\n');
    return true;
  } catch (error) {
    console.error(`❌ ERRORE nell'invio dell'evento ${eventName} alla CAPI:`);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Dati errore:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Errore completo:', error.message);
    }
    console.error('=========================================\n');
    return false;
  }
}

// Funzione per inviare email di conferma prenotazione
async function sendBookingConfirmationEmail(booking) {
  try {
    const bookingDate = new Date(booking.bookingTimestamp);
    const formattedDate = bookingDate.toLocaleDateString('it-IT', {
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric'
    });
    
    // Opzioni per l'email al cliente
    const clientMailOptions = {
      from: `"Costruzione Digitale" <${process.env.EMAIL_FROM || 'info@costruzionedigitale.com'}>`,
      to: booking.email,
      subject: 'Conferma prenotazione chiamata conoscitiva',
      html: `
        <style type="text/css">
          /* Sovrascrivi gli stili di Gmail */
          .im {
            color: inherit !important;
          }
        </style>
        <div style="font-family: 'Montserrat', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; color: #FFFFFF !important; background-color: #212121; border-radius: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.3);">
          <div style="text-align: center; margin-bottom: 30px;">
            <img src="https://costruzionedigitale.com/logosito.webp" alt="Costruzione Digitale" style="height: 80px;">
          </div>
          
          <h2 style="color: #FF6B00 !important; margin-bottom: 25px; font-weight: 700; text-transform: uppercase; text-align: center;">Prenotazione Confermata!</h2>
          
          <p style="margin-bottom: 15px; line-height: 1.6; color: #FFFFFF !important;">Gentile ${booking.name},</p>
          
          <p style="margin-bottom: 20px; line-height: 1.6; color: #FFFFFF !important;">Grazie per aver prenotato una chiamata conoscitiva con Costruzione Digitale. Di seguito i dettagli della tua prenotazione:</p>
          
          <div style="background-color: #333333; padding: 20px; border-radius: 10px; margin: 25px 0; border-left: 4px solid #FF6B00;">
            <p style="margin-bottom: 10px; color: #FFFFFF !important;"><strong style="color: #FF6B00 !important;">Data:</strong> ${formattedDate}</p>
            <p style="margin-bottom: 10px; color: #FFFFFF !important;"><strong style="color: #FF6B00 !important;">Orario:</strong> ${booking.bookingTime}</p>
            <p style="margin-bottom: 0; color: #FFFFFF !important;"><strong style="color: #FF6B00 !important;">Durata:</strong> 30 minuti</p>
          </div>
          
          <p style="margin-bottom: 20px; line-height: 1.6; color: #FFFFFF !important;">Uno dei nostri esperti ti contatterà al numero ${booking.phone} all'orario stabilito.</p>
          
          <p style="margin-bottom: 15px; line-height: 1.6; color: #FFFFFF !important;">Se desideri modificare o cancellare la prenotazione, ti preghiamo di contattarci rispondendo a questa email o chiamando il nostro numero +39 0123 456789.</p>
          
          <p style="margin-bottom: 15px; line-height: 1.6; color: #FFFFFF !important;">Per prepararti al meglio alla chiamata, potresti pensare a:</p>
          <ul style="margin-bottom: 25px; padding-left: 20px; line-height: 1.8; color: #FFFFFF !important;">
            <li style="color: #FFFFFF !important;">Obiettivi del tuo progetto digitale</li>
            <li style="color: #FFFFFF !important;">Eventuali sfide o problemi che stai affrontando</li>
            <li style="color: #FFFFFF !important;">Domande specifiche che vorresti porci</li>
          </ul>
          
          <p style="margin-bottom: 10px; line-height: 1.6; color: #FFFFFF !important;">A presto!</p>
          
          <p style="margin-bottom: 30px; line-height: 1.6; color: #FFFFFF !important;">Il team di <span style="color: #FF6B00 !important; font-weight: 700;">Costruzione Digitale</span></p>
          
          <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 13px; color: rgba(255,255,255,0.7) !important; text-align: center;">
            <p style="margin-bottom: 5px; color: rgba(255,255,255,0.7) !important;">Costruzione Digitale Srl - Via Esempio 123, Milano</p>
            <p style="margin-bottom: 5px; color: rgba(255,255,255,0.7) !important;">Tel: +39 0123 456789 - Email: info@costruzionedigitale.com</p>
            <p style="margin-bottom: 0; font-size: 11px; margin-top: 15px; color: rgba(255,255,255,0.5) !important;">© ${new Date().getFullYear()} Costruzione Digitale. Tutti i diritti riservati.</p>
          </div>
        </div>
      `
    };
    
    // Opzioni per l'email di notifica all'amministratore
    const adminMailOptions = {
      from: `"Sistema di Prenotazioni" <${process.env.EMAIL_FROM || 'info@costruzionedigitale.com'}>`,
      to: 'olegbolonniy@gmail.com',
      subject: `Nuova prenotazione: ${booking.name} - ${formattedDate} ${booking.bookingTime}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
          <h2 style="color: #FF6B00; margin-bottom: 20px;">Nuova Prenotazione Ricevuta</h2>
          
          <p>È stata effettuata una nuova prenotazione per una chiamata conoscitiva. Ecco i dettagli:</p>
          
          <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Nome cliente:</strong> ${booking.name}</p>
            <p><strong>Email:</strong> ${booking.email}</p>
            <p><strong>Telefono:</strong> ${booking.phone}</p>
            <p><strong>Data:</strong> ${formattedDate}</p>
            <p><strong>Orario:</strong> ${booking.bookingTime}</p>
            <p><strong>Origine:</strong> ${formatSource(booking.source)}</p>
            ${booking.message ? `<p><strong>Messaggio:</strong> ${booking.message}</p>` : ''}
          </div>
          
          <p>Ricordati di contattare il cliente all'orario stabilito.</p>
          
          <p>Sistema di prenotazioni automatizzato di Costruzione Digitale</p>
        </div>
      `
    };
    
    // Invia l'email al cliente
    const clientInfo = await transporter.sendMail(clientMailOptions);
    console.log('Email di conferma inviata al cliente:', clientInfo.messageId);
    
    // Invia l'email di notifica all'amministratore
    const adminInfo = await transporter.sendMail(adminMailOptions);
    console.log('Email di notifica inviata all\'amministratore:', adminInfo.messageId);
    
    return true;
  } catch (error) {
    console.error('Errore invio email di conferma:', error);
    // Non bloccheremo il flusso se l'email fallisce
    return false;
  }
}

// Funzione per inviare email di aggiornamento stato
async function sendBookingStatusEmail(booking, status) {
  try {
    const bookingDate = new Date(booking.bookingTimestamp);
    const formattedDate = bookingDate.toLocaleDateString('it-IT', {
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric'
    });
    
    let subject, content;
    
    if (status === 'confirmed') {
      subject = 'Prenotazione confermata';
      content = `
        <h2 style="color: #27ae60; margin-bottom: 20px;">Prenotazione Confermata</h2>
        <p>Gentile ${booking.name},</p>
        <p>Siamo lieti di confermare la tua prenotazione per una chiamata conoscitiva con Costruzione Digitale.</p>
        <p>Ti contatteremo al numero ${booking.phone} come programmato.</p>
      `;
    } else if (status === 'cancelled') {
      subject = 'Prenotazione cancellata';
      content = `
        <h2 style="color: #e74c3c; margin-bottom: 20px;">Prenotazione Cancellata</h2>
        <p>Gentile ${booking.name},</p>
        <p>La tua prenotazione per una chiamata conoscitiva con Costruzione Digitale è stata cancellata.</p>
        <p>Se desideri riprogrammare la chiamata, puoi farlo visitando il nostro sito web o contattandoci direttamente.</p>
      `;
    } else {
      return false; // Non inviamo email per altri stati
    }
    
    // Opzioni per l'email
    const mailOptions = {
      from: `"Costruzione Digitale" <${process.env.EMAIL_FROM || 'info@costruzionedigitale.com'}>`,
      to: booking.email,
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
          <div style="text-align: center; margin-bottom: 30px;">
            <img src="https://costruzionedigitale.com/logosito.webp" alt="Costruzione Digitale" style="height: 60px;">
          </div>
          
          ${content}
          
          <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Data:</strong> ${formattedDate}</p>
            <p><strong>Orario:</strong> ${booking.bookingTime}</p>
          </div>
          
          <p>Per qualsiasi domanda, non esitare a contattarci rispondendo a questa email o chiamando il nostro numero +39 0123 456789.</p>
          
          <p>Cordiali saluti,</p>
          <p>Il team di Costruzione Digitale</p>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #777; text-align: center;">
            <p>Costruzione Digitale Srl - Via Esempio 123, Milano</p>
            <p>Tel: +39 0123 456789 - Email: info@CostruzioneDigitale.it</p>
          </div>
        </div>
      `
    };
    
    // Invia l'email
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email di ${status} inviata:`, info.messageId);
    return true;
  } catch (error) {
    console.error(`Errore invio email di ${status}:`, error);
    // Non bloccheremo il flusso se l'email fallisce
    return false;
  }
}

// Reindirizza gli URL con .html a quelli senza estensione
app.get('*.html', (req, res) => {
  const urlWithoutExt = req.path.replace('.html', '');
  res.redirect(301, urlWithoutExt);
});

// In server.js: Aggiungi una nuova route per servire script di tracciamento basati sul consenso
app.get('/js/tracking.js', async (req, res) => {
  const userId = req.cookies.userId;
  
  // Valori predefiniti
  let consent = { essential: true, analytics: false, marketing: false };
  let consentSource = "default";
  
  // PASSO 1: Controlla prima i cookie del browser
  if (req.cookies.user_cookie_consent) {
    try {
      const cookieConsent = JSON.parse(req.cookies.user_cookie_consent);
      if (cookieConsent && cookieConsent.configured) {
        consent = {
          essential: cookieConsent.essential !== undefined ? cookieConsent.essential : true,
          analytics: cookieConsent.analytics !== undefined ? cookieConsent.analytics : false,
          marketing: cookieConsent.marketing !== undefined ? cookieConsent.marketing : false
        };
        consentSource = "browser_cookie";
      }
    } catch (error) {
      console.error('Errore nel parsing del cookie di consenso:', error);
    }
  }
  
  // PASSO 2: Se l'utente ha un ID, controlla anche il database
  if (userId && consentSource === "default") {
    try {
      const userConsent = await CookieConsent.findOne({ userId });
      if (userConsent && userConsent.configured) {
        consent = {
          essential: userConsent.essential,
          analytics: userConsent.analytics, 
          marketing: userConsent.marketing
        };
        consentSource = "database";
        
        // Se abbiamo trovato le preferenze nel database ma non nei cookie,
        // imposta il cookie per sincronizzare
        if (!req.cookies.user_cookie_consent) {
          res.cookie('user_cookie_consent', JSON.stringify({
            essential: consent.essential,
            analytics: consent.analytics,
            marketing: consent.marketing,
            configured: true
          }), { 
            maxAge: 365 * 24 * 60 * 60 * 1000, // 1 anno
            path: '/',
            sameSite: 'strict'
          });
        }
      }
    } catch (error) {
      console.error('Errore nel recupero del consenso dal database:', error);
    }
  }
  
  console.log(`Generando tracking.js con preferenze (fonte: ${consentSource}):`, consent);
  
  let trackingCode = '';
  
  // Base script sempre incluso
  trackingCode += `
    console.log("Consenso utente:", ${JSON.stringify(consent)});
    console.log("Fonte consenso:", "${consentSource}");
    window.userConsent = ${JSON.stringify(consent)};
  `;
  
  // Google Analytics - solo se il consenso analytics è true
  if (consent.analytics) {
    trackingCode += `
      // Google Analytics
      (function() {
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', 'G-MBFTYV86P7');
        
        // Carica lo script GA
        var gaScript = document.createElement('script');
        gaScript.async = true;
        gaScript.src = 'https://www.googletagmanager.com/gtag/js?id=G-MBFTYV86P7';
        document.head.appendChild(gaScript);
        
        console.log('Google Analytics attivato basato sul consenso utente');
      })();
    `;
  }
  
  // Meta Pixel - solo se il consenso marketing è true
  if (consent.marketing) {
    trackingCode += `
      // Meta Pixel
      (function() {
        !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
        n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
        document,'script','https://connect.facebook.net/en_US/fbevents.js');
        
        // Inizializza pixel e invia PageView
        window.fbEventId = 'event_' + new Date().getTime() + '_' + Math.random().toString(36).substring(2, 15);
        fbq('init', '1543790469631614');
        fbq('track', 'PageView', {}, {eventID: window.fbEventId});
        
        console.log('Meta Pixel attivato basato sul consenso utente, eventID:', window.fbEventId);
      })();
    `;
  }
  
  res.type('application/javascript');
  res.send(trackingCode);
});

app.get('/js/cookie-consent-manager.js', (req, res) => {
  res.type('application/javascript');
  res.send(`// CookieConsentManager.js - Generated by server
// Versione 1.0.0

class CookieConsentManager {
    constructor(options = {}) {
        // Configurazione base
        this.config = {
            cookieName: 'user_cookie_consent',
            cookieDuration: 365,
            analyticsId: 'G-MBFTYV86P7',
            metaPixelId: '1543790469631614',
            ...options
        };
        
        // Stato del consenso
        this.consent = {
            essential: true,
            analytics: false,
            marketing: false,
            configured: false
        };
    
        // Inizializza
        this.init();
    }

    async init() {
        // Carica le preferenze esistenti
        this.loadPreferences();
        
        // Collega gli eventi al banner
        this.bindExistingBanner();
        
        // Carica lo script di tracciamento dopo un piccolo ritardo
        setTimeout(() => {
            this.loadTrackingScript();
        }, 100);
    }

    loadPreferences() {
        // Inizia con i valori predefiniti
        let preferencesFound = false;
        
        // PASSO 1: Cerca prima nei cookie del browser
        const cookieValue = this.getCookie(this.config.cookieName);
        if (cookieValue) {
            try {
                const savedConsent = JSON.parse(cookieValue);
                this.consent = { ...this.consent, ...savedConsent };
                console.log('Preferenze cookie caricate dal cookie locale:', this.consent);
                preferencesFound = true;
            } catch (e) {
                console.error('Errore nel parsing delle preferenze cookie:', e);
            }
        }
        
        // PASSO 2: Se non trovate nei cookie, controlla il server in modo sincrono
        if (!preferencesFound) {
            // Utilizziamo XMLHttpRequest per una richiesta sincrona
            const xhr = new XMLHttpRequest();
            xhr.open('GET', '/api/cookie-consent', false); // false = sincrono
            xhr.withCredentials = true;
            
            try {
                xhr.send();
                if (xhr.status === 200) {
                    const serverConsent = JSON.parse(xhr.responseText);
                    
                    // Applica solo se ci sono dati e se configured è true
                    if (serverConsent && serverConsent.configured) {
                        this.consent = { ...this.consent, ...serverConsent };
                        console.log('Preferenze cookie caricate dal server:', this.consent);
                        
                        // Salva anche nei cookie locali per sincronizzare
                        this.setCookie(
                            this.config.cookieName,
                            JSON.stringify(this.consent),
                            this.config.cookieDuration
                        );
                        preferencesFound = true;
                    }
                }
            } catch (e) {
                console.error('Errore nel recupero delle preferenze dal server:', e);
            }
        }
        
        // Se non sono state trovate preferenze da nessuna parte,
        // utilizza i valori predefiniti già impostati in this.consent
        if (!preferencesFound) {
            console.log('Nessuna preferenza trovata, utilizzo i valori predefiniti:', this.consent);
        }
    }

    async savePreferences() {
        // Imposta il flag configured su true
        this.consent.configured = true;
        
        // PASSO 1: Salva nei cookie locali
        this.setCookie(
            this.config.cookieName,
            JSON.stringify(this.consent),
            this.config.cookieDuration
        );
        console.log('Preferenze salvate nei cookie locali:', this.consent);
        
        // PASSO 2: Salva le preferenze sul server
        try {
            const response = await fetch('/api/cookie-consent', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(this.consent),
                credentials: 'include'
            });
            
            if (response.ok) {
                console.log('Preferenze cookie salvate anche sul server');
            } else {
                console.error('Errore nella risposta del server:', await response.text());
            }
        } catch (error) {
            console.error('Errore nel salvataggio delle preferenze sul server:', error);
        }
        
        // PASSO 3: Ricarica lo script di tracciamento per applicare le nuove preferenze
        this.loadTrackingScript(true);
        
        // Nascondi il banner
        this.hideBanner();
    }
    
    loadTrackingScript(reload = false) {
        // Rimuovi script precedente se necessario
        if (reload) {
            const existingScript = document.getElementById('tracking-script');
            if (existingScript) {
                existingScript.remove();
            }
        }
        
        // Carica lo script di tracciamento dal server
        const script = document.createElement('script');
        script.id = 'tracking-script';
        script.src = '/js/tracking.js?t=' + Date.now(); // Versione per evitare cache
        document.head.appendChild(script);
    }
    
    bindExistingBanner() {
        // Verifica se il banner esiste già
        const banner = document.getElementById('cookie-banner');
        
        if (banner) {
            // Se l'utente ha già configurato le preferenze, nascondi il banner
            if (this.consent.configured) {
                banner.classList.remove('show');
                return;
            }
            
            // Altrimenti, mostra il banner
            setTimeout(() => {
                banner.classList.add('show');
            }, 1000);
            
            // Collega gli eventi ai pulsanti
            const closeBtn = document.getElementById('cookie-close');
            const acceptBtn = document.getElementById('cookie-accept-all');
            const rejectBtn = document.getElementById('cookie-reject-all');
            
            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.hideBanner());
            }
            
            if (acceptBtn) {
                acceptBtn.addEventListener('click', () => this.acceptAllCookies());
            }
            
            if (rejectBtn) {
                rejectBtn.addEventListener('click', () => this.rejectAllCookies());
            }
        } else {
            console.warn('Banner dei cookie non trovato nel DOM');
        }
    }

    /**
     * Accetta tutti i cookie
     */
    acceptAllCookies() {
        this.consent.essential = true;
        this.consent.analytics = true;
        this.consent.marketing = true;
        
        this.savePreferences();
    }

    /**
     * Rifiuta tutti i cookie eccetto quelli essenziali
     */
    rejectAllCookies() {
        this.consent.essential = true; // Sempre necessari
        this.consent.analytics = false;
        this.consent.marketing = false;
        
        this.savePreferences();
    }

    /**
     * Nasconde il banner dei cookie
     */
    hideBanner() {
        const banner = document.getElementById('cookie-banner');
        if (banner) {
            banner.classList.remove('show');
        }
    }

    /**
     * Ottiene il valore di un cookie
     */
    getCookie(name) {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.startsWith(name + '=')) {
                return cookie.substring(name.length + 1);
            }
        }
        return null;
    }

    /**
     * Imposta un cookie
     */
    setCookie(name, value, days) {
        let expires = '';
        if (days) {
            const date = new Date();
            date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
            expires = '; expires=' + date.toUTCString();
        }
        document.cookie = name + '=' + value + expires + '; path=/; SameSite=Lax';
    }

    /**
     * Cancella un cookie
     */
    deleteCookie(name) {
        this.setCookie(name, '', -1);
    }

    /**
     * Reset completo delle preferenze
     */
    resetPreferences() {
        this.deleteCookie(this.config.cookieName);
        this.consent = {
            essential: true,
            analytics: false,
            marketing: false,
            configured: false
        };
        console.log('Preferenze cookie resettate');
        
        // Ricarica la pagina per mostrare il banner
        window.location.reload();
    }
}

// Handler per link di reset delle preferenze
function initCookieSettingsLinks() {
    document.querySelectorAll('.cookie-settings-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            if (window.cookieManager) {
                window.cookieManager.resetPreferences();
            } else {
                // Se il cookieManager non è inizializzato, elimina manualmente il cookie
                document.cookie = "user_cookie_consent=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
                window.location.reload();
            }
        });
    });
}

// Inizializza il gestore dei cookie
function initCookieManager() {
    console.log('Inizializzazione Cookie Manager...');
    
    // Crea l'istanza del gestore
    window.cookieManager = new CookieConsentManager();
    
    // Inizializza i link per reimpostare le preferenze
    initCookieSettingsLinks();
}

// Inizializza quando il DOM è caricato
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCookieManager);
} else {
    initCookieManager();
}
`);
});

// ----- MIDDLEWARE DI AUTENTICAZIONE -----

// Middleware per verificare l'autenticazione
const isAuthenticated = (req, res, next) => {
  if (req.session && req.session.isAuthenticated) {
    return next();
  }
  // Salva l'URL originale per reindirizzare dopo il login
  req.session.returnTo = req.originalUrl;
  res.redirect('/login');
};

// ----- ROUTE PER L'AUTENTICAZIONE -----

// Pagina di login
app.get('/login', (req, res) => {
  // Se già autenticato, reindirizza al CRM
  if (req.session && req.session.isAuthenticated) {
    return res.redirect('/crm');
  }
  res.sendFile(path.join(__dirname, 'www', 'login.html'));
});

// API per il login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Cerca l'utente nel database
    const user = await Admin.findOne({ username });
    
    if (!user) {
      return res.status(401).json({ success: false, message: 'Credenziali non valide' });
    }
    
    // Verifica la password
    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      return res.status(401).json({ success: false, message: 'Credenziali non valide' });
    }
    
    // Imposta la sessione come autenticata
    req.session.isAuthenticated = true;
    req.session.user = {
      id: user._id,
      username: user.username
    };
    
    // Salva la sessione e rispondi
    req.session.save(() => {
      // Registra l'accesso
      console.log(`Utente ${username} ha effettuato l'accesso con successo`);
      res.status(200).json({ success: true, message: 'Login effettuato con successo' });
    });
  } catch (error) {
    console.error('Errore durante il login:', error);
    res.status(500).json({ success: false, message: 'Errore durante il login' });
  }
});

// Logout
app.get('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Errore durante il logout:', err);
    }
    res.redirect('/'); // Reindirizza alla homepage
  });
});

// ----- PROTEZIONE DEL CRM -----

// Protezione delle pagine del CRM (IMPORTANTE: aggiungi questa route PRIMA della route di fallback)
app.get('/crm', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'vip', 'crm.html'));
});

app.use(express.static(path.join(__dirname, 'www'), {
  extensions: ['html'],
  index: false  // Disabilita il comportamento predefinito di servire index.html nelle directory
}));

// Route di fallback per SPA
app.get('*', (req, res) => {
  // Ottieni il percorso richiesto
  let filePath = req.path;
  
  // Rimuovi la / iniziale e finale se presenti
  if (filePath.startsWith('/')) {
    filePath = filePath.substring(1);
  }
  if (filePath.endsWith('/')) {
    filePath = filePath.slice(0, -1);
  }
  
  // Se il percorso è vuoto, servi index.html
  if (filePath === '') {
    filePath = 'index.html';
  }
  
  // Percorso completo al file HTML (dando priorità)
  const htmlPath = path.join(__dirname, 'www', filePath + '.html');
  
  // Percorso completo al file senza estensione
  const fullPath = path.join(__dirname, 'www', filePath);
  
  // IMPORTANTE: Prima controlla se esiste la versione .html
  if (fs.existsSync(htmlPath)) {
    return res.sendFile(htmlPath);
  }
  
  // Poi controlla se esiste il file richiesto
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    return res.sendFile(fullPath);
  }
  
  // Se è una directory, cerca index.html al suo interno
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
    const indexPath = path.join(fullPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
  }
  
  // Altrimenti serve la homepage come fallback
  return res.sendFile(path.join(__dirname, 'www', 'index.html'));
});

// Crea utente admin iniziale (solo al primo avvio)
const createInitialAdmin = async () => {
  try {
    const adminExists = await Admin.findOne({ username: 'admin' });
    
    if (!adminExists) {
      const password = process.env.ADMIN_PASSWORD || 'CostruzioneDig2025';
      const hashedPassword = await bcrypt.hash(password, 10);
      
      await Admin.create({
        username: 'admin',
        password: hashedPassword
      });
      
      console.log('Utente admin creato con successo. Username: admin, Password:', password);
    }
  } catch (error) {
    console.error('Errore nella creazione dell\'admin:', error);
  }
};

// Avvia il server
app.listen(PORT, () => {
  console.log(`Server in esecuzione sulla porta ${PORT}`);
  
  // Crea l'admin all'avvio
  mongoose.connection.once('connected', createInitialAdmin);
});