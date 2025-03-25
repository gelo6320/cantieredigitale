const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const dotenv = require('dotenv');
const session = require('express-session');
const bcrypt = require('bcrypt');
const MongoStore = require('connect-mongo');
const Papa = require('papaparse');

// Carica variabili d'ambiente
dotenv.config();

// Inizializza Express
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'www')));

// Configurazione sessione
app.use(session({
  secret: process.env.SESSION_SECRET || 'neosmile-secret-key',
  resave: true,  // Cambia da false a true
  saveUninitialized: true,  // Cambia da false a true
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URL || process.env.MONGODB_URI,
    collectionName: 'sessions',
    ttl: 24 * 60 * 60
  }),
  cookie: { 
    secure: false,  // Imposta a false indipendentemente dall'ambiente
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Connessione a MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
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

// Modelli
const FormData = mongoose.model('FormData', FormDataSchema);
const Admin = mongoose.model('Admin', AdminSchema);

// Middleware per proteggere le rotte admin
const requireAuth = (req, res, next) => {
  if (req.session.isAuthenticated) {
    return next();
  }
  res.redirect('/admin/login');
};

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

// Funzione per formattare la fonte (puoi aggiungerla in cima al file)
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