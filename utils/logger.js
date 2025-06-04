/**
 * Winston Logger Configuration
 * ===========================
 * 
 * Configurazione logger Winston personalizzata per supportare
 * i metodi enter/exit e logging strutturato utilizzati nei servizi analytics.
 * 
 * @author Costruzione Digitale
 * @version 1.0
 */

const winston = require('winston');
const path = require('path');

// ================================================================
// CONFIGURAZIONE WINSTON
// ================================================================

// Configurazione dei livelli personalizzati
const customLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    enter: 3,
    exit: 3,
    debug: 4
  },
  colors: {
    error: 'red',
    warn: 'yellow',
    info: 'blue',
    enter: 'green',
    exit: 'green',
    debug: 'gray'
  }
};

// Aggiungi i colori personalizzati
winston.addColors(customLevels.colors);

// Formato per i log in console (development)
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, functionName, data, ...meta }) => {
    let logMessage = `${timestamp} [${level}]`;
    
    if (functionName) {
      logMessage += ` [${functionName}]`;
    }
    
    logMessage += `: ${message}`;
    
    // Aggiungi dati strutturati se presenti
    if (data && Object.keys(data).length > 0) {
      logMessage += ` | Data: ${JSON.stringify(data)}`;
    }
    
    // Aggiungi meta informazioni aggiuntive
    const metaKeys = Object.keys(meta);
    if (metaKeys.length > 0) {
      const metaStr = metaKeys.map(key => `${key}: ${JSON.stringify(meta[key])}`).join(', ');
      logMessage += ` | Meta: ${metaStr}`;
    }
    
    return logMessage;
  })
);

// Formato per i log in file (production)
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Configurazione transport per console
const consoleTransport = new winston.transports.Console({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: consoleFormat,
  handleExceptions: true,
  handleRejections: true
});

// Configurazione transport per file generale
const fileTransport = new winston.transports.File({
  filename: path.join(process.cwd(), 'logs', 'app.log'),
  level: 'info',
  format: fileFormat,
  maxsize: 10485760, // 10MB
  maxFiles: 5,
  handleExceptions: true,
  handleRejections: true
});

// Transport specifico per errori
const errorFileTransport = new winston.transports.File({
  filename: path.join(process.cwd(), 'logs', 'error.log'),
  level: 'error',
  format: fileFormat,
  maxsize: 10485760, // 10MB
  maxFiles: 5,
  handleExceptions: true,
  handleRejections: true
});

// Transport per analytics (separato per facilità di analisi)
const analyticsFileTransport = new winston.transports.File({
  filename: path.join(process.cwd(), 'logs', 'analytics.log'),
  level: 'debug',
  format: fileFormat,
  maxsize: 20971520, // 20MB
  maxFiles: 10
});

// Crea logger principale
const logger = winston.createLogger({
  levels: customLevels.levels,
  transports: [
    consoleTransport,
    fileTransport,
    errorFileTransport,
    analyticsFileTransport
  ],
  exitOnError: false,
  silent: process.env.NODE_ENV === 'test'
});

// ================================================================
// WRAPPER PERSONALIZZATO PER I METODI UTILIZZATI
// ================================================================

/**
 * Wrapper per supportare i metodi utilizzati nei servizi analytics
 */
class AnalyticsLogger {
  constructor(winstonLogger) {
    this.winston = winstonLogger;
    this.functionStack = new Map(); // Traccia le funzioni attive
  }

  /**
   * Log di ingresso in una funzione
   * @param {string} functionName - Nome funzione
   * @param {Object} params - Parametri di ingresso
   */
  enter(functionName, params = {}) {
    const timestamp = Date.now();
    this.functionStack.set(functionName, { startTime: timestamp, params });
    
    this.winston.log('enter', `Entering function`, {
      functionName,
      data: params,
      timestamp: new Date().toISOString(),
      action: 'enter'
    });
  }

  /**
   * Log di uscita da una funzione
   * @param {string} functionName - Nome funzione
   * @param {Object} result - Risultato della funzione
   */
  exit(functionName, result = {}) {
    const functionData = this.functionStack.get(functionName);
    let duration = null;
    
    if (functionData) {
      duration = Date.now() - functionData.startTime;
      this.functionStack.delete(functionName);
    }
    
    this.winston.log('exit', `Exiting function`, {
      functionName,
      data: result,
      duration: duration ? `${duration}ms` : 'unknown',
      timestamp: new Date().toISOString(),
      action: 'exit'
    });
  }

  /**
   * Log informativo
   * @param {string} functionName - Nome funzione
   * @param {string} message - Messaggio
   * @param {Object} data - Dati aggiuntivi
   */
  info(functionName, message, data = {}) {
    this.winston.info(message, {
      functionName,
      data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log di errore
   * @param {string} functionName - Nome funzione
   * @param {string} message - Messaggio errore
   * @param {Error|Object} error - Oggetto errore
   */
  error(functionName, message, error = {}) {
    const errorData = {
      functionName,
      timestamp: new Date().toISOString()
    };

    // Gestisce sia oggetti Error che errori custom
    if (error instanceof Error) {
      errorData.error = {
        message: error.message,
        stack: error.stack,
        name: error.name
      };
    } else {
      errorData.data = error;
    }

    this.winston.error(message, errorData);
  }

  /**
   * Log di debug
   * @param {string} functionName - Nome funzione
   * @param {string} message - Messaggio debug
   * @param {Object} data - Dati debug
   */
  debug(functionName, message, data = {}) {
    this.winston.debug(message, {
      functionName,
      data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log di warning
   * @param {string} functionName - Nome funzione
   * @param {string} message - Messaggio warning
   * @param {Object} data - Dati warning
   */
  warn(functionName, message, data = {}) {
    this.winston.warn(message, {
      functionName,
      data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Crea un logger child per un modulo specifico
   * @param {string} moduleName - Nome modulo
   * @returns {AnalyticsLogger} - Logger child
   */
  child(moduleName) {
    const childLogger = this.winston.child({ module: moduleName });
    return new AnalyticsLogger(childLogger);
  }

  /**
   * Ottieni statistiche delle performance delle funzioni
   * @returns {Object} - Statistiche performance
   */
  getPerformanceStats() {
    const activeFunction = Array.from(this.functionStack.entries()).map(([name, data]) => ({
      functionName: name,
      runningTime: Date.now() - data.startTime,
      params: data.params
    }));

    return {
      activeFunctions: activeFunction,
      activeCount: activeFunction.length
    };
  }

  /**
   * Log di metriche per analytics
   * @param {string} metric - Nome metrica
   * @param {number} value - Valore metrica
   * @param {Object} tags - Tag aggiuntivi
   */
  metric(metric, value, tags = {}) {
    this.winston.info(`Metric: ${metric}`, {
      metric,
      value,
      tags,
      timestamp: new Date().toISOString(),
      type: 'metric'
    });
  }

  /**
   * Flush dei log (utile per test)
   */
  async flush() {
    return new Promise((resolve) => {
      this.winston.on('finish', resolve);
      this.winston.end();
    });
  }
}

// ================================================================
// INIZIALIZZAZIONE
// ================================================================

// Crea directory logs se non esiste
const fs = require('fs');
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Crea istanza del logger personalizzato
const log = new AnalyticsLogger(logger);

// Gestione degli errori non catturati
process.on('uncaughtException', (error) => {
  log.error('process', 'Uncaught Exception', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  log.error('process', 'Unhandled Rejection', {
    reason: reason?.toString() || 'Unknown reason',
    promise: promise?.toString() || 'Unknown promise'
  });
});

// ================================================================
// ESPORTAZIONI
// ================================================================

module.exports = {
  log,
  logger, // Logger Winston raw per casi avanzati
  AnalyticsLogger,
  
  // Factory per creare logger specifici per moduli
  createModuleLogger: (moduleName) => log.child(moduleName),
  
  // Metodi di utility
  setLogLevel: (level) => {
    logger.transports.forEach(transport => {
      if (transport.level !== undefined) {
        transport.level = level;
      }
    });
  },
  
  // Configurazione per testing
  enableTestMode: () => {
    logger.silent = true;
  },
  
  disableTestMode: () => {
    logger.silent = false;
  }
};