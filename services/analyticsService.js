/**
 * Servizio Analytics Semplificato - Solo Pattern Temporali
 * @author Costruzione Digitale
 * @version 2.0
 */

const mongoose = require('mongoose');
const { log } = require('../utils/logger');

// ================================================================
// SCHEMA SESSIONI (Solo quello necessario)
// ================================================================

const SessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  userId: { type: String, sparse: true, index: true },
  startTime: { type: Date, default: Date.now, index: true },
  duration: Number,
  pageViews: { type: Number, default: 0 },
  conversions: { type: Number, default: 0 },
  trafficSource: String
});

// ================================================================
// SCHEMA ANALYTICS TEMPORALI
// ================================================================

const TemporalAnalyticsSchema = new mongoose.Schema({
  date: { type: Date, required: true, index: true },
  period: { 
    type: String, 
    enum: ['daily', 'weekly', 'monthly'], 
    required: true, 
    index: true 
  },
  periodKey: { type: String, required: true, index: true },
  
  // Distribuzione oraria (0-23)
  hourlyDistribution: [{
    hour: { type: Number, min: 0, max: 23 },
    visits: { type: Number, default: 0 },
    pageViews: { type: Number, default: 0 },
    engagement: { type: Number, default: 0 },
    conversions: { type: Number, default: 0 }
  }],
  
  // Distribuzione giorni settimana (0=Dom, 6=Sab)
  weeklyDistribution: [{
    dayOfWeek: { type: Number, min: 0, max: 6 },
    dayName: { type: String },
    visits: { type: Number, default: 0 },
    avgEngagement: { type: Number, default: 0 },
    peakHour: { type: Number, min: 0, max: 23 }
  }],
  
  // Summary
  totalSessions: { type: Number, default: 0 },
  avgEngagement: { type: Number, default: 0 },
  calculatedAt: { type: Date, default: Date.now }
});

// Indici per performance
TemporalAnalyticsSchema.index({ date: 1, period: 1 });
TemporalAnalyticsSchema.index({ periodKey: 1 });

/**
 * Registra i modelli nella connessione
 */
function registerModels(connection) {
  if (!connection.models['Session']) {
    connection.model('Session', SessionSchema);
  }
  
  if (!connection.models['TemporalAnalytics']) {
    connection.model('TemporalAnalytics', TemporalAnalyticsSchema);
  }
}

/**
 * Calcola pattern temporali da sessioni reali
 */
async function calculateTemporalPatterns(startDate, endDate, period = 'monthly', connection) {
  const functionName = 'calculateTemporalPatterns';
  log.enter(functionName, { startDate: startDate.toISOString(), endDate: endDate.toISOString(), period });

  try {
    registerModels(connection);
    
    // Inizializza strutture dati
    const hourlyDistribution = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      visits: 0,
      pageViews: 0,
      engagement: 0,
      conversions: 0
    }));

    const weeklyDistribution = [
      { dayOfWeek: 0, dayName: 'Sunday', visits: 0, avgEngagement: 0, peakHour: 0 },
      { dayOfWeek: 1, dayName: 'Monday', visits: 0, avgEngagement: 0, peakHour: 0 },
      { dayOfWeek: 2, dayName: 'Tuesday', visits: 0, avgEngagement: 0, peakHour: 0 },
      { dayOfWeek: 3, dayName: 'Wednesday', visits: 0, avgEngagement: 0, peakHour: 0 },
      { dayOfWeek: 4, dayName: 'Thursday', visits: 0, avgEngagement: 0, peakHour: 0 },
      { dayOfWeek: 5, dayName: 'Friday', visits: 0, avgEngagement: 0, peakHour: 0 },
      { dayOfWeek: 6, dayName: 'Saturday', visits: 0, avgEngagement: 0, peakHour: 0 }
    ];

    // Recupera SOLO sessioni reali - nessun fallback mock
    const Session = connection.model('Session');
    const sessions = await Session.find({
      startTime: { $gte: startDate, $lte: endDate },
      duration: { $exists: true, $gt: 0 }
    }).lean();

    if (sessions.length === 0) {
      log.warn(functionName, 'Nessuna sessione trovata per il periodo', { 
        startDate: startDate.toISOString(), 
        endDate: endDate.toISOString() 
      });
      
      return {
        hourlyDistribution,
        weeklyDistribution,
        totalSessions: 0,
        avgEngagement: 0
      };
    }

    let totalEngagement = 0;

    // Analizza ogni sessione
    for (const session of sessions) {
      const sessionDate = new Date(session.startTime);
      const hour = sessionDate.getHours();
      const dayOfWeek = sessionDate.getDay();
      
      // Calcola engagement sessione
      const engagement = calculateSessionEngagement(session);
      totalEngagement += engagement;

      // Aggiorna distribuzione oraria
      hourlyDistribution[hour].visits += 1;
      hourlyDistribution[hour].pageViews += session.pageViews || 0;
      hourlyDistribution[hour].engagement += engagement;
      hourlyDistribution[hour].conversions += session.conversions || 0;

      // Aggiorna distribuzione settimanale
      weeklyDistribution[dayOfWeek].visits += 1;
      weeklyDistribution[dayOfWeek].avgEngagement += engagement;
    }

    // Calcola medie
    hourlyDistribution.forEach(hour => {
      if (hour.visits > 0) {
        hour.engagement = Math.round(hour.engagement / hour.visits);
      }
    });

    weeklyDistribution.forEach(day => {
      if (day.visits > 0) {
        day.avgEngagement = Math.round(day.avgEngagement / day.visits);
        
        // Trova picco orario per questo giorno
        const dayHours = hourlyDistribution.map((hour, index) => ({ ...hour, hourIndex: index }))
          .filter(hour => {
            return sessions.some(s => {
              const sDate = new Date(s.startTime);
              return sDate.getDay() === day.dayOfWeek && sDate.getHours() === hour.hourIndex;
            });
          });
        
        if (dayHours.length > 0) {
          const peakHour = dayHours.reduce((max, current) => 
            current.visits > max.visits ? current : max);
          day.peakHour = peakHour.hourIndex;
        }
      }
    });

    const result = {
      hourlyDistribution,
      weeklyDistribution,
      totalSessions: sessions.length,
      avgEngagement: sessions.length > 0 ? Math.round(totalEngagement / sessions.length) : 0
    };

    log.info(functionName, 'Pattern temporali calcolati', {
      totalSessions: result.totalSessions,
      avgEngagement: result.avgEngagement
    });

    log.exit(functionName, { success: true });
    return result;

  } catch (error) {
    log.error(functionName, 'Errore calcolo pattern temporali', error);
    log.exit(functionName, { success: false, error: true });
    throw error;
  }
}

/**
 * Calcola l'engagement di una sessione
 */
function calculateSessionEngagement(session) {
  let score = 0;
  
  // Componente tempo (max 40 punti)
  const duration = session.duration || 0;
  if (duration > 300) score += 40;
  else if (duration > 120) score += 30;
  else if (duration > 60) score += 20;
  else if (duration > 30) score += 10;
  else score += 5;

  // Componente pageviews (max 30 punti)
  const pageViews = session.pageViews || 0;
  if (pageViews >= 5) score += 30;
  else if (pageViews >= 3) score += 25;
  else if (pageViews >= 2) score += 20;
  else score += 10;

  // Componente conversioni (max 30 punti)
  const conversions = session.conversions || 0;
  score += Math.min(conversions * 15, 30);

  return Math.min(score, 100);
}

/**
 * Genera e salva analytics temporali
 */
async function generateTemporalAnalytics(startDate, endDate, period = 'monthly', connection) {
  const functionName = 'generateTemporalAnalytics';
  log.enter(functionName, { startDate: startDate.toISOString(), endDate: endDate.toISOString(), period });

  try {
    registerModels(connection);

    const periodKey = generatePeriodKey(startDate, period);
    const patterns = await calculateTemporalPatterns(startDate, endDate, period, connection);

    const analytics = {
      date: startDate,
      period,
      periodKey,
      ...patterns,
      calculatedAt: new Date()
    };

    // Salva o aggiorna
    const TemporalAnalytics = connection.model('TemporalAnalytics');
    const result = await TemporalAnalytics.findOneAndUpdate(
      { periodKey, period },
      analytics,
      { upsert: true, new: true }
    );

    log.info(functionName, 'Analytics temporali generate', {
      periodKey,
      totalSessions: analytics.totalSessions
    });

    log.exit(functionName, { success: true });
    return result;

  } catch (error) {
    log.error(functionName, 'Errore generazione analytics temporali', error);
    log.exit(functionName, { success: false, error: true });
    throw error;
  }
}

/**
 * Recupera analytics temporali
 */
async function getTemporalAnalytics(periodKey, period = 'monthly', connection) {
  const functionName = 'getTemporalAnalytics';
  log.enter(functionName, { periodKey, period });

  try {
    registerModels(connection);
    
    const TemporalAnalytics = connection.model('TemporalAnalytics');
    const analytics = await TemporalAnalytics.findOne({ periodKey, period }).lean();
    
    if (!analytics) {
      log.warn(functionName, 'Analytics temporali non trovate', { periodKey, period });
      return null;
    }

    log.info(functionName, 'Analytics temporali recuperate', {
      periodKey,
      totalSessions: analytics.totalSessions
    });

    log.exit(functionName, { success: true });
    return analytics;

  } catch (error) {
    log.error(functionName, 'Errore recupero analytics temporali', error);
    log.exit(functionName, { success: false, error: true });
    throw error;
  }
}

/**
 * Genera chiave periodo
 */
function generatePeriodKey(date, period) {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  
  switch (period) {
    case 'daily':
      return `${year}-${month}-${day}`;
    case 'weekly':
      const weekNumber = Math.ceil((date.getDate() + new Date(year, date.getMonth(), 1).getDay()) / 7);
      return `${year}-W${weekNumber.toString().padStart(2, '0')}`;
    case 'monthly':
      return `${year}-${month}`;
    default:
      return `${year}-${month}-${day}`;
  }
}

module.exports = {
  calculateTemporalPatterns,
  generateTemporalAnalytics,
  getTemporalAnalytics,
  generatePeriodKey,
  registerModels
};