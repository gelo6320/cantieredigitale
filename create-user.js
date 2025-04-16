const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const dotenv = require('dotenv');

// Carica variabili d'ambiente
dotenv.config();

// Schema Admin
const AdminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  config: {
    mongodb_uri: String,
    access_token: String,
    meta_pixel_id: String
    // Puoi aggiungere altre configurazioni qui se necessario
  },
  createdAt: { type: Date, default: Date.now }
});

// Modello
const Admin = mongoose.model('Admin', AdminSchema);

// Connessione a MongoDB
mongoose.connect(process.env.MONGODB_URI)
.then(() => {
  console.log('MongoDB connesso con successo');
  
  // Crea l'utente
  createUser();
})
.catch(err => console.error('Errore connessione MongoDB:', err));

async function createUser() {
  try {
    // Parametri da linea di comando
    const args = process.argv.slice(2);
    
    if (args.length < 2) {
      console.error('Uso: node create-user.js <username> <password> [mongodb_uri] [access_token] [meta_pixel_id]');
      return process.exit(1);
    }
    
    const [username, password, mongodb_uri, access_token, meta_pixel_id] = args;
    
    // Verifica che username e password siano forniti
    if (!username || !password) {
      console.error('Username e password sono richiesti');
      return process.exit(1);
    }
    
    // Verifica che l'username non esista già
    const existingUser = await Admin.findOne({ username });
    if (existingUser) {
      console.error(`L'username "${username}" esiste già`);
      return process.exit(1);
    }
    
    // Crea il nuovo utente
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await Admin.create({
      username,
      password: hashedPassword,
      config: {
        mongodb_uri,
        access_token,
        meta_pixel_id
      }
    });
    
    console.log(`Utente "${username}" creato con successo`);
    console.log('Configurazioni:');
    console.log('- MongoDB URI:', newUser.config.mongodb_uri ? '(configurato)' : '(non configurato)');
    console.log('- Access Token:', newUser.config.access_token ? '(configurato)' : '(non configurato)');
    console.log('- Meta Pixel ID:', newUser.config.meta_pixel_id || '(non configurato)');
    
    process.exit(0);
  } catch (error) {
    console.error('Errore nella creazione dell\'utente:', error);
    process.exit(1);
  }
}