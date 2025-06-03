const express = require('express');
const { getUserConnection } = require('../utils');
const { 
  getWhatsAppStats, 
  registerChatModels, 
  calculateHealthScore, 
  generateRecommendations 
} = require('../services');

const router = express.Router();

// 1. Ottieni statistiche generali delle chat
router.get('/stats', async (req, res) => {
  try {
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(503).json({
        status: 'error',
        message: 'Database non disponibile o non configurato correttamente'
      });
    }

    // Registra i modelli chat
    registerChatModels(connection);
    
    const ChatConversation = connection.model('ChatConversation');
    const ChatMessage = connection.model('ChatMessage');

    // Calcola statistiche database
    const dbStats = await getWhatsAppStats(req);

    res.json({
      status: 'success',
      data: {
        database: dbStats,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[CHAT API] Errore recupero statistiche:', error);
    res.status(500).json({
      status: 'error',
      message: 'Errore nel recupero delle statistiche',
      error: error.message
    });
  }
});

// 2. Lista conversazioni recenti
router.get('/conversations', async (req, res) => {
  try {
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(503).json({
        status: 'error',
        message: 'Database non disponibile o non configurato correttamente'
      });
    }

    // Registra i modelli chat
    registerChatModels(connection);
    
    const ChatConversation = connection.model('ChatConversation');

    const { 
      limit = 50, 
      status = null, 
      page = 1,
      phone = null,
      from = null,
      to = null 
    } = req.query;

    let query = {};
    
    // Filtri
    if (status) query.status = status;
    if (phone) {
      query.$or = [
        { 'cliente.telefono': phone },
        { 'cliente.whatsappNumber': phone },
        { 'cliente.normalizedNumber': phone }
      ];
    }
    if (from || to) {
      query.startTime = {};
      if (from) query.startTime.$gte = new Date(from);
      if (to) query.startTime.$lte = new Date(to);
    }

    // Paginazione
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [conversations, total] = await Promise.all([
      ChatConversation.find(query)
        .sort({ lastActivity: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      ChatConversation.countDocuments(query)
    ]);

    res.json({
      status: 'success',
      data: {
        conversations,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          hasMore: (skip + conversations.length) < total
        }
      }
    });
  } catch (error) {
    console.error('[CHAT API] Errore recupero conversazioni:', error);
    res.status(500).json({
      status: 'error',
      message: 'Errore nel recupero delle conversazioni',
      error: error.message
    });
  }
});

// 3. Ottieni conversazione specifica con tutti i messaggi
router.get('/conversations/:conversationId', async (req, res) => {
  try {
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(503).json({
        status: 'error',
        message: 'Database non disponibile o non configurato correttamente'
      });
    }

    // Registra i modelli chat
    registerChatModels(connection);
    
    const ChatConversation = connection.model('ChatConversation');
    const ChatMessage = connection.model('ChatMessage');

    const { conversationId } = req.params;
    const { includeMetadata = false } = req.query;

    // Recupera conversazione e messaggi in parallelo
    const [conversation, messages] = await Promise.all([
      ChatConversation.findOne({ conversationId }).lean(),
      ChatMessage.find({ conversationId })
        .sort({ timestamp: 1 })
        .lean()
    ]);
    
    if (!conversation) {
      return res.status(404).json({
        status: 'error',
        message: 'Conversazione non trovata'
      });
    }

    // Filtra metadata se richiesto
    let processedMessages = messages;
    if (!includeMetadata) {
      processedMessages = messages.map(msg => ({
        messageId: msg.messageId,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        aiGenerated: msg.aiGenerated,
        delivered: msg.delivered,
        responseTime: msg.responseTime
      }));
    }

    res.json({
      status: 'success',
      data: {
        conversation,
        messages: processedMessages,
        summary: {
          totalMessages: messages.length,
          userMessages: messages.filter(m => m.role === 'user').length,
          botMessages: messages.filter(m => m.role === 'assistant').length,
          avgResponseTime: conversation.stats?.avgResponseTime || 0,
          duration: conversation.totalDuration || 0
        }
      }
    });
  } catch (error) {
    console.error('[CHAT API] Errore recupero conversazione:', error);
    res.status(500).json({
      status: 'error',
      message: 'Errore nel recupero della conversazione',
      error: error.message
    });
  }
});

// 4. Cerca conversazioni per cliente (numero di telefono)
router.get('/customer/:phone', async (req, res) => {
  try {
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(503).json({
        status: 'error',
        message: 'Database non disponibile o non configurato correttamente'
      });
    }

    // Registra i modelli chat
    registerChatModels(connection);
    
    const ChatConversation = connection.model('ChatConversation');
    const ChatMessage = connection.model('ChatMessage');

    const { phone } = req.params;
    const { includeMessages = false } = req.query;

    // Cerca conversazioni per questo numero
    const conversations = await ChatConversation.find({
      $or: [
        { 'cliente.telefono': phone },
        { 'cliente.whatsappNumber': phone },
        { 'cliente.normalizedNumber': phone }
      ]
    }).sort({ startTime: -1 }).lean();
    
    if (conversations.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Nessuna conversazione trovata per questo numero'
      });
    }

    let result = conversations;

    // Se richiesto, includi anche i messaggi
    if (includeMessages === 'true') {
      result = await Promise.all(conversations.map(async (conv) => {
        const messages = await ChatMessage.find({ 
          conversationId: conv.conversationId 
        }).sort({ timestamp: 1 }).lean();
        
        return {
          ...conv,
          messages
        };
      }));
    }

    res.json({
      status: 'success',
      data: {
        customer: {
          phone,
          totalConversations: conversations.length,
          activeConversations: conversations.filter(c => c.status === 'active').length,
          completedConversations: conversations.filter(c => c.status === 'completed').length
        },
        conversations: result
      }
    });
  } catch (error) {
    console.error('[CHAT API] Errore ricerca cliente:', error);
    res.status(500).json({
      status: 'error',
      message: 'Errore nella ricerca del cliente',
      error: error.message
    });
  }
});

router.get('/export/:conversationId', async (req, res) => {
  try {
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(503).json({
        status: 'error',
        message: 'Database non disponibile o non configurato correttamente'
      });
    }

    // Registra i modelli chat
    registerChatModels(connection);
    
    const ChatConversation = connection.model('ChatConversation');
    const ChatMessage = connection.model('ChatMessage');

    const { conversationId } = req.params;
    const { format = 'json' } = req.query;

    // Recupera conversazione e messaggi
    const [conversation, messages] = await Promise.all([
      ChatConversation.findOne({ conversationId }).lean(),
      ChatMessage.find({ conversationId }).sort({ timestamp: 1 }).lean()
    ]);
    
    if (!conversation) {
      return res.status(404).json({
        status: 'error',
        message: 'Conversazione non trovata per esportazione'
      });
    }

    const exportData = {
      conversation,
      messages,
      exportedAt: new Date(),
      exportVersion: '1.0'
    };

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="conversation_${conversationId}.json"`);
      res.json(exportData);
    } else if (format === 'txt') {
      // Formato testo semplice
      let textContent = `CONVERSAZIONE: ${conversationId}\n`;
      textContent += `ESPORTATA: ${exportData.exportedAt}\n`;
      textContent += `CLIENTE: ${conversation.cliente.nome || conversation.cliente.contactName}\n`;
      textContent += `TELEFONO: ${conversation.cliente.telefono}\n`;
      textContent += `STATO: ${conversation.status}\n`;
      textContent += `DURATA: ${conversation.totalDuration || 0} minuti\n`;
      textContent += `\n${'='.repeat(50)}\n\n`;

      messages.forEach(msg => {
        const timestamp = new Date(msg.timestamp).toLocaleString('it-IT');
        const speaker = msg.role === 'user' ? 'CLIENTE' : 'BOT';
        textContent += `[${timestamp}] ${speaker}: ${msg.content}\n\n`;
      });

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="conversation_${conversationId}.txt"`);
      res.send(textContent);
    } else {
      res.status(400).json({
        status: 'error',
        message: 'Formato non supportato. Usa "json" o "txt"'
      });
    }
  } catch (error) {
    console.error('[CHAT API] Errore esportazione:', error);
    res.status(500).json({
      status: 'error',
      message: 'Errore nell\'esportazione della conversazione',
      error: error.message
    });
  }
});

// 6. Aggiorna stato conversazione
router.patch('/conversations/:conversationId', async (req, res) => {
  try {
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(503).json({
        status: 'error',
        message: 'Database non disponibile o non configurato correttamente'
      });
    }

    // Registra i modelli chat
    registerChatModels(connection);
    
    const ChatConversation = connection.model('ChatConversation');

    const { conversationId } = req.params;
    const allowedFields = ['status', 'priority', 'tags', 'quality'];
    
    const updateData = {};
    Object.keys(req.body).forEach(key => {
      if (allowedFields.includes(key)) {
        updateData[key] = req.body[key];
      }
    });

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Nessun campo valido da aggiornare'
      });
    }

    const updatedConversation = await ChatConversation.findOneAndUpdate(
      { conversationId },
      { 
        $set: {
          ...updateData,
          lastActivity: new Date(),
          updatedAt: new Date()
        }
      },
      { new: true, runValidators: true }
    );

    if (!updatedConversation) {
      return res.status(404).json({
        status: 'error',
        message: 'Conversazione non trovata'
      });
    }

    res.json({
      status: 'success',
      message: 'Conversazione aggiornata con successo',
      data: updatedConversation
    });
  } catch (error) {
    console.error('[CHAT API] Errore aggiornamento conversazione:', error);
    res.status(500).json({
      status: 'error',
      message: 'Errore nell\'aggiornamento della conversazione',
      error: error.message
    });
  }
});

// 7. Dashboard overview per amministratori
router.get('/dashboard', async (req, res) => {
  try {
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(503).json({
        status: 'error',
        message: 'Database non disponibile o non configurato correttamente'
      });
    }

    // Registra i modelli chat
    registerChatModels(connection);
    
    const ChatConversation = connection.model('ChatConversation');

    const { period = '7d' } = req.query;
    
    // Calcola date per il periodo
    const now = new Date();
    const startDate = new Date();
    
    switch (period) {
      case '24h':
        startDate.setDate(now.getDate() - 1);
        break;
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      default:
        startDate.setDate(now.getDate() - 7);
    }

    // Statistiche del periodo e generali
    const [recentConversations, generalStats] = await Promise.all([
      ChatConversation.find({
        startTime: { $gte: startDate }
      }).sort({ startTime: -1 }).lean(),
      
      // USA LA FUNZIONE ESISTENTE invece dell'aggregazione manuale
      getWhatsAppStats(req)
    ]);

    // Metriche del periodo
    const periodMetrics = {
      totalConversations: recentConversations.length,
      completedConversations: recentConversations.filter(c => c.status === 'completed').length,
      activeConversations: recentConversations.filter(c => c.status === 'active').length,
      avgDuration: recentConversations.reduce((sum, c) => sum + (c.totalDuration || 0), 0) / (recentConversations.length || 1),
      conversionRate: recentConversations.length > 0 
        ? (recentConversations.filter(c => c.risultato === 'appointment_booked').length / recentConversations.length * 100) 
        : 0
    };

    // Top 5 conversazioni più lunghe del periodo
    const topConversations = recentConversations
      .sort((a, b) => (b.totalDuration || 0) - (a.totalDuration || 0))
      .slice(0, 5)
      .map(conv => ({
        conversationId: conv.conversationId,
        cliente: conv.cliente.nome || conv.cliente.contactName,
        telefono: conv.cliente.telefono,
        durata: conv.totalDuration,
        status: conv.status,
        risultato: conv.risultato
      }));

    // USA LE FUNZIONI ESISTENTI per health score e raccomandazioni
    const healthScore = calculateHealthScore(periodMetrics, generalStats);
    const recommendations = generateRecommendations(periodMetrics, generalStats);

    res.json({
      status: 'success',
      data: {
        period: {
          from: startDate.toISOString(),
          to: now.toISOString(),
          label: period
        },
        generalStats, // Ora usa il risultato di getWhatsAppStats()
        periodMetrics,
        topConversations,
        // AGGIUNGI LA SEZIONE SUMMARY con le funzioni esistenti
        summary: {
          healthScore,
          recommendations
        }
      }
    });
  } catch (error) {
    console.error('[CHAT API] Errore dashboard:', error);
    res.status(500).json({
      status: 'error',
      message: 'Errore nel recupero dei dati dashboard',
      error: error.message
    });
  }
});

router.post('/cleanup', async (req, res) => {
  try {
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(503).json({
        status: 'error',
        message: 'Database non disponibile o non configurato correttamente'
      });
    }

    // Registra i modelli chat
    registerChatModels(connection);
    
    const ChatConversation = connection.model('ChatConversation');

    const { daysOld = 30, dryRun = false } = req.body;

    console.log(`🧹 [CLEANUP] Avvio cleanup - ${daysOld} giorni, dryRun: ${dryRun}`);

    // Calcola data di cutoff
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(daysOld));
    
    console.log(`🧹 [CLEANUP] Data cutoff: ${cutoffDate.toISOString()}`);

    if (dryRun) {
      // Simula il cleanup senza effettuarlo
      console.log('🧹 [CLEANUP] Modalità DRY RUN - nessuna modifica effettuata');
      
      const toArchive = await ChatConversation.find({
        lastActivity: { $lt: cutoffDate },
        status: { $in: ['abandoned', 'completed'] }
      }).lean();

      console.log(`🧹 [CLEANUP] Trovate ${toArchive.length} conversazioni da archiviare`);

      // Preview delle prime 10 conversazioni
      const preview = toArchive.slice(0, 10).map(conv => ({
        conversationId: conv.conversationId,
        lastActivity: conv.lastActivity,
        status: conv.status,
        cliente: conv.cliente?.nome || conv.cliente?.contactName || 'Sconosciuto',
        telefono: conv.cliente?.telefono || 'N/A',
        daysSinceLastActivity: Math.floor((Date.now() - new Date(conv.lastActivity).getTime()) / (1000 * 60 * 60 * 24))
      }));

      res.json({
        status: 'success',
        message: 'Simulazione cleanup completata',
        data: {
          conversationsToArchive: toArchive.length,
          daysOld: parseInt(daysOld),
          cutoffDate: cutoffDate.toISOString(),
          executed: false,
          preview,
          summary: {
            abandoned: toArchive.filter(c => c.status === 'abandoned').length,
            completed: toArchive.filter(c => c.status === 'completed').length
          }
        }
      });
    } else {
      // Esegui il cleanup reale
      console.log('🧹 [CLEANUP] Esecuzione cleanup reale...');
      
      // Prima conta quante ne troverà
      const countToArchive = await ChatConversation.countDocuments({
        lastActivity: { $lt: cutoffDate },
        status: { $in: ['abandoned', 'completed'] }
      });

      console.log(`🧹 [CLEANUP] ${countToArchive} conversazioni da archiviare`);

      if (countToArchive === 0) {
        return res.json({
          status: 'success',
          message: 'Nessuna conversazione da archiviare',
          data: {
            archivedConversations: 0,
            daysOld: parseInt(daysOld),
            cutoffDate: cutoffDate.toISOString(),
            executed: true
          }
        });
      }

      // Esegui l'aggiornamento
      const result = await ChatConversation.updateMany(
        {
          lastActivity: { $lt: cutoffDate },
          status: { $in: ['abandoned', 'completed'] }
        },
        {
          $set: { 
            status: 'archived',
            updatedAt: new Date()
          }
        }
      );

      console.log(`🧹 [CLEANUP] Cleanup completato: ${result.modifiedCount} conversazioni archiviate`);
      
      res.json({
        status: 'success',
        message: 'Cleanup completato con successo',
        data: {
          archivedConversations: result.modifiedCount || 0,
          matchedConversations: result.matchedCount || 0,
          daysOld: parseInt(daysOld),
          cutoffDate: cutoffDate.toISOString(),
          executed: true
        }
      });
    }
  } catch (error) {
    console.error('❌ [CLEANUP] Errore durante il cleanup:', error);
    res.status(500).json({
      status: 'error',
      message: 'Errore durante il cleanup',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

module.exports = router;