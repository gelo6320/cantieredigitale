const mongoose = require('mongoose');

// Configurazione MongoDB principale
const connectDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB connesso con successo');
  } catch (err) {
    console.error('Errore connessione MongoDB:', err);
    process.exit(1);
  }
};

module.exports = {
  connectDatabase,
  mongoose
};