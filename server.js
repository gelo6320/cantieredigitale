require('dotenv').config();

const app = require('./app');
const { connectionManager } = require('./utils');

const PORT = process.env.PORT || 3000;

// Avvia il server
const server = app.listen(PORT, () => {
  console.log(`Server principale in esecuzione sulla porta ${PORT}`);
  console.log(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
});

// Gestione corretta dell'arresto del server
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

function gracefulShutdown(signal) {
  console.log(`${signal} ricevuto. Chiusura del server...`);
  
  server.close(() => {
    console.log('Server Express chiuso.');
    
    // Chiudi tutte le connessioni utente
    connectionManager.closeAll();
    
    // Chiudi connessione principale MongoDB
    const mongoose = require('mongoose');
    mongoose.connection.close()
      .then(() => {
        console.log('Connessione MongoDB principale chiusa.');
        process.exit(0);
      })
      .catch(err => {
        console.error('Errore nella chiusura della connessione:', err);
        process.exit(1);
      });
  });
  
  // Forza la chiusura dopo 10 secondi
  setTimeout(() => {
    console.error('Forza chiusura dopo timeout');
    process.exit(1);
  }, 10000);
}

// Gestione errori non catturati
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

module.exports = server;