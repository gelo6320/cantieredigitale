const cors = require('cors');

// Configurazione CORS
const corsOptions = {
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
};

module.exports = {
  corsOptions,
  corsMiddleware: cors(corsOptions)
};