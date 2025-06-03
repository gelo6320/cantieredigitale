const axios = require('axios');

// Funzione helper per ottenere statistiche WhatsApp
async function getWhatsAppStats(req) {
  try {
    // Ottieni la connessione utente per accedere al chat database
    const { getUserConnection } = require('../utils');
    const connection = await getUserConnection(req);
    
    if (!connection || !connection.models['ChatConversation']) {
      return {
        totalConversations: 0,
        activeConversations: 0,
        completedConversations: 0,
        totalMessages: 0,
        avgResponseTime: 0,
        conversionRate: 0
      };
    }

    const ChatConversation = connection.model('ChatConversation');
    const ChatMessage = connection.model('ChatMessage');
    
    // Calcola statistiche
    const totalConversations = await ChatConversation.countDocuments();
    const activeConversations = await ChatConversation.countDocuments({ status: 'active' });
    const completedConversations = await ChatConversation.countDocuments({ status: 'completed' });
    const totalMessages = await ChatMessage.countDocuments();
    
    // Calcola conversion rate
    const appointmentBookings = await ChatConversation.countDocuments({ 
      risultato: 'appointment_booked' 
    });
    const conversionRate = totalConversations > 0 ? 
      (appointmentBookings / totalConversations * 100) : 0;

    // Calcola tempo di risposta medio
    const avgResponseTimeResult = await ChatMessage.aggregate([
      { $match: { role: 'assistant', responseTime: { $exists: true, $gt: 0 } } },
      { $group: { _id: null, avgTime: { $avg: '$responseTime' } } }
    ]);
    
    const avgResponseTime = avgResponseTimeResult.length > 0 ? 
      Math.round(avgResponseTimeResult[0].avgTime) : 0;

    return {
      totalConversations,
      activeConversations,
      completedConversations,
      totalMessages,
      avgResponseTime,
      conversionRate: Math.round(conversionRate * 100) / 100
    };
    
  } catch (error) {
    console.error('❌ [WHATSAPP STATS] Errore calcolo statistiche:', error);
    return {
      totalConversations: 0,
      activeConversations: 0,
      completedConversations: 0,
      totalMessages: 0,
      avgResponseTime: 0,
      conversionRate: 0
    };
  }
}

// Funzioni helper per registrare modelli chat
const registerChatModels = (connection) => {
  const { ChatMessageSchema, ChatConversationSchema } = require('../models');
  
  if (!connection.models['ChatMessage']) {
    connection.model('ChatMessage', ChatMessageSchema);
  }
  if (!connection.models['ChatConversation']) {
    connection.model('ChatConversation', ChatConversationSchema);
  }
};

// Funzione per tracciare risposta manuale
async function trackManualResponse(conversationId, username, connection) {
    try {
        registerChatModels(connection);
        const ChatConversation = connection.model('ChatConversation');

        const result = await ChatConversation.updateOne(
            { conversationId },
            {
                $inc: { 'botControl.manualResponsesCount': 1 },
                $set: {
                    'botControl.lastManualResponse': new Date(),
                    'botControl.lastManualResponseBy': username,
                    lastActivity: new Date(),
                    updatedAt: new Date()
                }
            }
        );

        if (result.matchedCount > 0) {
            console.log(`✋ [BOT CONTROL] Risposta manuale tracciata per ${conversationId} da ${username}`);
        } else {
            console.warn(`⚠️ [BOT CONTROL] Conversazione ${conversationId} non trovata per tracking`);
        }
    } catch (error) {
        console.error('❌ [BOT CONTROL] Errore tracking risposta manuale:', error);
    }
}

// Funzioni helper per calcolo health score e raccomandazioni
function calculateHealthScore(botStats, generalStats) {
  let score = 100;
  
  // Penalizza per errori
  if (botStats.erroriAI > 0) {
    score -= Math.min(20, botStats.erroriAI * 2);
  }
  
  if (botStats.database && botStats.database.erroriDB > 0) {
    score -= Math.min(15, botStats.database.erroriDB * 3);
  }
  
  // Premia per conversion rate alto
  if (botStats.conversionRate > 50) {
    score += 10;
  } else if (botStats.conversionRate < 20) {
    score -= 10;
  }
  
  // Premia per success rate alto
  if (botStats.successRate > 95) {
    score += 5;
  } else if (botStats.successRate < 80) {
    score -= 15;
  }
  
  return Math.max(0, Math.min(100, score));
}

function generateRecommendations(periodMetrics, botStats) {
  const recommendations = [];
  
  if (periodMetrics.conversionRate < 30) {
    recommendations.push({
      type: 'warning',
      message: 'Tasso di conversione basso. Considera di ottimizzare i prompt del bot.',
      priority: 'high'
    });
  }
  
  if (botStats.erroriAI > 5) {
    recommendations.push({
      type: 'error',
      message: 'Troppi errori AI rilevati. Verifica la configurazione di Claude.',
      priority: 'critical'
    });
  }
  
  if (botStats.tempoRispostaMediaMs > 5000) {
    recommendations.push({
      type: 'info',
      message: 'Tempi di risposta elevati. Considera di ottimizzare le chiamate API.',
      priority: 'medium'
    });
  }
  
  if (periodMetrics.activeConversations > periodMetrics.completedConversations * 2) {
    recommendations.push({
      type: 'warning',
      message: 'Molte conversazioni attive non completate. Verifica il follow-up.',
      priority: 'medium'
    });
  }
  
  return recommendations;
}

module.exports = {
  getWhatsAppStats,
  registerChatModels,
  trackManualResponse,
  calculateHealthScore,
  generateRecommendations
};