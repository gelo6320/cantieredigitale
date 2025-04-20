const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const dotenv = require('dotenv');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcrypt');
const MongoStore = require('connect-mongo');
const cookieParser = require('cookie-parser');
const nodemailer = require('nodemailer');
const fs = require('fs');
const compression = require('compression');

// Carica variabili d'ambiente
dotenv.config();

// Inizializza Express
const app = express();
const PORT = process.env.PORT || 3000;

// Aggiungi compressione per migliorare le prestazioni
app.use(compression({
  level: 6,
  threshold: 0,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

// Middleware base
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

// Configurazione CORS
app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'https://costruzionedigitale.com',
      'https://www.costruzionedigitale.com',
      'https://crm.costruzionedigitale.com',
      'https://api.costruzionedigitale.com',
      'http://localhost:3000',
      'http://localhost:5001'
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

// Configurazione sessione (condivisa tra tutte le parti dell'app)
app.use(session({
  secret: process.env.SESSION_SECRET || 'neosmile-secret-key',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: 'sessions',
    ttl: 24 * 60 * 60
  }),
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    domain: '.costruzionedigitale.com', // Aggiungi il punto davanti per includere tutti i sottodomini
    path: '/'
  }
}));

// Middleware per proteggere le route CRM
app.use((req, res, next) => {
  if (req.path === '/crm' || req.path.startsWith('/crm/')) {
    if (!(req.session && req.session.isAuthenticated)) {
      return res.redirect('/login');
    }
  }
  
  // Proteggi l'accesso diretto al file crm.html
  if (req.path.includes('/crm.html')) {
    return res.redirect('/login');
  }
  
  next();
});

// Connessione MongoDB principale
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('MongoDB connesso con successo');
  })
  .catch(err => console.error('Errore connessione MongoDB:', err));

// ===== DEFINIZIONE SCHEMI =====

// Schema per i dati del form
const FormDataSchema = new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
  message: String,
  source: String,
  status: {
    type: String,
    enum: ['new', 'contacted', 'qualified', 'opportunity', 'customer', 'lost'],
    default: 'new'
  },
  crmEvents: [{
    eventName: String,
    eventTime: Date,
    sentToFacebook: Boolean,
    metadata: Object
  }],
  fbclid: String,
  fbclidTimestamp: Number,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Schema per le prenotazioni
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
    enum: ['pending', 'confirmed', 'cancelled', 'completed', 'qualified', 'opportunity', 'customer', 'lost'], 
    default: 'pending' 
  },
  source: String,
  fbclid: String,
  fbclidTimestamp: Number,
  crmEvents: [{
    eventName: String,
    eventTime: Date,
    sentToFacebook: Boolean,
    metadata: Object
  }],
  createdAt: { type: Date, default: Date.now }
});

// Schema per gli amministratori
const AdminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  config: {
    mongodb_uri: String,
    access_token: String,
    meta_pixel_id: String
  },
  createdAt: { type: Date, default: Date.now }
});

// Schema per il consenso ai cookie
const CookieConsentSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  essential: { type: Boolean, default: true },
  analytics: { type: Boolean, default: false },
  marketing: { type: Boolean, default: false },
  configured: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Schema per gli eventi Facebook
const FacebookEventSchema = new mongoose.Schema({
  leadId: { type: mongoose.Schema.Types.ObjectId, required: true },
  leadType: { type: String, enum: ['form', 'booking', 'facebook'], required: true },
  eventName: { type: String, required: true },
  eventTime: { type: Date, default: Date.now },
  userData: Object,
  customData: Object,
  eventId: String,
  success: { type: Boolean, default: false },
  error: String,
  createdAt: { type: Date, default: Date.now }
});

// Schema per i lead Facebook
const FacebookLeadSchema = new mongoose.Schema({
  leadId: String,
  formId: String,
  adId: String,
  pageId: String,
  adgroupId: String,
  name: String,
  email: String,
  phone: String,
  customFields: Object,
  rawData: Object,
  status: {
    type: String,
    enum: ['new', 'contacted', 'qualified', 'opportunity', 'customer', 'lost'],
    default: 'new'
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Modelli principali
const FormData = mongoose.model('FormData', FormDataSchema);
const Admin = mongoose.model('Admin', AdminSchema);
const CookieConsent = mongoose.model('CookieConsent', CookieConsentSchema);
const Booking = mongoose.model('Booking', BookingSchema);
const FacebookLead = mongoose.model('FacebookLead', FacebookLeadSchema);
const FacebookEvent = mongoose.model('FacebookEvent', FacebookEventSchema);

// ===== FUNZIONI UTILITY =====

// Funzione per ottenere la connessione MongoDB dell'utente
async function getUserConnection(req) {
  // Se la sessione non contiene informazioni sull'utente
  if (!req.session || !req.session.isAuthenticated || !req.session.userConfig) {
    return null;
  }
  
  // A questo punto dovremmo avere le configurazioni dell'utente
  if (!req.session.userConfig || !req.session.userConfig.mongodb_uri) {
    return null;
  }
  
  const username = req.session.user.username;
  const mongodb_uri = req.session.userConfig.mongodb_uri;
  
  // Verifica se abbiamo già una connessione per questo utente
  if (mongoose.connections.some(conn => conn.name === username)) {
    return mongoose.connections.find(conn => conn.name === username);
  }
  
  try {
    // Crea una nuova connessione per l'utente
    const connection = await mongoose.createConnection(mongodb_uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      connectTimeoutMS: 5000,
      socketTimeoutMS: 5000
    });
    
    // Assegna un nome alla connessione
    connection.name = username;
    
    // Definisci i modelli sulla connessione
    connection.model('FormData', FormDataSchema);
    connection.model('Booking', BookingSchema);
    connection.model('FacebookEvent', FacebookEventSchema);
    connection.model('FacebookLead', FacebookLeadSchema);
    
    return connection;
  } catch (error) {
    console.error('Errore nella creazione della connessione:', error);
    return null;
  }
}

// Funzione per recuperare le configurazioni dell'utente
async function getUserConfig(username) {
  try {
    if (!username) {
      return {
        mongodb_uri: process.env.MONGODB_URI,
        access_token: process.env.ACCESS_TOKEN,
        meta_pixel_id: process.env.FACEBOOK_PIXEL_ID || '1543790469631614'
      };
    }
    
    // Cerca l'utente nel database
    const user = await Admin.findOne({ username });
    
    if (!user) {
      return {
        mongodb_uri: process.env.MONGODB_URI,
        access_token: process.env.ACCESS_TOKEN,
        meta_pixel_id: process.env.FACEBOOK_PIXEL_ID || '1543790469631614'
      };
    }
    
    // Unisci le configurazioni dell'utente con i valori predefiniti
    return {
      mongodb_uri: user.config?.mongodb_uri || process.env.MONGODB_URI,
      access_token: user.config?.access_token || process.env.ACCESS_TOKEN,
      meta_pixel_id: user.config?.meta_pixel_id || process.env.FACEBOOK_PIXEL_ID || '1543790469631614'
    };
  } catch (error) {
    console.error('Errore nel recupero delle configurazioni:', error);
    // Fallback alle configurazioni predefinite
    return {
      mongodb_uri: process.env.MONGODB_URI,
      access_token: process.env.ACCESS_TOKEN,
      meta_pixel_id: process.env.FACEBOOK_PIXEL_ID || '1543790469631614'
    };
  }
}

// Funzione per inviare eventi a Facebook
async function sendFacebookConversionEvent(eventName, userData, customData = {}, req) {

  console.log('EventName:', eventName);
  console.log('CustomData ricevuto:', JSON.stringify(customData));

  try {
    // Usa direttamente le configurazioni dalla sessione
    let accessToken = process.env.FACEBOOK_ACCESS_TOKEN || process.env.ACCESS_TOKEN;
    let metaPixelId = process.env.FACEBOOK_PIXEL_ID || '1543790469631614';
    
    // Se abbiamo configurazioni nella sessione, usale
    if (req?.session?.userConfig) {
      accessToken = req.session.userConfig.access_token || accessToken;
      metaPixelId = req.session.userConfig.meta_pixel_id || metaPixelId;
    }
    
    if (!accessToken) {
      throw new Error('Facebook Access Token non configurato');
    }
    
    // Genera un ID evento univoco
    const eventId = 'crm_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
    
    // Prepara i dati dell'utente con hashing
    const hashedUserData = {};
    
    if (userData.email) {
      hashedUserData.em = crypto.createHash('sha256').update(userData.email.toLowerCase().trim()).digest('hex');
    }
    
    if (userData.phone) {
      hashedUserData.ph = crypto.createHash('sha256').update(userData.phone.replace(/\D/g, '')).digest('hex');
    }
    
    if (userData.name) {
      const nameParts = userData.name.split(' ');
      hashedUserData.fn = crypto.createHash('sha256').update(nameParts[0].toLowerCase().trim()).digest('hex');
      
      if (nameParts.length > 1) {
        hashedUserData.ln = crypto.createHash('sha256').update(nameParts.slice(1).join(' ').toLowerCase().trim()).digest('hex');
      }
    }
    
    // Aggiungi identificatori aggiuntivi
    if (userData.lead_id) {
      hashedUserData.lead_id = userData.lead_id;
    }
    
    if (userData.fbclid) {
      const timestamp = userData.fbclidTimestamp || Math.floor(Date.now() / 1000);
      hashedUserData.fbc = `fb.1.${timestamp}.${userData.fbclid}`;
    }
    
    // Crea l'oggetto customData arricchito
    const enrichedCustomData = {
      lead_event_source: "CRM Dashboard",
      event_source: "crm",
      ...customData
    };
    
    // Poi crea il payload base
    const payload = {
      data: [{
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: "system_generated",
        user_data: hashedUserData,
        custom_data: enrichedCustomData  // Usa il nuovo oggetto arricchito
      }],
      access_token: accessToken,
      partner_agent: 'costruzionedigitale-nodejs-crm'
    };
    
    if (eventName === 'Purchase') {
      // Se customData.value non è definito ma esiste eventMetadata.value, usalo 
      const purchaseValue = customData.value || (customData.eventMetadata && customData.eventMetadata.value) || 0;
      
      // Aggiorna il payload con i parametri richiesti per l'evento Purchase
      payload.data[0].custom_data = {
        ...payload.data[0].custom_data,
        value: purchaseValue,
        currency: customData.currency || 'EUR',
        content_type: customData.content_type || 'product',
        content_name: customData.content_name || 'Servizio'
      };
      
      console.log('Payload aggiornato per evento Purchase:', JSON.stringify(payload.data[0].custom_data));
    }
    
    // Invia l'evento
    const response = await axios.post(
      `https://graph.facebook.com/v22.0/1543790469631614/events?access_token=EAAd7rpHujUkBO3iESqN0hqKg15uiHeDZCIffdtbJIYuzTBVAfq0qMLM6dO70WmZCGE4XmL9kPZAX2S0VbTkIA0ORxypfSnrDK1nALetbLRu0nrEyyfOU7mkQ3Joy1YISlIlEdr9qbjc9YOR6DfS3zKkUf4Vhu9HhTKYta5ZAZCPnEZAbgF8CPvAeVHPS2nggZDZD`,
      payload
    );
    
    return {
      success: true,
      eventId,
      response: response.data
    };
  } catch (error) {
    console.error(`Errore nell'invio dell'evento ${eventName}:`, error.message);
    return {
      success: false,
      error: error.message || 'Errore sconosciuto',
      details: error.response ? error.response.data : null
    };
  }
}

// Funzione per generare un ID utente casuale per cookie
function generateUserId() {
  return 'user_' + Math.random().toString(36).substring(2, 15) + 
          Math.random().toString(36).substring(2, 15);
}

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
      to: process.env.ADMIN_EMAIL || 'olegbolonniy@gmail.com',
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
    
    // Invia le email
    await transporter.sendMail(clientMailOptions);
    await transporter.sendMail(adminMailOptions);
    
    return true;
  } catch (error) {
    console.error('Errore invio email di conferma:', error);
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
            <p>Tel: +39 0123 456789 - Email: info@costruzionedigitale.com</p>
          </div>
        </div>
      `
    };
    
    // Invia l'email
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error(`Errore invio email di ${status}:`, error);
    return false;
  }
}

// Funzione per formattare la fonte
function formatSource(source) {
  switch (source) {
    case 'hero-form': return 'Form Hero';
    case 'popup-form': return 'Form Popup';
    case 'contatti-form': return 'Form Contatti';
    case 'booking-form': return 'Prenotazione Chiamata';
    case 'facebook-ad': return 'Facebook Ads';
    case 'instagram-ad': return 'Instagram Ads';
    case 'google-ads': return 'Google Ads';
    case 'referral': return 'Passaparola';
    case 'old-client': return 'Cliente Precedente';
    default: return source || 'Sconosciuto';
  }
}

// Funzione per formattare lo stato della prenotazione
function formatStatus(status) {
  switch (status) {
    case 'pending': return 'In attesa';
    case 'confirmed': return 'Confermata';
    case 'cancelled': return 'Cancellata';
    case 'completed': return 'Completata';
    default: return status || 'Sconosciuto';
  }
}

// ===== MIDDLEWARE =====

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
        configured: false,
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

// Middleware per verificare autenticazione
const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.isAuthenticated) {
      return next();
    }
    
    if (req.session) {
      req.session.returnTo = req.originalUrl;
    }
    
    return res.redirect('/login');
  };

// Middleware per API (restituisce JSON con stato autenticazione, non reindirizza)
const checkApiAuth = async (req, res, next) => {
  // Se il percorso è un'API di autenticazione, salta
  if (req.path === '/api/login' || req.path === '/api/logout' || req.path === '/api/check-auth') {
    return next();
  }
  
  // Se autenticato, continua normalmente
  if (req.session && req.session.isAuthenticated) {
    return next();
  }
  
  // Per tutte le API, restituisci dati vuoti o stato 401 con messaggio JSON
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({
      success: false,
      authenticated: false,
      message: 'Sessione non autenticata',
      data: [],
      pagination: {
        total: 0,
        page: req.query.page || 1,
        limit: req.query.limit || 20,
        pages: 0
      }
    });
  }
  
  // Se non è un'API, passa al prossimo middleware
  next();
};

// Middleware per catturare fbclid e inviare PageView alla CAPI
app.use(async (req, res, next) => {
  // Estrai fbclid dalla query
  let fbclid = req.query.fbclid;
  
  // Se non c'è nella query diretta, controlla l'header referer
  if (!fbclid && req.headers.referer) {
    try {
      const refererUrl = new URL(req.headers.referer);
      fbclid = refererUrl.searchParams.get('fbclid');
    } catch (e) {
      // Errore parsing URL referer, ignora
    }
  }
  
  // Verifica se l'fbclid è già presente nella sessione
  const sessionFbclid = req.session && req.session.fbclid;
  if (!fbclid && sessionFbclid) {
    fbclid = sessionFbclid;
  }
  
  // Procedi solo se c'è un fbclid nella URL e non è stato già tracciato questo fbclid
  if (fbclid && (!req.session || !req.session.fbclidTracked || req.session.fbclid !== fbclid)) {
    // Salva fbclid in sessione se presente
    if (req.session) {
      req.session.fbclid = fbclid;
      req.session.fbclidTimestamp = Date.now();
      req.session.fbclidTracked = true;
    }
    
    try {
      // Genera un ID evento univoco per la deduplicazione
      const eventId = 'pageview_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
      
      // Payload per l'evento
      const payload = {
        data: [{
          event_name: 'PageView',
          event_time: Math.floor(Date.now() / 1000),
          event_id: eventId,
          event_source_url: req.headers.referer || `https://${req.get('host')}${req.originalUrl}`,
          user_data: {
            client_user_agent: req.headers['user-agent'] || '',
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
      }
      
      // Invia l'evento PageView alla CAPI
      await axios.post(
        `https://graph.facebook.com/v22.0/1543790469631614/events?access_token=EAAd7rpHujUkBO3iESqN0hqKg15uiHeDZCIffdtbJIYuzTBVAfq0qMLM6dO70WmZCGE4XmL9kPZAX2S0VbTkIA0ORxypfSnrDK1nALetbLRu0nrEyyfOU7mkQ3Joy1YISlIlEdr9qbjc9YOR6DfS3zKkUf4Vhu9HhTKYta5ZAZCPnEZAbgF8CPvAeVHPS2nggZDZD`,
        payload
      );
    } catch (error) {
      console.error('Errore invio PageView a CAPI:', error.message);
    }
  }
  
  next();
});

// Applica i middleware
app.use(checkCookieConsent);

app.use(checkApiAuth);

// Proteggi le route CRM
app.use('/crm', isAuthenticated);
app.use('/api/crm', isAuthenticated);
app.use('/api/dashboard', isAuthenticated);

// ===== ROUTE API =====

// API per il login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Verifica le credenziali
    const user = await Admin.findOne({ username });
    
    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.status(401).json({ success: false, message: 'Credenziali non valide' });
    }
    
    // Recupera le configurazioni dell'utente
    const userConfig = await getUserConfig(username);
    
    // Imposta la sessione
    req.session.isAuthenticated = true;
    req.session.user = {
      id: user._id,
      username: user.username
    };
    
    // Memorizza le configurazioni nella sessione
    req.session.userConfig = userConfig;
    
    // Salva la sessione
    req.session.save((err) => {
      if (err) {
        return res.status(500).json({ success: false, message: 'Errore durante il login' });
      }
      
      res.status(200).json({ success: true, message: 'Login effettuato con successo' });
    });
  } catch (error) {
    console.error('Errore durante il login:', error);
    res.status(500).json({ success: false, message: 'Errore durante il login' });
  }
});

// In server.js, verifica che questa route funzioni correttamente
app.post('/api/logout', (req, res) => {
  // Distrugge la sessione
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Errore durante il logout' });
    }
    
    // Pulisce il cookie di sessione
    res.clearCookie('connect.sid'); // Usa il nome del cookie di sessione corretto
    
    // Risponde con successo
    res.status(200).json({ success: true, message: 'Logout effettuato con successo' });
  });
});

// API per il logout
app.get('/api/logout', (req, res) => {
  // Distrugge la sessione
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Errore durante il logout' });
    }
    
    // Pulisce il cookie di sessione
    res.clearCookie('connect.sid'); // Usa il nome del cookie di sessione corretto
    
    // Risponde con successo
    res.status(200).json({ success: true, message: 'Logout effettuato con successo' });
  });
});

// API per verificare lo stato dell'autenticazione
app.get('/api/check-auth', (req, res) => {
  // Sempre rispondere con un JSON, mai reindirizzare
  res.json({ 
    authenticated: !!(req.session && req.session.isAuthenticated),
    user: req.session && req.session.user ? req.session.user.username : null
  });
});

// API per ottenere lo stato attuale del consenso ai cookie
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

// API per salvare il consenso ai cookie
app.post('/api/cookie-consent', async (req, res) => {
  try {
    const { essential, analytics, marketing } = req.body;
    const userId = req.cookies.userId || generateUserId();
    
    // Se l'utente non ha ancora un ID, imposta il cookie
    if (!req.cookies.userId) {
      res.cookie('userId', userId, { 
        maxAge: 365 * 24 * 60 * 60 * 1000, // 1 anno
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

// Reset Cookie Consent
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

// API per la gestione dell'invio del form
app.post('/api/submit-form', async (req, res) => {
  try {
    // Genera un ID evento univoco per la deduplicazione
    const eventId = 'event_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
    
    // Aggiungi fbclid al formData se presente nella sessione
    const formDataWithFbclid = { ...req.body };
    if (req.session && req.session.fbclid) {
      formDataWithFbclid.fbclid = req.session.fbclid;
      formDataWithFbclid.fbclidTimestamp = req.session.fbclidTimestamp || Date.now();
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
      
      // Invia l'evento come Lead
      await sendFacebookConversionEvent('Lead', userData, eventData, req);
    } catch (conversionError) {
      console.error('Errore nell\'invio dell\'evento alla CAPI:', conversionError);
    }
    
    // Restituisci l'eventId per la deduplicazione lato client
    res.status(200).json({ success: true, eventId });
  } catch (error) {
    console.error('Errore nel salvataggio dei dati:', error);
    res.status(500).json({ success: false, error: 'Errore nel salvataggio dei dati' });
  }
});

// API per la gestione dell'invio della prenotazione
app.post('/api/submit-booking', async (req, res) => {
  try {
    // Genera un ID evento univoco per la deduplicazione
    const eventId = 'event_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
    
    // Assicurati che il timestamp della prenotazione sia valido
    const bookingData = { ...req.body };
    
    // Aggiungi fbclid alla prenotazione se presente nella sessione
    if (req.session && req.session.fbclid) {
      bookingData.fbclid = req.session.fbclid;
      bookingData.fbclidTimestamp = req.session.fbclidTimestamp || Date.now();
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
        } else {
            bookingData.bookingTimestamp = bookingTimestamp;
        }
    }
    
    // Controlla se già esiste una prenotazione per lo stesso orario
    const bookingHour = new Date(bookingData.bookingTimestamp).getHours();
    const bookingDay = new Date(bookingData.bookingTimestamp).setHours(0, 0, 0, 0);
    
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
      
      // Invia gli eventi come Lead e Schedule
      await sendFacebookConversionEvent('Lead', userData, eventData, req);
      await sendFacebookConversionEvent('Schedule', userData, eventData, req);
    } catch (conversionError) {
      console.error('Errore nell\'invio degli eventi alla CAPI:', conversionError);
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

// API per verificare disponibilità delle date
app.get('/api/booking/availability', async (req, res) => {
  try {
    const { date } = req.query;
    
    if (!date) {
      return res.status(400).json({ success: false, error: 'Data non specificata' });
    }
    
    // Converte la data in formato ISO in un oggetto Date
    // Assicurandosi che la data sia interpretata come mezzanotte UTC
    const selectedDate = new Date(date + 'T00:00:00.000Z');
    
    // Imposta la data a mezzanotte locale
    selectedDate.setHours(0, 0, 0, 0);
    
    // Trova le prenotazioni per la data selezionata
    const nextDay = new Date(selectedDate);
    nextDay.setDate(nextDay.getDate() + 1);
    
    const bookings = await Booking.find({
      bookingTimestamp: {
        $gte: selectedDate,
        $lt: nextDay
      },
      status: { $ne: 'cancelled' }
    });
    
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

// ===== ROUTE WEBHOOK FACEBOOK =====

// Route form webhook per Facebook (verifica)
app.get('/webhook/facebook-leads', (req, res) => {
  try {
    // Verifica dell'autenticazione del webhook
    const VERIFY_TOKEN = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN;
    
    // Verifica del modo - per la configurazione iniziale
    if (req.query['hub.mode'] === 'subscribe' && 
        req.query['hub.verify_token'] === VERIFY_TOKEN) {
      return res.status(200).send(req.query['hub.challenge']);
    }
    
    // Se è una semplice visita all'URL senza parametri di verifica
    if (!req.query['hub.mode']) {
      return res.status(200).send('Webhook endpoint attivo. Usa questo URL nella configurazione di Facebook.');
    }
    
    // Se la verifica fallisce
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
            
            // L'ID del lead è in leadData.leadgen_id
            const leadId = leadData.leadgen_id;
            const formId = leadData.form_id;
            
            try {
              // Recupera i dettagli completi del lead tramite API Graph
              await retrieveLeadDetails(leadId, formId);
            } catch (error) {
              // Salva almeno i dati di base nel modello FacebookLead
              try {
                await FacebookLead.create({
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
      `https://graph.facebook.com/v22.0/1543790469631614/events?access_token=EAAd7rpHujUkBO3iESqN0hqKg15uiHeDZCIffdtbJIYuzTBVAfq0qMLM6dO70WmZCGE4XmL9kPZAX2S0VbTkIA0ORxypfSnrDK1nALetbLRu0nrEyyfOU7mkQ3Joy1YISlIlEdr9qbjc9YOR6DfS3zKkUf4Vhu9HhTKYta5ZAZCPnEZAbgF8CPvAeVHPS2nggZDZD`
    );
    
    const leadDetails = response.data;
    
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
    
    return newLead;
  } catch (error) {
    console.error('Errore recupero dettagli lead:', error);
    throw error;
  }
}

// ===== ROUTE API DASHBOARD =====

// API per creare un nuovo appuntamento
app.post('/api/appointments', checkApiAuth, async (req, res) => {
  try {
    const { title, date, time, duration, status, clientId, description } = req.body;
    
    if (!title || !date || !time) {
      return res.status(400).json({ success: false, message: 'Titolo, data e ora sono richiesti' });
    }
    
    // Crea oggetti Date per inizio e fine
    const start = new Date(`${date}T${time}`);
    const end = new Date(start.getTime() + parseInt(duration || 60) * 60000);
    
    // In produzione salveresti nel DB, qui simuliamo
    const newAppointment = {
      id: Date.now().toString(),
      title,
      start,
      end,
      backgroundColor: getStatusColor(status),
      borderColor: getStatusColor(status),
      status: status || 'pending',
      clientId: clientId || '',
      description: description || ''
    };
    
    res.status(201).json({
      success: true,
      data: newAppointment,
      message: 'Appuntamento creato con successo'
    });
  } catch (error) {
    console.error('Errore nella creazione appuntamento:', error);
    res.status(500).json({ success: false, message: 'Errore nella creazione appuntamento', error: error.message });
  }
});

// API per aggiornare un appuntamento
app.put('/api/appointments/:id', checkApiAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, date, time, duration, status, clientId, description, start, end } = req.body;
    
    // Simuliamo l'aggiornamento
    const updatedAppointment = {
      id,
      title: title || 'Appuntamento aggiornato',
      start: start || (date && time ? new Date(`${date}T${time}`) : new Date()),
      end: end || (date && time && duration ? new Date(new Date(`${date}T${time}`).getTime() + parseInt(duration) * 60000) : new Date()),
      backgroundColor: getStatusColor(status),
      borderColor: getStatusColor(status),
      status: status || 'pending',
      clientId: clientId || '',
      description: description || ''
    };
    
    res.json({
      success: true,
      data: updatedAppointment,
      message: 'Appuntamento aggiornato con successo'
    });
  } catch (error) {
    console.error('Errore nell\'aggiornamento appuntamento:', error);
    res.status(500).json({ success: false, message: 'Errore nell\'aggiornamento appuntamento', error: error.message });
  }
});

// API per eliminare un appuntamento
app.delete('/api/appointments/:id', checkApiAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Simuliamo l'eliminazione
    res.json({
      success: true,
      data: { id },
      message: 'Appuntamento eliminato con successo'
    });
  } catch (error) {
    console.error('Errore nell\'eliminazione appuntamento:', error);
    res.status(500).json({ success: false, message: 'Errore nell\'eliminazione appuntamento', error: error.message });
  }
});

// Funzione helper per ottenere colore in base allo stato
function getStatusColor(status) {
  switch (status) {
    case 'pending': return '#e67e22';
    case 'confirmed': return '#FF6B00';
    case 'completed': return '#27ae60';
    case 'cancelled': return '#e74c3c';
    default: return '#FF6B00';
  }
}

// Inizializza sessione dashboard
app.get('/api/dashboard/init-session', (req, res) => {
  if (!req.session || !req.session.isAuthenticated) {
    return res.json({
      success: false,
      message: 'Sessione non autenticata',
      authenticated: false
    });
  }
  
  res.json({
    success: true,
    message: 'Sessione inizializzata',
    authenticated: true,
    user: req.session.user ? req.session.user.username : null
  });
});

// API per ottenere i form
app.get('/api/leads/forms', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    // Ottieni la connessione dell'utente
    const connection = await getUserConnection(req);
    
    // Se non c'è connessione, restituisci un array vuoto
    if (connection === null) {
      return res.json({
        success: true,
        data: [],
        pagination: {
          total: 0,
          page,
          limit,
          pages: 0
        }
      });
    }
    
    // Usa il modello dalla connessione
    const UserFormData = connection.model('FormData');
    
    // Filtraggio
    let filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      filter.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
        { message: searchRegex }
      ];
    }
    
    // Conta totale documenti e ottieni i dati
    const total = await UserFormData.countDocuments(filter);
    const forms = await UserFormData.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    res.json({
      success: true,
      data: forms,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Errore nel recupero dei form:', error);
    res.status(500).json({ success: false, message: 'Errore nel recupero dei form', error: error.message });
  }
});

// API per ottenere le prenotazioni
app.get('/api/leads/bookings', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    // Ottieni la connessione dell'utente
    const connection = await getUserConnection(req);
    
    // Se non c'è connessione, restituisci un array vuoto
    if (connection === null) {
      return res.json({
        success: true,
        data: [],
        pagination: {
          total: 0,
          page,
          limit,
          pages: 0
        }
      });
    }
    
    // Usa il modello dalla connessione
    const UserBooking = connection.model('Booking');
    
    // Filtraggio
    let filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      filter.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
        { message: searchRegex }
      ];
    }
    
    // Conta totale documenti e ottieni i dati
    const total = await UserBooking.countDocuments(filter);
    const bookings = await UserBooking.find(filter)
      .sort({ bookingTimestamp: -1 })
      .skip(skip)
      .limit(limit);
    
    res.json({
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
    console.error('Errore nel recupero delle prenotazioni:', error);
    res.status(500).json({ success: false, message: 'Errore nel recupero delle prenotazioni', error: error.message });
  }
});

// API per ottenere i lead di Facebook
app.get('/api/leads/facebook', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    // Ottieni la connessione dell'utente
    const connection = await getUserConnection(req);
    
    // Se non c'è connessione, restituisci un array vuoto
    if (connection === null) {
      return res.json({
        success: true,
        data: [],
        pagination: {
          total: 0,
          page,
          limit,
          pages: 0
        }
      });
    }
    
    // Usa il modello dalla connessione
    const UserFacebookLead = connection.model('FacebookLead');
    
    // Filtraggio
    let filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      filter.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
        { leadId: searchRegex },
        { formId: searchRegex }
      ];
    }
    
    // Conta totale documenti e ottieni i dati
    const total = await UserFacebookLead.countDocuments(filter);
    const facebookLeads = await UserFacebookLead.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    res.json({
      success: true,
      data: facebookLeads,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Errore nel recupero dei lead Facebook:', error);
    res.status(500).json({ success: false, message: 'Errore nel recupero dei lead Facebook', error: error.message });
  }
});

// API per ottenere gli eventi
app.get('/api/events', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    
    // Ottieni la connessione dell'utente
    const connection = await getUserConnection(req);
    
    // Se non c'è connessione, restituisci un array vuoto
    if (connection === null) {
      return res.json({
        success: true,
        data: [],
        pagination: {
          total: 0,
          page,
          limit,
          pages: 0
        }
      });
    }
    
    // Usa il modello dalla connessione
    const UserFacebookEvent = connection.model('FacebookEvent');
    
    // Filtraggio
    let filter = {};
    if (req.query.leadId) filter.leadId = req.query.leadId;
    if (req.query.eventName) filter.eventName = req.query.eventName;
    if (req.query.success === 'true') filter.success = true;
    if (req.query.success === 'false') filter.success = false;
    
    // Conta totale documenti e ottieni i dati
    const total = await UserFacebookEvent.countDocuments(filter);
    const events = await UserFacebookEvent.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    res.json({
      success: true,
      data: events,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Errore nel recupero degli eventi:', error);
    res.status(500).json({ success: false, message: 'Errore nel recupero degli eventi', error: error.message });
  }
});

// API per aggiornare lo stato di un form
app.post('/api/leads/forms/:id/update', async (req, res) => {
  try {
    const { id } = req.params;
    const { newStatus, eventName, eventMetadata } = req.body;
    
    if (!id || !newStatus || !eventName) {
      return res.status(400).json({ 
        success: false, 
        message: 'ID, nuovo stato ed evento sono richiesti' 
      });
    }
    
    // Ottieni la connessione dell'utente
    const connection = await getUserConnection(req);
    
    // Se non c'è connessione, restituisci un errore
    if (connection === null) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Usa i modelli dalla connessione
    const UserFormData = connection.model('FormData');
    const UserFacebookEvent = connection.model('FacebookEvent');
    
    // Trova il form
    const form = await UserFormData.findById(id);
    if (!form) {
      return res.status(404).json({ success: false, message: 'Form non trovato' });
    }
    
    // Aggiorna lo stato
    form.status = newStatus;
    form.updatedAt = new Date();
    
    // Aggiungi evento CRM
    const newEvent = {
      eventName,
      eventTime: new Date(),
      sentToFacebook: false,
      metadata: eventMetadata || {}
    };
    
    form.crmEvents = form.crmEvents || [];
    form.crmEvents.push(newEvent);
    
    await form.save();
    
    // Invia evento a Facebook
    const userData = {
      email: form.email,
      phone: form.phone,
      name: form.name,
      fbclid: form.fbclid,
      fbclidTimestamp: form.fbclidTimestamp
    };
    
    const customData = {
      form_id: form._id.toString(),
      form_source: form.source,
      lead_status: newStatus,
      ...eventMetadata
    };
    
    const facebookResult = await sendFacebookConversionEvent(eventName, userData, customData, req);
    
    // Aggiorna lo stato e registra l'evento
    if (facebookResult.success) {
      form.crmEvents[form.crmEvents.length - 1].sentToFacebook = true;
      await form.save();
      
      await UserFacebookEvent.create({
        leadId: form._id,
        leadType: 'form',
        eventName,
        userData,
        customData,
        eventId: facebookResult.eventId,
        success: true
      });
    } else {
      await UserFacebookEvent.create({
        leadId: form._id,
        leadType: 'form',
        eventName,
        userData,
        customData,
        success: false,
        error: facebookResult.error
      });
    }
    
    res.json({
      success: true,
      data: form,
      facebookResult
    });
  } catch (error) {
    console.error('Errore nell\'aggiornamento del form:', error);
    res.status(500).json({ success: false, message: 'Errore nell\'aggiornamento del form', error: error.message });
  }
});

// API per aggiornare lo stato di una prenotazione
app.post('/api/leads/bookings/:id/update', async (req, res) => {
  try {
    const { id } = req.params;
    const { newStatus, eventName, eventMetadata } = req.body;
    
    if (!id || !newStatus || !eventName) {
      return res.status(400).json({ 
        success: false, 
        message: 'ID, nuovo stato ed evento sono richiesti' 
      });
    }
    
    // Ottieni la connessione dell'utente
    const connection = await getUserConnection(req);
    
    // Se non c'è connessione, restituisci un errore
    if (connection === null) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Usa i modelli dalla connessione
    const UserBooking = connection.model('Booking');
    const UserFacebookEvent = connection.model('FacebookEvent');
    
    // Trova la prenotazione
    const booking = await UserBooking.findById(id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Prenotazione non trovata' });
    }
    
    // Aggiorna lo stato
    booking.status = newStatus;
    
    // Aggiungi evento CRM
    const newEvent = {
      eventName,
      eventTime: new Date(),
      sentToFacebook: false,
      metadata: eventMetadata || {}
    };
    
    booking.crmEvents = booking.crmEvents || [];
    booking.crmEvents.push(newEvent);
    
    await booking.save();
    
    // Invia evento a Facebook
    const userData = {
      email: booking.email,
      phone: booking.phone,
      name: booking.name,
      fbclid: booking.fbclid,
      fbclidTimestamp: booking.fbclidTimestamp
    };
    
    const customData = {
      booking_id: booking._id.toString(),
      booking_source: booking.source,
      booking_date: booking.bookingDate,
      booking_time: booking.bookingTime,
      lead_status: newStatus,
      ...eventMetadata
    };
    
    const facebookResult = await sendFacebookConversionEvent(eventName, userData, customData, req);
    
    // Aggiorna lo stato e registra l'evento
    if (facebookResult.success) {
      booking.crmEvents[booking.crmEvents.length - 1].sentToFacebook = true;
      await booking.save();
      
      await UserFacebookEvent.create({
        leadId: booking._id,
        leadType: 'booking',
        eventName,
        userData,
        customData,
        eventId: facebookResult.eventId,
        success: true
      });
    } else {
      await UserFacebookEvent.create({
        leadId: booking._id,
        leadType: 'booking',
        eventName,
        userData,
        customData,
        success: false,
        error: facebookResult.error
      });
    }
    
    res.json({
      success: true,
      data: booking,
      facebookResult
    });
  } catch (error) {
    console.error('Errore nell\'aggiornamento della prenotazione:', error);
    res.status(500).json({ success: false, message: 'Errore nell\'aggiornamento della prenotazione', error: error.message });
  }
});

// API per aggiornare lo stato di un lead Facebook
app.post('/api/leads/facebook/:id/update', async (req, res) => {
  try {
    const { id } = req.params;
    const { newStatus, eventName, eventMetadata } = req.body;
    
    if (!id || !newStatus || !eventName) {
      return res.status(400).json({ 
        success: false, 
        message: 'ID, nuovo stato ed evento sono richiesti' 
      });
    }
    
    // Ottieni la connessione dell'utente
    const connection = await getUserConnection(req);
    
    // Se non c'è connessione, restituisci un errore
    if (connection === null) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Usa i modelli dalla connessione
    const UserFacebookLead = connection.model('FacebookLead');
    const UserFacebookEvent = connection.model('FacebookEvent');
    
    // Trova il lead
    const lead = await UserFacebookLead.findById(id);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead Facebook non trovato' });
    }
    
    // Aggiorna lo stato
    lead.status = newStatus;
    lead.updatedAt = new Date();
    
    await lead.save();
    
    // Invia evento a Facebook
    const userData = {
      email: lead.email,
      phone: lead.phone,
      name: lead.name,
      lead_id: lead.leadId
    };
    
    const customData = {
      form_id: lead.formId,
      ad_id: lead.adId,
      lead_status: newStatus,
      ...eventMetadata
    };
    
    const facebookResult = await sendFacebookConversionEvent(eventName, userData, customData, req);
    
    // Registra l'evento Facebook
    let eventRecord;
    if (facebookResult.success) {
      eventRecord = await UserFacebookEvent.create({
        leadId: lead._id,
        leadType: 'facebook',
        eventName,
        userData,
        customData,
        eventId: facebookResult.eventId,
        success: true
      });
    } else {
      eventRecord = await UserFacebookEvent.create({
        leadId: lead._id,
        leadType: 'facebook',
        eventName,
        userData,
        customData,
        success: false,
        error: facebookResult.error
      });
    }
    
    res.json({
      success: true,
      data: lead,
      facebookResult,
      event: eventRecord
    });
  } catch (error) {
    console.error('Errore nell\'aggiornamento del lead Facebook:', error);
    res.status(500).json({ success: false, message: 'Errore nell\'aggiornamento del lead Facebook', error: error.message });
  }
});

// Configurazione utente API
app.post('/api/user/config', isAuthenticated, async (req, res) => {
  try {
    const { mongodb_uri, access_token, meta_pixel_id } = req.body;
    const username = req.session.user.username;
    
    // Verifica che l'utente esista
    const user = await Admin.findOne({ username });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Utente non trovato' });
    }
    
    // Inizializza l'oggetto config se non esiste
    if (!user.config) {
      user.config = {};
    }
    
    // Aggiorna solo i campi forniti
    if (mongodb_uri !== undefined) user.config.mongodb_uri = mongodb_uri;
    if (access_token !== undefined) user.config.access_token = access_token;
    if (meta_pixel_id !== undefined) user.config.meta_pixel_id = meta_pixel_id;
    
    // Salva le modifiche
    await user.save();
    
    // Aggiorna le configurazioni in sessione
    req.session.userConfig = await getUserConfig(username);
    
    res.status(200).json({ 
      success: true, 
      message: 'Configurazioni aggiornate con successo',
      config: {
        mongodb_uri: user.config.mongodb_uri ? '(configurato)' : '(non configurato)',
        access_token: user.config.access_token ? '(configurato)' : '(non configurato)',
        meta_pixel_id: user.config.meta_pixel_id || '(non configurato)'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Errore nell\'aggiornamento delle configurazioni' });
  }
});

// ===== ROUTE FRONTEND =====

// Serve file statici per il frontend principale
app.use(express.static(path.join(__dirname, 'www'), {
  extensions: ['html'],
  index: false
}));

// Serve file statici per il frontend dashboard
app.use('/dashboard/assets', express.static(path.join(__dirname, 'public/assets')));
app.use('/api/dashboard', express.static(path.join(__dirname, 'public/api')));

// Route per il tracciamento personalizzato
app.get('/js/tracking.js', async (req, res) => {
  const userId = req.cookies.userId;
  
  // Valori predefiniti
  let consent = { essential: true, analytics: false, marketing: false };
  
  // Controlla i cookie del browser
  if (req.cookies.user_cookie_consent) {
    try {
      const cookieConsent = JSON.parse(req.cookies.user_cookie_consent);
      if (cookieConsent && cookieConsent.configured) {
        consent = {
          essential: cookieConsent.essential !== undefined ? cookieConsent.essential : true,
          analytics: cookieConsent.analytics !== undefined ? cookieConsent.analytics : false,
          marketing: cookieConsent.marketing !== undefined ? cookieConsent.marketing : false
        };
      }
    } catch (error) {
      console.error('Errore nel parsing del cookie di consenso:', error);
    }
  }
  
  // Se l'utente ha un ID, controlla anche il database
  if (userId && !req.cookies.user_cookie_consent) {
    try {
      const userConsent = await CookieConsent.findOne({ userId });
      if (userConsent && userConsent.configured) {
        consent = {
          essential: userConsent.essential,
          analytics: userConsent.analytics, 
          marketing: userConsent.marketing
        };
        
        // Imposta il cookie per sincronizzare
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
    } catch (error) {
      console.error('Errore nel recupero del consenso dal database:', error);
    }
  }
  
  let trackingCode = '';
  
  // Base script sempre incluso
  trackingCode += `
    console.log("Consenso utente:", ${JSON.stringify(consent)});
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

// Manager dei cookie
app.get('/js/cookie-consent-manager.js', (req, res) => {
  res.type('application/javascript');
  res.sendFile(path.join(__dirname, 'www/js/cookie-consent-manager.js'));
});

// Pagina di login
app.get('/login', (req, res) => {
  // Se già autenticato, reindirizza al CRM
  if (req.session && req.session.isAuthenticated) {
    return res.redirect('/crm');
  }
  res.sendFile(path.join(__dirname, 'www', 'login.html'));
});

// Serve la dashboard
app.get('/dashboard', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard/*', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve il CRM
app.get('/crm', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'www', 'crm.html'));
});

// Route principale
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'www', 'index.html'));
});

// Gestione delle URL con estensione .html
app.get('*.html', (req, res) => {
  const urlWithoutExt = req.path.replace('.html', '');
  res.redirect(301, urlWithoutExt);
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
  
  // Prima controlla se esiste la versione .html
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
  
  // Restituisci 404 se nessun file è stato trovato
  res.status(404).sendFile(path.join(__dirname, 'www', '404.html'));
});

// ===== INIZIALIZZAZIONE SERVER =====

// Crea utente admin iniziale (solo al primo avvio)
const createInitialAdmin = async () => {
  try {
    const adminExists = await Admin.findOne({ username: 'admin' });
    
    if (!adminExists) {
      const password = process.env.ADMIN_PASSWORD || 'CostruzioneDig2025';
      const hashedPassword = await bcrypt.hash(password, 10);
      
      await Admin.create({
        username: 'admin',
        password: hashedPassword,
        config: {
          mongodb_uri: process.env.MONGODB_URI,
          access_token: process.env.ACCESS_TOKEN,
          meta_pixel_id: process.env.FACEBOOK_PIXEL_ID || '1543790469631614'
        }
      });
      
      console.log('Utente admin creato con successo con configurazioni predefinite');
    }
  } catch (error) {
    console.error('Errore nella creazione dell\'admin:', error);
  }
};

// Avvia il server
app.listen(PORT, () => {
  console.log(`Server principale in esecuzione sulla porta ${PORT}`);
  
  // Crea l'admin all'avvio
  mongoose.connection.once('connected', createInitialAdmin);
});