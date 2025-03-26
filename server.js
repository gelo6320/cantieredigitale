const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const dotenv = require('dotenv');
const session = require('express-session');
const bcrypt = require('bcrypt');
const MongoStore = require('connect-mongo');
const Papa = require('papaparse');
const cookieParser = require('cookie-parser'); // Aggiungi cookie-parser

// Carica variabili d'ambiente
dotenv.config();

// Inizializza Express
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(cookieParser()); // Usa cookie-parser
app.use(express.static(path.join(__dirname, 'www')));

// Configurazione sessione
app.use(session({
  secret: process.env.SESSION_SECRET || 'neosmile-secret-key',
  resave: false,  // Cambia da false a true
  saveUninitialized: false,  // Cambia da false a true
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

// Modelli
const FormData = mongoose.model('FormData', FormDataSchema);
const Admin = mongoose.model('Admin', AdminSchema);
const CookieConsent = mongoose.model('CookieConsent', CookieConsentSchema);

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
    res.setHeader('Content-Disposition', `attachment; filename=neosmile-leads-${Date.now()}.csv`);
    
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
    default:
      return source || 'Sconosciuto';
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
      const password = process.env.ADMIN_PASSWORD || 'NeoSmile2025';
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