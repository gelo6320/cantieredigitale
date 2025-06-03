const { connectDatabase, mongoose } = require('./database');
const { sessionConfig, sessionMiddleware } = require('./session');
const { corsOptions, corsMiddleware } = require('./cors');
const { transporter } = require('./email');

module.exports = {
  connectDatabase,
  mongoose,
  sessionConfig,
  sessionMiddleware,
  corsOptions,
  corsMiddleware,
  transporter
};