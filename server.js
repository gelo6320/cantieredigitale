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
const nodemailer = require('nodemailer'); // Nuovo modulo per invio email

// Carica variabili d'ambiente
dotenv.config();

// Inizializza Express
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'www')));

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
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000
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

// Middleware per proteggere le rotte admin
const requireAuth = (req, res, next) => {
  if (req.session.isAuthenticated) {
    return next();
  }
  res.redirect('/admin/login');
};

// Middleware per verificare il consenso ai cookie
const checkCookieConsent = async (req, res, next) => {
  // I cookie essenziali sono sempre consentiti
  if (req.path === '/api/cookie-consent' || req.path.startsWith('/admin')) {
    return next();
  }
  
  const userId = req.cookies.userId || generateUserId();
  
  // Se l'utente non ha un ID cookie, impostalo
  if (!req.cookies.userId) {
    res.cookie('userId', userId, { 
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 anno
      httpOnly: true,
      sameSite: 'strict'
    });
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
        marketing: false
      });
    }
    
    // Aggiungi le preferenze cookie all'oggetto req per l'uso nei controller
    req.cookieConsent = {
      essential: consent.essential,
      analytics: consent.analytics,
      marketing: consent.marketing
    };
    
    next();
  } catch (error) {
    console.error('Errore durante la verifica del consenso cookie:', error);
    // In caso di errore, procedi comunque ma senza cookie non essenziali
    req.cookieConsent = {
      essential: true,
      analytics: false,
      marketing: false
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
    const formData = new FormData(req.body);
    await formData.save();
    
    console.log('Dati salvati in MongoDB:', req.body);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Errore nel salvataggio dei dati:', error);
    res.status(500).json({ success: false, error: 'Errore nel salvataggio dei dati' });
  }
});

// NUOVO: Route per inviare una prenotazione
app.post('/api/submit-booking', async (req, res) => {
  try {
    // Crea un nuovo documento di prenotazione
    const booking = new Booking(req.body);
    
    // Salva la prenotazione
    await booking.save();
    
    // Invia email di conferma all'utente
    await sendBookingConfirmationEmail(booking);
    
    // Invia notifica all'admin
    await sendAdminNotificationEmail(booking);
    
    console.log('Prenotazione salvata:', req.body);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Errore nella prenotazione:', error);
    res.status(500).json({ success: false, error: 'Errore durante la prenotazione' });
  }
});

// NUOVO: Route per verificare disponibilità delle date
app.get('/api/booking/availability', async (req, res) => {
  try {
    const { date } = req.query;
    
    if (!date) {
      return res.status(400).json({ success: false, error: 'Data non specificata' });
    }
    
    // Converte la data in formato ISO
    const selectedDate = new Date(date);
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
      const hours = new Date(booking.bookingTimestamp).getHours();
      return hours;
    });
    
    // Genera l'array di disponibilità
    const availability = workHours.map(hour => ({
      hour,
      formatted: `${hour}:00`,
      available: !bookedSlots.includes(hour)
    }));
    
    res.status(200).json({ 
      success: true, 
      date: selectedDate.toISOString().split('T')[0],
      availability 
    });
  } catch (error) {
    console.error('Errore nel recupero disponibilità:', error);
    res.status(500).json({ success: false, error: 'Errore nel recupero disponibilità' });
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
      configured: true
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
    
    // Se l'utente non ha ancora un ID, imposta il cookie
    if (!req.cookies.userId) {
      res.cookie('userId', userId, { 
        maxAge: 365 * 24 * 60 * 60 * 1000, // 1 anno
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
      consent.updatedAt = new Date();
      await consent.save();
    } else {
      // Crea un nuovo record di consenso
      consent = await CookieConsent.create({
        userId,
        essential: essential !== undefined ? essential : true,
        analytics: analytics !== undefined ? analytics : false,
        marketing: marketing !== undefined ? marketing : false
      });
    }
    
    res.status(200).json({ 
      success: true, 
      message: 'Preferenze cookie salvate con successo',
      consent: {
        essential: consent.essential,
        analytics: consent.analytics,
        marketing: consent.marketing
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

// ----- ROUTES PER L'ADMIN -----

// Rotta login admin
app.get('/admin', (req, res, next) => {
  console.log('Richiesta /admin ricevuta');
  console.log('Sessione:', req.session);
  console.log('isAuthenticated:', req.session.isAuthenticated);
  if (req.session.isAuthenticated) {
    return next();
  }
  console.log('Utente non autenticato, reindirizzamento a login');
  res.redirect('/admin/login');
}, (req, res) => {
  res.sendFile(path.join(__dirname, 'www', 'admin-dashboard.html'));
});

// Gestione login
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Trova l'admin
    const admin = await Admin.findOne({ username });
    
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Credenziali non valide' });
    }
    
    // Verifica password
    const passwordMatch = await bcrypt.compare(password, admin.password);
    
    if (!passwordMatch) {
      return res.status(401).json({ success: false, message: 'Credenziali non valide' });
    }
    
    // Imposta la sessione
    req.session.isAuthenticated = true;
    req.session.user = { username: admin.username };
    
    // Salva manualmente la sessione
    req.session.save((err) => {
      if (err) {
        console.error('Errore salvataggio sessione:', err);
        return res.status(500).json({ success: false, message: 'Errore durante il login' });
      }
      
      console.log('Sessione salvata, login effettuato per:', username);
      console.log('ID Sessione:', req.session.id);
      return res.status(200).json({ success: true, redirect: '/admin' });
    });
  } catch (error) {
    console.error('Errore login:', error);
    res.status(500).json({ success: false, message: 'Errore durante il login' });
  }
});

// Logout
app.get('/api/admin/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

// API per ottenere i dati dei form (protetta)
app.get('/api/admin/form-data', requireAuth, async (req, res) => {
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
          { phone: searchRegex },
          { message: searchRegex }
        ]
      };
    }
    
    // Filtro per fonte
    if (req.query.source) {
      query.source = req.query.source;
    }
    
    // Filtro per data
    if (req.query.after) {
      query.timestamp = { $gte: new Date(req.query.after) };
    }
    
    // Conta totale documenti per paginazione
    const total = await FormData.countDocuments(query);
    
    // Ottieni i dati con ordinamento, paginazione e filtri
    const formData = await FormData.find(query)
      .sort({ timestamp: -1 }) // Più recenti prima
      .skip(skip)
      .limit(limit);
    
    res.status(200).json({
      success: true,
      data: formData,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Errore recupero dati:', error);
    res.status(500).json({ success: false, message: 'Errore nel recupero dei dati' });
  }
});

// NUOVO: API per ottenere le prenotazioni (protetta)
app.get('/api/admin/bookings', requireAuth, async (req, res) => {
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

// NUOVO: API per aggiornare lo stato di una prenotazione (protetta)
app.put('/api/admin/bookings/:id', requireAuth, async (req, res) => {
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

// API per visualizzare i consensi ai cookie (protetta)
app.get('/api/admin/cookie-consents', requireAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const total = await CookieConsent.countDocuments();
    
    const consents = await CookieConsent.find()
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit);
    
    res.status(200).json({
      success: true,
      data: consents,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Errore recupero consensi cookie:', error);
    res.status(500).json({ success: false, message: 'Errore nel recupero dei consensi cookie' });
  }
});

// NUOVO: API per esportare prenotazioni (protetta)
app.get('/api/admin/export-bookings', requireAuth, async (req, res) => {
  try {
    // Parametri di filtro
    let query = {};
    
    if (req.query.status) {
      query.status = req.query.status;
    }
    
    if (req.query.after) {
      query.bookingTimestamp = { $gte: new Date(req.query.after) };
    }
    
    if (req.query.before) {
      if (!query.bookingTimestamp) query.bookingTimestamp = {};
      query.bookingTimestamp.$lte = new Date(req.query.before);
    }
    
    const bookings = await Booking.find(query).sort({ bookingTimestamp: 1 });
    
    // Crea l'intestazione CSV
    let csv = 'Nome,Email,Telefono,Data,Orario,Stato,Messaggio,Data Creazione\r\n';
    
    // Aggiungi ogni riga di dati
    bookings.forEach(booking => {
      const bookingDate = new Date(booking.bookingTimestamp);
      const formattedDate = bookingDate.toLocaleDateString('it-IT');
      const formattedTime = booking.bookingTime;
      
      const row = [
        csvEscape(booking.name || ''),
        csvEscape(booking.email || ''),
        csvEscape(booking.phone || ''),
        csvEscape(formattedDate),
        csvEscape(formattedTime),
        csvEscape(formatStatus(booking.status)),
        csvEscape(booking.message || ''),
        csvEscape(new Date(booking.createdAt).toLocaleString('it-IT'))
      ];
      
      csv += row.join(',') + '\r\n';
    });
    
    // Imposta gli header della risposta
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=prenotazioni-${Date.now()}.csv`);
    
    // Invia il file
    res.send(csv);
  } catch (error) {
    console.error('Errore esportazione prenotazioni:', error);
    res.status(500).json({ success: false, message: 'Errore nell\'esportazione delle prenotazioni' });
  }
});

// API per esportare dati (protetta)
app.get('/api/admin/export', requireAuth, async (req, res) => {
  try {
    const data = await FormData.find().sort({ timestamp: -1 });
    
    // Crea l'intestazione CSV
    let csv = 'Nome,Email,Telefono,Messaggio,Fonte,Data\r\n';
    
    // Aggiungi ogni riga di dati
    data.forEach(item => {
      const row = [
        csvEscape(item.name || ''),
        csvEscape(item.email || ''),
        csvEscape(item.phone || ''),
        csvEscape(item.message || ''),
        csvEscape(formatSource(item.source)),
        csvEscape(new Date(item.timestamp).toLocaleString('it-IT'))
      ];
      
      csv += row.join(',') + '\r\n';
    });
    
    // Imposta gli header della risposta
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=costruzione-digitale-leads-${Date.now()}.csv`);
    
    // Invia il file
    res.send(csv);
  } catch (error) {
    console.error('Errore esportazione:', error);
    res.status(500).json({ success: false, message: 'Errore nell\'esportazione dei dati' });
  }
});

// Funzione per l'escape dei valori CSV
function csvEscape(value) {
  if (value === null || value === undefined) return '';
  
  value = String(value).replace(/\n/g, ' ');  // Sostituisci newline con spazi
  
  // Se contiene virgole, virgolette o caratteri speciali, racchiudi in virgolette
  if (value.includes(',') || value.includes('"') || value.includes(';')) {
    return '"' + value.replace(/"/g, '""') + '"';  // Escape delle virgolette raddoppiandole
  }
  
  return value;
}

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
    
    // Opzioni per l'email
    const mailOptions = {
      from: `"Costruzione Digitale" <${process.env.EMAIL_FROM || 'noreply@CostruzioneDigitale.it'}>`,
      to: booking.email,
      subject: 'Conferma prenotazione chiamata conoscitiva',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
          <div style="text-align: center; margin-bottom: 30px;">
            <img src="https://CostruzioneDigitale.it/logo.png" alt="Costruzione Digitale" style="height: 60px;">
          </div>
          
          <h2 style="color: #FF6B00; margin-bottom: 20px;">Prenotazione Confermata!</h2>
          
          <p>Gentile ${booking.name},</p>
          
          <p>Grazie per aver prenotato una chiamata conoscitiva con Costruzione Digitale. Di seguito i dettagli della tua prenotazione:</p>
          
          <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Data:</strong> ${formattedDate}</p>
            <p><strong>Orario:</strong> ${booking.bookingTime}</p>
            <p><strong>Durata:</strong> 30 minuti</p>
          </div>
          
          <p>Uno dei nostri esperti ti contatterà al numero ${booking.phone} all'orario stabilito.</p>
          
          <p>Se desideri modificare o cancellare la prenotazione, ti preghiamo di contattarci rispondendo a questa email o chiamando il nostro numero +39 0123 456789.</p>
          
          <p>Per prepararti al meglio alla chiamata, potresti pensare a:</p>
          <ul>
            <li>Obiettivi del tuo progetto digitale</li>
            <li>Eventuali sfide o problemi che stai affrontando</li>
            <li>Domande specifiche che vorresti porci</li>
          </ul>
          
          <p>A presto!</p>
          
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
    console.log('Email di conferma inviata:', info.messageId);
    return true;
  } catch (error) {
    console.error('Errore invio email di conferma:', error);
    // Non bloccheremo il flusso se l'email fallisce
    return false;
  }
}

// Funzione per inviare email di notifica all'admin
async function sendAdminNotificationEmail(booking) {
  try {
    const bookingDate = new Date(booking.bookingTimestamp);
    const formattedDate = bookingDate.toLocaleDateString('it-IT', {
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric'
    });
    
    // Opzioni per l'email
    const mailOptions = {
      from: `"Sistema Prenotazioni" <${process.env.EMAIL_FROM || 'noreply@CostruzioneDigitale.it'}>`,
      to: process.env.ADMIN_EMAIL || 'admin@CostruzioneDigitale.it',
      subject: 'Nuova prenotazione chiamata conoscitiva',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
          <h2 style="color: #FF6B00; margin-bottom: 20px;">Nuova Prenotazione Ricevuta</h2>
          
          <p>È stata ricevuta una nuova prenotazione per una chiamata conoscitiva.</p>
          
          <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Nome:</strong> ${booking.name}</p>
            <p><strong>Email:</strong> ${booking.email}</p>
            <p><strong>Telefono:</strong> ${booking.phone}</p>
            <p><strong>Data:</strong> ${formattedDate}</p>
            <p><strong>Orario:</strong> ${booking.bookingTime}</p>
            <p><strong>Messaggio:</strong> ${booking.message || 'Nessun messaggio'}</p>
          </div>
          
          <p>Accedi al pannello di amministrazione per gestire questa prenotazione.</p>
          
          <p><a href="${process.env.SITE_URL || 'https://CostruzioneDigitale.it'}/admin" style="background-color: #FF6B00; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">Vai al pannello admin</a></p>
        </div>
      `
    };
    
    // Invia l'email
    const info = await transporter.sendMail(mailOptions);
    console.log('Email di notifica admin inviata:', info.messageId);
    return true;
  } catch (error) {
    console.error('Errore invio email notifica admin:', error);
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
      from: `"Costruzione Digitale" <${process.env.EMAIL_FROM || 'noreply@CostruzioneDigitale.it'}>`,
      to: booking.email,
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
          <div style="text-align: center; margin-bottom: 30px;">
            <img src="https://CostruzioneDigitale.it/logo.png" alt="Costruzione Digitale" style="height: 60px;">
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

app.get('/reset-admin-password', async (req, res) => {
  try {
    // Trova l'admin esistente
    const admin = await Admin.findOne({ username: 'admin' });
    
    if (!admin) {
      // Se non esiste, crealo
      const password = 'gelo';
      const hashedPassword = await bcrypt.hash(password, 10);
      
      const newAdmin = await Admin.create({
        username: 'admin',
        password: hashedPassword
      });
      
      return res.send('Admin creato con successo');
    }
    
    // Se esiste, aggiorna solo la password
    const password = 'gelo';
    const hashedPassword = await bcrypt.hash(password, 10);
    
    admin.password = hashedPassword;
    await admin.save();
    
    res.send('Password admin reimpostata con successo');
  } catch (error) {
    console.error('Errore reset admin:', error);
    res.status(500).send('Errore: ' + error.message);
  }
});

// API per aggiungere un nuovo admin (protetta)
app.get('/api/admin/create-user', requireAuth, async (req, res) => {
  try {
    const { username, password } = req.query;
    
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username e password richiesti' });
    }
    
    const existingUser = await Admin.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Username già in uso' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    await Admin.create({ username, password: hashedPassword });
    
    res.status(200).json({ success: true, message: 'Utente creato con successo' });
  } catch (error) {
    console.error('Errore nella creazione dell\'utente:', error);
    res.status(500).json({ success: false, message: 'Errore interno del server' });
  }
});

app.get('/admin/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'www', 'admin-login.html'));
});

// Route di fallback per SPA
app.get('*', (req, res) => {
  // Qui è dove avviene il ciclo - modifichiamo questo blocco
  if (req.path.startsWith('/admin') && req.path !== '/admin' && req.path !== '/admin/login') {
    return res.redirect('/admin/login');
  }
  
  // Altrimenti serve la homepage
  res.sendFile(path.join(__dirname, 'www', 'index.html'));
});

// Crea utente admin iniziale (solo al primo avvio)
const createInitialAdmin = async () => {
  try {
    const adminExists = await Admin.findOne({ username: 'admin' });
    
    if (!adminExists) {
      const password = process.env.ADMIN_PASSWORD || 'costruzioneDig2025';
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