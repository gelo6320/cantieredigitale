const express = require('express');
const axios = require('axios');
const { getUserConnection, getUserConfig } = require('../utils');
const { getWhatsAppStats, registerChatModels, trackManualResponse } = require('../services');

const router = express.Router();

// Endpoint per ottenere il profilo WhatsApp Business
router.get('/profile', async (req, res) => {
  try {
    // Verifica autenticazione
    if (!req.session || !req.session.isAuthenticated) {
      return res.status(401).json({ 
        success: false, 
        message: 'Non autorizzato' 
      });
    }

    // Ottieni configurazione utente
    const username = req.session.user.username;
    const userConfig = await getUserConfig(username);
    
    if (!userConfig.whatsapp_access_token || !userConfig.whatsapp_phone_number_id) {
      return res.status(400).json({ 
        success: false, 
        message: 'Configurazione WhatsApp mancante' 
      });
    }

    // Ottieni info account WhatsApp Business
    const response = await axios.get(
      `https://graph.facebook.com/v22.0/${userConfig.whatsapp_phone_number_id}`,
      {
        headers: {
          'Authorization': `Bearer ${userConfig.whatsapp_access_token}`
        },
        timeout: 10000
      }
    );

    res.json({
      success: true,
      data: {
        phone_number: response.data.display_phone_number,
        verified_name: response.data.verified_name,
        name: response.data.name,
        id: response.data.id,
        status: 'connected'
      }
    });

  } catch (error) {
    console.error('❌ [WHATSAPP API] Errore recupero profilo:', error);
    
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel recupero del profilo WhatsApp',
      error: error.response?.data || error.message
    });
  }
});

// Endpoint per testare la connessione WhatsApp
router.get('/test-connection', async (req, res) => {
  try {
    const username = req.session.user.username;
    const userConfig = await getUserConfig(username);
    
    if (!userConfig.whatsapp_access_token || !userConfig.whatsapp_phone_number_id) {
      return res.status(400).json({ 
        success: false, 
        message: 'Configurazione WhatsApp mancante. Configura WHATSAPP_ACCESS_TOKEN e WHATSAPP_PHONE_NUMBER_ID nelle impostazioni.' 
      });
    }

    // Test connessione
    const response = await axios.get(
      `https://graph.facebook.com/v22.0/${userConfig.whatsapp_phone_number_id}`,
      {
        headers: {
          'Authorization': `Bearer ${userConfig.whatsapp_access_token}`
        },
        timeout: 10000
      }
    );

    console.log('✅ [WHATSAPP API] Test connessione riuscito');
    
    res.json({
      success: true,
      message: 'Connessione WhatsApp Business API attiva',
      data: {
        phone_number: response.data.display_phone_number,
        verified_name: response.data.verified_name,
        account_name: response.data.name,
        status: 'connected'
      }
    });

  } catch (error) {
    console.error('❌ [WHATSAPP API] Test connessione fallito:', error);
    
    let errorMessage = 'Connessione WhatsApp Business API fallita';
    let suggestion = '';

    if (error.response?.data?.error) {
      const apiError = error.response.data.error;
      errorMessage = apiError.message;
      
      if (apiError.code === 100) {
        suggestion = 'Verifica WHATSAPP_ACCESS_TOKEN nelle impostazioni';
      } else if (apiError.code === 190) {
        suggestion = 'Token scaduto o non valido';
      }
    }

    res.status(400).json({ 
      success: false, 
      message: errorMessage,
      suggestion: suggestion,
      error: error.response?.data || error.message
    });
  }
});

// Endpoint per ottenere statistiche WhatsApp
router.get('/stats', async (req, res) => {
  try {
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.json({
        success: true,
        data: {
          totalConversations: 0,
          activeConversations: 0,
          completedConversations: 0,
          totalMessages: 0,
          avgResponseTime: 0,
          conversionRate: 0
        }
      });
    }

    // Registra i modelli chat
    registerChatModels(connection);
    
    // Calcola statistiche
    const stats = await getWhatsAppStats(req);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('❌ [WHATSAPP API] Errore recupero statistiche:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel recupero delle statistiche WhatsApp' 
    });
  }
});

// Endpoint per iniziare una nuova conversazione
router.post('/start-conversation', async (req, res) => {
  try {
    const { phone, name } = req.body;
    
    if (!phone) {
      return res.status(400).json({ 
        success: false, 
        message: 'Numero di telefono richiesto' 
      });
    }

    // Ottieni configurazione utente
    const username = req.session.user.username;
    const userConfig = await getUserConfig(username);
    
    if (!userConfig.whatsapp_access_token || !userConfig.whatsapp_phone_number_id) {
      return res.status(400).json({ 
        success: false, 
        message: 'Configurazione WhatsApp mancante nelle impostazioni utente' 
      });
    }

    // Ottieni la connessione utente per il database chat
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(503).json({
        success: false,
        message: 'Database non disponibile o non configurato correttamente'
      });
    }

    // Registra i modelli chat
    registerChatModels(connection);
    
    const ChatConversation = connection.model('ChatConversation');
    const ChatMessage = connection.model('ChatMessage');

    // Normalizza il numero di telefono
    let normalizedPhone = phone.replace(/\s+/g, '').replace(/[^\d+]/g, '');
    
    // Controlla se esiste già una conversazione attiva con questo numero
    const existingConversation = await ChatConversation.findOne({
      $or: [
        { 'cliente.telefono': phone },
        { 'cliente.telefono': normalizedPhone },
        { 'cliente.whatsappNumber': phone },
        { 'cliente.whatsappNumber': normalizedPhone },
        { 'cliente.normalizedNumber': normalizedPhone }
      ],
      status: { $in: ['active', 'completed'] } // Non includere quelle abbandonate o bloccate
    }).sort({ lastActivity: -1 });

    let conversation;
    let messages = [];

    if (existingConversation) {
      // Se esiste già una conversazione, restituiscila
      conversation = existingConversation;
      
      // Recupera i messaggi esistenti
      messages = await ChatMessage.find({ 
        conversationId: existingConversation.conversationId 
      }).sort({ timestamp: 1 }).lean();
      
      console.log(`📱 [WHATSAPP] Conversazione esistente trovata: ${conversation.conversationId}`);
    } else {
      // Crea una nuova conversazione
      const conversationId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      conversation = new ChatConversation({
        conversationId,
        cliente: {
          nome: name || 'Nuovo Contatto',
          telefono: phone,
          whatsappNumber: normalizedPhone,
          normalizedNumber: normalizedPhone,
          contactName: name || 'Nuovo Contatto'
        },
        status: 'active',
        startTime: new Date(),
        lastActivity: new Date(),
        stats: {
          totalMessages: 0,
          userMessages: 0,
          botMessages: 0,
          avgResponseTime: 0,
          completionRate: 0
        },
        isProactive: true, // Segnala che è una conversazione iniziata proattivamente
        tags: ['manual_start'],
        priority: 'medium'
      });
      
      await conversation.save();
      
      console.log(`📱 [WHATSAPP] Nuova conversazione creata: ${conversationId} per ${phone}`);
      
      // Crea un messaggio di sistema per indicare l'inizio della conversazione
      const systemMessage = new ChatMessage({
        messageId: `system_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        conversationId,
        role: 'system',
        content: `Conversazione iniziata con ${name || phone}`,
        timestamp: new Date(),
        isFirstContact: true,
        metadata: {
          initiatedBy: username,
          type: 'conversation_start'
        }
      });
      
      await systemMessage.save();
      messages = [systemMessage];
    }

    // Prepara la risposta nel formato ConversationDetails
    const response = {
      conversation: conversation.toObject(),
      messages: messages,
      summary: {
        totalMessages: messages.length,
        userMessages: messages.filter(m => m.role === 'user').length,
        botMessages: messages.filter(m => m.role === 'assistant').length,
        avgResponseTime: conversation.stats?.avgResponseTime || 0,
        duration: conversation.totalDuration || 0
      }
    };

    res.json({
      success: true,
      message: existingConversation ? 'Conversazione esistente recuperata' : 'Nuova conversazione creata',
      data: response
    });

  } catch (error) {
    console.error('❌ [WHATSAPP] Errore nella creazione della conversazione:', error);
    
    res.status(500).json({ 
      success: false, 
      message: 'Errore nella creazione della conversazione',
      error: error.message
    });
  }
});

router.post('/send-message', async (req, res) => {
  try {
    const { to, message, conversationId } = req.body;
    
    if (!to || !message) {
      return res.status(400).json({ 
        success: false, 
        message: 'Numero destinatario e messaggio sono richiesti' 
      });
    }

    // Ottieni configurazione utente
    const username = req.session.user.username;
    const userConfig = await getUserConfig(username);
    
    if (!userConfig.whatsapp_access_token || !userConfig.whatsapp_phone_number_id) {
      return res.status(400).json({ 
        success: false, 
        message: 'Configurazione WhatsApp mancante nelle impostazioni utente' 
      });
    }

    // Sanifica messaggio
    const sanitizedMessage = message
      .replace(/[\u2000-\u200F\u2028-\u202F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 4096);

    // Payload per Graph API v22.0
    const payload = {
      messaging_product: 'whatsapp',
      to: to,
      text: { body: sanitizedMessage }
    };

    // Invia messaggio tramite Graph API
    const response = await axios.post(
      `https://graph.facebook.com/v22.0/${userConfig.whatsapp_phone_number_id}/messages`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${userConfig.whatsapp_access_token}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    console.log(`📤 [WHATSAPP API] Messaggio MANUALE inviato a ${to}: "${sanitizedMessage}" da ${username}`);
    
    // Salva messaggio nel database chat se disponibile
    if (conversationId) {
      try {
        const connection = await getUserConnection(req);
        
        if (connection) {
          registerChatModels(connection);
          const ChatMessage = connection.model('ChatMessage');
          const ChatConversation = connection.model('ChatConversation');
          
          // Salva il messaggio
          await ChatMessage.create({
            messageId: `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            conversationId,
            role: 'assistant',
            content: sanitizedMessage,
            timestamp: new Date(),
            delivered: true,
            whatsappMessageId: response.data.messages?.[0]?.id,
            aiGenerated: false,  // IMPORTANTE: Non è generato dall'AI
            metadata: {
              sentBy: username,
              sentManually: true,
              isManualResponse: true  // NUOVO: Flag per risposta manuale
            }
          });
          
          // NUOVO: Traccia risposta manuale e aggiorna controlli bot
          await trackManualResponse(conversationId, username, connection);
          
          // NUOVO: Se il bot non era già in pausa, mettilo automaticamente in pausa
          // per evitare conflitti tra risposte manuali e automatiche
          const conversation = await ChatConversation.findOne({ conversationId });
          if (conversation && !conversation.botControl?.isPaused) {
            await ChatConversation.updateOne(
              { conversationId },
              {
                $set: {
                  'botControl.isPaused': true,
                  'botControl.pausedAt': new Date(),
                  'botControl.pausedBy': username,
                  'botControl.pauseReason': 'Auto-pausa per risposta manuale',
                  'botControl.manualTakeoverAt': new Date(),
                  lastActivity: new Date(),
                  updatedAt: new Date()
                }
              }
            );
            
            console.log(`⏸️ [WHATSAPP API] Bot auto-messo in pausa per conversazione ${conversationId} (risposta manuale)`);
          }
          
          console.log(`💾 [WHATSAPP API] Messaggio manuale salvato nel database per conversazione: ${conversationId}`);
        }
      } catch (dbError) {
        console.error('❌ [WHATSAPP API] Errore salvataggio messaggio manuale nel DB:', dbError);
      }
    }

    res.json({
      success: true,
      message: 'Messaggio manuale inviato con successo',
      messageId: response.data.messages?.[0]?.id,
      data: response.data,
      manualResponse: true  // NUOVO: Flag per identificare risposta manuale
    });

  } catch (error) {
    console.error('❌ [WHATSAPP API] Errore invio messaggio manuale:', error);
    
    let errorMessage = 'Errore nell\'invio del messaggio';
    let errorCode = 500;
    
    if (error.response?.data?.error) {
      const apiError = error.response.data.error;
      errorMessage = apiError.message || errorMessage;
      
      if (apiError.code === 131026) {
        errorMessage = 'Numero non registrato su WhatsApp';
        errorCode = 400;
      } else if (apiError.code === 100) {
        errorMessage = 'Token di accesso non valido';
        errorCode = 401;
      }
    }

    res.status(errorCode).json({ 
      success: false, 
      message: errorMessage,
      error: error.response?.data || error.message
    });
  }
});

router.post('/pause-bot/:conversationId', async (req, res) => {
  try {
      const { conversationId } = req.params;
      const { reason } = req.body;
      const username = req.session.user.username;
      
      if (!conversationId) {
          return res.status(400).json({
              success: false,
              message: 'ID conversazione richiesto'
          });
      }

      // Ottieni la connessione utente
      const connection = await getUserConnection(req);
      
      if (!connection) {
          return res.status(503).json({
              success: false,
              message: 'Database non disponibile'
          });
      }

      registerChatModels(connection);
      const ChatConversation = connection.model('ChatConversation');

      // Aggiorna la conversazione
      const updatedConversation = await ChatConversation.findOneAndUpdate(
          { conversationId },
          {
              $set: {
                  'botControl.isPaused': true,
                  'botControl.pausedAt': new Date(),
                  'botControl.pausedBy': username,
                  'botControl.pauseReason': reason || 'Gestione manuale',
                  'botControl.manualTakeoverAt': new Date(),
                  lastActivity: new Date(),
                  updatedAt: new Date()
              }
          },
          { new: true }
      );

      if (!updatedConversation) {
          return res.status(404).json({
              success: false,
              message: 'Conversazione non trovata'
          });
      }

      console.log(`⏸️ [BOT CONTROL] Bot messo in pausa per ${conversationId} da ${username}`);

      res.json({
          success: true,
          message: 'Bot messo in pausa per questa conversazione',
          data: {
              conversationId,
              pausedBy: username,
              pausedAt: new Date(),
              reason: reason || 'Gestione manuale'
          }
      });

  } catch (error) {
      console.error('❌ [BOT CONTROL] Errore pausa bot:', error);
      res.status(500).json({
          success: false,
          message: 'Errore nel mettere in pausa il bot',
          error: error.message
      });
  }
});

// Endpoint per riattivare il bot per una conversazione specifica
router.post('/resume-bot/:conversationId', async (req, res) => {
  try {
      const { conversationId } = req.params;
      const username = req.session.user.username;
      
      if (!conversationId) {
          return res.status(400).json({
              success: false,
              message: 'ID conversazione richiesto'
          });
      }

      // Ottieni la connessione utente
      const connection = await getUserConnection(req);
      
      if (!connection) {
          return res.status(503).json({
              success: false,
              message: 'Database non disponibile'
          });
      }

      registerChatModels(connection);
      const ChatConversation = connection.model('ChatConversation');

      // Aggiorna la conversazione
      const updatedConversation = await ChatConversation.findOneAndUpdate(
          { conversationId },
          {
              $set: {
                  'botControl.isPaused': false,
                  'botControl.resumedAt': new Date(),
                  'botControl.resumedBy': username,
                  lastActivity: new Date(),
                  updatedAt: new Date()
              }
          },
          { new: true }
      );

      if (!updatedConversation) {
          return res.status(404).json({
              success: false,
              message: 'Conversazione non trovata'
          });
      }

      console.log(`▶️ [BOT CONTROL] Bot riattivato per ${conversationId} da ${username}`);

      res.json({
          success: true,
          message: 'Bot riattivato per questa conversazione',
          data: {
              conversationId,
              resumedBy: username,
              resumedAt: new Date()
          }
      });

  } catch (error) {
      console.error('❌ [BOT CONTROL] Errore riattivazione bot:', error);
      res.status(500).json({
          success: false,
          message: 'Errore nel riattivare il bot',
          error: error.message
      });
  }
});

// Endpoint per ottenere lo stato del bot per una conversazione
router.get('/bot-status/:conversationId', async (req, res) => {
  try {
      const { conversationId } = req.params;
      
      // Ottieni la connessione utente
      const connection = await getUserConnection(req);
      
      if (!connection) {
          return res.status(503).json({
              success: false,
              message: 'Database non disponibile'
          });
      }

      registerChatModels(connection);
      const ChatConversation = connection.model('ChatConversation');

      const conversation = await ChatConversation.findOne({ conversationId });

      if (!conversation) {
          return res.status(404).json({
              success: false,
              message: 'Conversazione non trovata'
          });
      }

      res.json({
          success: true,
          data: {
              conversationId,
              botControl: conversation.botControl || {
                  isPaused: false,
                  pausedAt: null,
                  pausedBy: null,
                  resumedAt: null,
                  resumedBy: null
              }
          }
      });

  } catch (error) {
      console.error('❌ [BOT CONTROL] Errore stato bot:', error);
      res.status(500).json({
          success: false,
          message: 'Errore nel recupero dello stato bot',
          error: error.message
      });
  }
});

// AGGIUNGI endpoint per ottenere statistiche controllo bot
router.get('/bot-control-stats', async (req, res) => {
    try {
        // Ottieni la connessione utente
        const connection = await getUserConnection(req);
        
        if (!connection) {
            return res.status(503).json({
                success: false,
                message: 'Database non disponibile'
            });
        }

        registerChatModels(connection);
        const ChatConversation = connection.model('ChatConversation');

        // Statistiche aggregate
        const stats = await ChatConversation.aggregate([
            {
                $group: {
                    _id: null,
                    totalConversations: { $sum: 1 },
                    pausedConversations: {
                        $sum: { $cond: [{ $eq: ['$botControl.isPaused', true] }, 1, 0] }
                    },
                    manualTakeovers: {
                        $sum: { $cond: [{ $gt: ['$botControl.manualResponsesCount', 0] }, 1, 0] }
                    },
                    totalManualResponses: { $sum: '$botControl.manualResponsesCount' },
                    avgManualResponses: { $avg: '$botControl.manualResponsesCount' }
                }
            }
        ]);

        // Lista conversazioni in pausa
        const pausedConversations = await ChatConversation.find({
            'botControl.isPaused': true,
            status: 'active'
        }).select('conversationId cliente.nome cliente.telefono botControl').limit(10);

        const result = stats[0] || {
            totalConversations: 0,
            pausedConversations: 0,
            manualTakeovers: 0,
            totalManualResponses: 0,
            avgManualResponses: 0
        };

        res.json({
            success: true,
            data: {
                ...result,
                pausedConversations: pausedConversations.map(conv => ({
                    conversationId: conv.conversationId,
                    clientName: conv.cliente?.nome || 'Sconosciuto',
                    phone: conv.cliente?.telefono,
                    pausedBy: conv.botControl?.pausedBy,
                    pausedAt: conv.botControl?.pausedAt,
                    reason: conv.botControl?.pauseReason
                }))
            }
        });

    } catch (error) {
        console.error('❌ [BOT CONTROL] Errore statistiche controllo bot:', error);
        res.status(500).json({
            success: false,
            message: 'Errore nel recupero delle statistiche',
            error: error.message
        });
    }
});

module.exports = router;