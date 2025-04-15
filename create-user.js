const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const dotenv = require('dotenv');

// Carica variabili d'ambiente
dotenv.config();

// Schema utente admin (deve essere identico a quello nel server.js)
const AdminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});

// Modello
const Admin = mongoose.model('Admin', AdminSchema);

// Connessione a MongoDB
mongoose.connect(process.env.MONGODB_URI)
.then(() => {
  console.log('MongoDB connesso con successo');
  
  // Crea l'utente
  createUser(process.argv[2], process.argv[3]);
})
.catch(err => console.error('Errore connessione MongoDB:', err));

async function createUser(username, password) {
  try {
    if (!username || !password) {
      console.error('Devi fornire username e password!');
      process.exit(1);
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new Admin({
      username,
      password: hashedPassword
    });
    await user.save();
    console.log(`Utente ${username} creato con successo`);
    process.exit(0);
  } catch (error) {
    console.error('Errore nella creazione dell\'utente:', error);
    process.exit(1);
  }
}