const mongoose = require('mongoose');

// Connection Manager
const connectionManager = {
  connections: {},
  
  // Update the getConnection method in connectionManager
  async getConnection(username, uri) {
    console.log(`[connectionManager] Request for connection: ${username}`);
    
    if (this.connections[username]) {
      console.log(`[connectionManager] Reusing existing connection for ${username}`);
      this.resetTimeout(username);
      return this.connections[username].connection;
    }
    
    console.log(`[connectionManager] Creating new connection for ${username}`);
    try {
      const connection = await mongoose.createConnection(uri, {
        connectTimeoutMS: 10000,
        socketTimeoutMS: 10000,
        maxPoolSize: 10,
        minPoolSize: 1,
        maxIdleTimeMS: 30000,
        serverSelectionTimeoutMS: 10000
      });
      
      console.log(`[connectionManager] Connection established for ${username}`);
      
      this.connections[username] = {
        connection,
        lastUsed: Date.now(),
        timeout: this.setConnectionTimeout(username)
      };
      
      return connection;
    } catch (error) {
      console.error(`[connectionManager] Connection error for ${username}:`, error);
      throw error;
    }
  },
  
  resetTimeout(username) {
    if (this.connections[username]) {
      clearTimeout(this.connections[username].timeout);
      this.connections[username].lastUsed = Date.now();
      this.connections[username].timeout = this.setConnectionTimeout(username);
    }
  },
  
  setConnectionTimeout(username) {
    // Chiudi la connessione dopo 10 minuti di inattività
    return setTimeout(() => {
      if (this.connections[username]) {
        this.connections[username].connection.close();
        delete this.connections[username];
        console.log(`Connessione per ${username} chiusa per inattività`);
      }
    }, 10 * 60 * 1000);
  },
  
  closeAll() {
    Object.keys(this.connections).forEach(username => {
      clearTimeout(this.connections[username].timeout);
      this.connections[username].connection.close();
    });
    this.connections = {};
    console.log('Tutte le connessioni utente chiuse');
  }
};

// Esegui cleanup ogni ora
setInterval(() => {
  const now = Date.now();
  const inactiveThreshold = 30 * 60 * 1000; // 30 minuti
  
  Object.keys(connectionManager.connections).forEach(username => {
    const connInfo = connectionManager.connections[username];
    if (now - connInfo.lastUsed > inactiveThreshold) {
      clearTimeout(connInfo.timeout);
      connInfo.connection.close();
      delete connectionManager.connections[username];
      console.log(`Connessione inattiva per ${username} chiusa durante cleanup`);
    }
  });
}, 60 * 60 * 1000); // Ogni ora

module.exports = connectionManager;