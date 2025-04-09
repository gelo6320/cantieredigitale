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
const hubspot = require('@hubspot/api-client');
const axios = require('axios');
const crypto = require('crypto');

// Carica variabili d'ambiente
dotenv.config();

// Inizializza Express
const app = express();
const PORT = process.env.PORT || 3000;

const hubspotClient = new hubspot.Client({ accessToken: process.env.HUBSPOT_API_KEY });

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
app.use(express.static(path.join(__dirname, 'www'), {
  extensions: ['html'],
  index: false  // Disabilita il comportamento predefinito di servire index.html nelle directory
}));

// Configurazione CORS
app.use(cors({
  origin: '*', // Permettere richieste da qualsiasi origine
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
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
  createdAt: { type: Date, default: Date.now }
});

// Modelli
const FormData = mongoose.model('FormData', FormDataSchema);
const Admin = mongoose.model('Admin', AdminSchema);
const CookieConsent = mongoose.model('CookieConsent', CookieConsentSchema);
const Booking = mongoose.model('Booking', BookingSchema); // Nuovo modello

// Middleware per verificare il consenso ai cookie
const checkCookieConsent = async (req, res, next) => {
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
  }
});

// ----- ROUTES PER IL FRONTEND -----

// Route per la gestione dell'invio del form
app.post('/api/submit-form', async (req, res) => {
  try {
    // Genera un ID evento univoco per la deduplicazione
    const eventId = 'event_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
    
    // Salva i dati nel database
    const formData = new FormData(req.body);
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
      
      // Invia l'evento come Lead
      await sendFacebookConversionEvent('Lead', userData, eventData, eventId);
    } catch (conversionError) {
      console.error('Errore nell\'invio dell\'evento alla CAPI:', conversionError);
      // Non blocchiamo il flusso se l'invio fallisce
    }
    
    console.log('Dati salvati in MongoDB:', req.body);
    
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
      timestamp: booking.bookingTimestamp
    });
    
    // Invia email di conferma all'utente
    try {
      await sendBookingConfirmationEmail(booking);
    } catch (emailError) {
      console.error('Errore invio email:', emailError);
      // Continuiamo comunque perché la prenotazione è stata salvata
    }
    
    // Integra con HubSpot
    try {
      await createHubspotContact(booking);
    } catch (hubspotError) {
      console.error('Errore nell\'integrazione con HubSpot:', hubspotError);
      // Non blocchiamo il flusso se l'integrazione HubSpot fallisce
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
      
      // Invia l'evento come Lead e Schedule
      await sendFacebookConversionEvent('Lead', userData, eventData, eventId + '_lead');
      await sendFacebookConversionEvent('Schedule', userData, eventData, eventId + '_schedule');
    } catch (conversionError) {
      console.error('Errore nell\'invio dell\'evento alla CAPI:', conversionError);
      // Non blocchiamo il flusso se l'invio fallisce
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

// Aggiungi questa nuova funzione per gestire l'integrazione con HubSpot
async function createHubspotContact(booking) {
  try {
    // 1. Prima verifica se il contatto esiste già usando l'email
    let contactId;
    try {
      const searchResponse = await hubspotClient.crm.contacts.searchApi.doSearch({
        filterGroups: [{
          filters: [{
            propertyName: 'email',
            operator: 'EQ',
            value: booking.email
          }]
        }]
      });
      
      if (searchResponse.results && searchResponse.results.length > 0) {
        // Contatto esistente
        contactId = searchResponse.results[0].id;
        console.log(`Contatto esistente trovato in HubSpot con ID: ${contactId}`);
        
        // Aggiorna il contatto esistente con eventuali nuove informazioni
        try {
          await hubspotClient.crm.contacts.basicApi.update(contactId, {
            properties: {
              firstname: booking.name.split(' ')[0],
              lastname: booking.name.split(' ').slice(1).join(' ') || booking.name,
              phone: booking.phone,
              lifecyclestage: 'lead', // Imposta il ciclo di vita a "lead"
              hs_lead_status: 'NEW' // Imposta lo stato del lead a "NUOVO"
            }
          });
          console.log(`Contatto esistente aggiornato con successo in HubSpot come lead nuovo.`);
        } catch (updateError) {
          console.error('Errore nell\'aggiornamento del contatto esistente:', updateError.message);
          // Continua comunque, abbiamo almeno trovato il contatto
        }
      } else {
        // Crea un nuovo contatto
        try {
          const contactResponse = await hubspotClient.crm.contacts.basicApi.create({
            properties: {
              email: booking.email,
              firstname: booking.name.split(' ')[0],
              lastname: booking.name.split(' ').slice(1).join(' ') || booking.name,
              phone: booking.phone,
              lifecyclestage: 'lead', // Imposta il ciclo di vita a "lead"
              hs_lead_status: 'NEW' // Imposta lo stato del lead a "NUOVO"
            }
          });
          contactId = contactResponse.id;
          console.log(`Nuovo contatto creato in HubSpot con ID: ${contactId} e stato lead NUOVO.`);
        } catch (createError) {
          console.error('Errore nella creazione del nuovo contatto:', createError.message);
          throw createError;
        }
      }
      
      return true;
    } catch (error) {
      console.error("Errore specifico in HubSpot:", error.message);
      if (error.body) {
        console.error("Dettagli errore:", JSON.stringify(error.body, null, 2));
      }
      throw error;
    }
  } catch (error) {
    console.error('Errore durante la gestione del contatto in HubSpot:', error);
    throw error;
  }
}

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
    
    // Se l'utente non ha ancora un ID, imposta il cookie (solo per questa sessione)
    if (!req.cookies.userId) {
      res.cookie('userId', userId, { 
        // Cookie valido solo per questa sessione (nessun maxAge)
        httpOnly: true,
        sameSite: 'strict'
      });
    }
    
    // Cerca il consenso esistente o crea nuovo
    let consent = await CookieConsent.findOne({ userId });
    
    if (consent) {
      // Aggiorna il consenso esistente
      consent.essential = essential !== undefined ? essential : true; // Essential è sempre true
      consent.analytics = analytics !== undefined ? analytics : false;
      consent.marketing = marketing !== undefined ? marketing : false;
      consent.configured = true;  // Segna come configurato in questa sessione
      consent.updatedAt = new Date();
      await consent.save();
    } else {
      // Crea un nuovo record di consenso
      consent = await CookieConsent.create({
        userId,
        essential: essential !== undefined ? essential : true,
        analytics: analytics !== undefined ? analytics : false,
        marketing: marketing !== undefined ? marketing : false,
        configured: true  // Segna come configurato in questa sessione
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
async function sendFacebookConversionEvent(eventName, userData, eventData, eventId) {
  try {
    // Verifica che l'access token sia configurato
    if (!process.env.ACCESS_TOKEN) {
      console.error('Facebook Access Token non configurato');
      return false;
    }

    // Preparazione dei dati dell'utente con hashing per la privacy
    const hashedUserData = {
      em: userData.email ? crypto.createHash('sha256').update(userData.email.toLowerCase().trim()).digest('hex') : undefined,
      ph: userData.phone ? crypto.createHash('sha256').update(userData.phone.replace(/\D/g, '')).digest('hex') : undefined,
      fn: userData.name ? crypto.createHash('sha256').update(userData.name.split(' ')[0].toLowerCase().trim()).digest('hex') : undefined,
      ln: userData.name && userData.name.includes(' ') ? crypto.createHash('sha256').update(userData.name.split(' ').slice(1).join(' ').toLowerCase().trim()).digest('hex') : undefined,
    };

    // Filtro per rimuovere valori undefined
    Object.keys(hashedUserData).forEach(key => 
      hashedUserData[key] === undefined && delete hashedUserData[key]
    );

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

    // Invio dell'evento alla CAPI
    const response = await axios.post(
      `https://graph.facebook.com/v17.0/${process.env.HUBSPOT_API_KEY ? '1543790469631614' : '1543790469631614'}/events`,
      payload
    );

    console.log('Facebook Conversion API - Evento inviato con successo:', response.data);
    return true;
  } catch (error) {
    console.error('Errore nell\'invio dell\'evento alla Facebook Conversion API:', error.response?.data || error.message);
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
      to: 'info@costruzionedigitale.com',
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

app.use(express.static(path.join(__dirname, 'www'), {
  extensions: ['html'],
  index: false  // Disabilita il comportamento predefinito di servire index.html nelle directory
}));

app.get('/js/cookie-consent-manager.js', (req, res) => {
  res.type('application/javascript');
  res.send(`// CookieConsentManager.js - Generated by server
// Versione 1.0.0

/**
 * CookieConsentManager
 * Sistema unificato per la gestione del consenso ai cookie su tutte le pagine
 */
class CookieConsentManager {
    constructor(options = {}) {
        // Configurazione predefinita
        this.config = {
            cookieName: 'user_cookie_consent',
            cookieDuration: 365, // giorni
            analyticsId: 'G-MBFTYV86P7', // Default empty string instead of undefined
            metaPixelId: '1543790469631614',
            ...options
        };
        
        // Stato del consenso
        this.consent = {
            essential: true, // Sempre necessari
            analytics: false,
            marketing: false,
            configured: false
        };
    
        // Inizializza
        this.init();
    }

    /**
     * Inizializza il gestore dei cookie
     */
    init() {
        // Carica le preferenze esistenti
        this.loadPreferences();
        
        // Applica le preferenze
        this.applyPreferences();
        
        // Collega gli eventi al banner esistente nella pagina
        this.bindExistingBanner();
    }

    /**
     * Carica le preferenze dai cookie
     */
    loadPreferences() {
        const cookieValue = this.getCookie(this.config.cookieName);
        
        if (cookieValue) {
            try {
                const savedConsent = JSON.parse(cookieValue);
                this.consent = { ...this.consent, ...savedConsent };
                console.log('Preferenze cookie caricate:', this.consent);
            } catch (e) {
                console.error('Errore nel parsing delle preferenze cookie:', e);
            }
        }
    }

    /**
     * Salva le preferenze nei cookie
     */
    savePreferences() {
        // Imposta il flag configured su true
        this.consent.configured = true;
        
        // Salva il cookie
        this.setCookie(
            this.config.cookieName,
            JSON.stringify(this.consent),
            this.config.cookieDuration
        );
        
        console.log('Preferenze cookie salvate:', this.consent);
        
        // Nascondi il banner
        this.hideBanner();
        
        // Applica le preferenze con un piccolo ritardo
        // per dare tempo al browser di elaborare le altre operazioni
        setTimeout(() => {
            this.applyPreferences();
        }, 50);
    }
    
    /**
     * Collega gli eventi al banner esistente nella pagina
     */
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
     * Applica le preferenze attivando/disattivando i relativi servizi
     */
    applyPreferences() {
        console.log('Applicazione preferenze cookie...');
        
        // Prima disabilitiamo sempre tutti i servizi
        this.disableGoogleAnalytics();
        this.disableMetaPixel();
        
        // Poi attiviamo solo quelli consentiti
        if (this.consent.analytics) {
            this.enableGoogleAnalytics();
        }
        
        if (this.consent.marketing) {
            // Aggiungi un leggero ritardo prima di attivare Meta Pixel
            // per evitare conflitti con altri script
            setTimeout(() => {
                this.enableMetaPixel();
            }, 100);
        }
    }

    /**
     * Abilita Google Analytics
     */
    enableGoogleAnalytics() {
        if (!window.gtag || typeof window.gtag !== 'function' || window.gtag.toString().includes('disabilitato')) {
            console.log('Attivazione Google Analytics...');
            
            // Check if analyticsId is defined
            if (!this.config || !this.config.analyticsId) {
                console.error('Google Analytics ID non configurato');
                return;
            }
            
            // Rimuovi lo script precedente se esiste
            const existingScript = document.querySelector('script[src*="googletagmanager.com/gtag/js"]');
            if (existingScript) {
                existingScript.remove();
            }
            
            // Crea e aggiungi lo script di Google Analytics
            const gaScript = document.createElement('script');
            gaScript.src = \`https://www.googletagmanager.com/gtag/js?id=\${this.config.analyticsId}\`;
            gaScript.async = true;
            document.head.appendChild(gaScript);
            
            // Inizializza Google Analytics
            window.dataLayer = window.dataLayer || [];
            window.gtag = function() {
                window.dataLayer.push(arguments);
            };
            window.gtag('js', new Date());
            window.gtag('config', this.config.analyticsId);
        }
    }

    /**
     * Disabilita Google Analytics
     */
    disableGoogleAnalytics() {
        console.log('Disattivazione Google Analytics...');
        
        // Rimuovi lo script
        const gaScript = document.querySelector('script[src*="googletagmanager.com/gtag/js"]');
        if (gaScript) {
            gaScript.remove();
        }
        
        // Sovrascrive la funzione gtag
        window._gtag_backup = window.gtag;
        window.gtag = function() {
            console.log('Google Analytics è disabilitato per preferenze cookie: gtag disabilitato');
        };
        
        // Cancella il dataLayer
        window.dataLayer = [];
    }

    /**
     * Abilita Meta Pixel (Facebook)
     */
    // Modifica della funzione enableMetaPixel() nel CookieConsentManager
    enableMetaPixel() {
        console.log('Attivazione Meta Pixel...');
        
        // Se il Pixel è già attivo, non fare nulla
        if (window._metaPixelEnabled && window.fbq && typeof window.fbq === 'function') {
            console.log('Meta Pixel già attivo');
            return;
        }
        
        // Imposta il flag prima di inizializzare
        window._metaPixelEnabled = true;
        
        // Verifica l'ID
        if (!this.config.metaPixelId) {
            console.error('Meta Pixel ID non configurato');
            return;
        }
        
        try {
            // Rimuovi script e pixel esistenti per evitare duplicati
            document.querySelectorAll('script[src*="connect.facebook.net"]').forEach(el => el.remove());
            document.querySelectorAll('noscript img[src*="facebook.com/tr"]').forEach(el => {
                if (el.parentNode) el.parentNode.remove();
            });
            
            // Inizializza Meta Pixel
            window.fbq = window.fbq || function() {
                window.fbq.callMethod ? 
                window.fbq.callMethod.apply(window.fbq, arguments) : 
                window.fbq.queue.push(arguments);
            };
            
            if (!window._fbq) window._fbq = window.fbq;
            window.fbq.push = window.fbq;
            window.fbq.loaded = true;
            window.fbq.version = '2.0';
            window.fbq.queue = [];
            
            // Crea script per caricamento
            const script = document.createElement('script');
            script.async = true;
            script.src = 'https://connect.facebook.net/en_US/fbevents.js';
            document.head.appendChild(script);
            
            // Inizializza e traccia
            window.fbq('init', this.config.metaPixelId);
            
            // Genera un eventID univoco per la pagina
            window.fbEventId = 'event_' + new Date().getTime() + '_' + Math.random().toString(36).substring(2, 15);
            
            // Traccia la visualizzazione della pagina con eventID
            window.fbq('track', 'PageView', {}, {eventID: window.fbEventId});
            
            // Aggiungi noscript
            const noscript = document.createElement('noscript');
            const img = document.createElement('img');
            img.height = 1;
            img.width = 1;
            img.style.display = 'none';
            img.src = 'https://www.facebook.com/tr?id=' + this.config.metaPixelId + '&ev=PageView&noscript=1';
            noscript.appendChild(img);
            document.body.appendChild(noscript);
            
            console.log('Meta Pixel inizializzato con successo, eventID:', window.fbEventId);
        } catch (error) {
            console.error('Errore durante inizializzazione Meta Pixel:', error);
            window._metaPixelEnabled = false;
        }
    }

    /**
     * Disabilita Meta Pixel (Facebook)
     */
    disableMetaPixel() {
        console.log('Disattivazione Meta Pixel...');
        
        // Imposta flag globale
        window._metaPixelEnabled = false;
        
        // Evita di mostrare messaggi multipli
        let isLogEnabled = true;
        
        // Rimuovi script e pixel
        try {
            // Rimuovi script
            const fbScripts = document.querySelectorAll('script[src*="connect.facebook.net/en_US/fbevents.js"]');
            fbScripts.forEach(script => script.remove());
            
            // Rimuovi pixel
            const pixelImgs = document.querySelectorAll('img[src*="facebook.com/tr"]');
            pixelImgs.forEach(img => {
                if (img.parentNode.nodeName.toLowerCase() === 'noscript') {
                    img.parentNode.remove();
                } else {
                    img.remove();
                }
            });
            
            // Rimuovi noscript elements
            const noscriptTags = document.querySelectorAll('noscript');
            noscriptTags.forEach(tag => {
                if (tag.innerHTML.includes('facebook.com/tr')) {
                    tag.remove();
                }
            });
        } catch (e) {
            console.error('Errore durante la rimozione di Meta Pixel:', e);
        }
        
        // Sovrascrive la funzione fbq con versione disabilitata
        window.fbq = function() {
            if (isLogEnabled) {
                console.log('Meta Pixel è disabilitato per preferenze cookie');
                isLogEnabled = false; // Evita messaggi multipli
            }
        };
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
    window.cookieManager = new CookieConsentManager({
        analyticsId: 'G-MBFTYV86P7',    // ID di Google Analytics
        metaPixelId: '1543790469631614' // ID del Meta Pixel
    });
    
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

// Redirect requests with trailing slashes to non-trailing slash URLs
app.use((req, res, next) => {
  // Check if URL ends with a slash and is not the root path
  if (req.path.length > 1 && req.path.endsWith('/')) {
    // Remove the trailing slash
    const newPath = req.path.slice(0, -1);
    
    // Preserve query parameters if any
    const query = req.url.includes('?') ? req.url.slice(req.path.length) : '';
    
    // Redirect to the URL without trailing slash
    return res.redirect(301, newPath + query);
  }
  
  next();
});

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