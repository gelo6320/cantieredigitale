const express = require('express');
const axios = require('axios');
const { getUserConnection, getUserConfig } = require('../utils');
const { sendFacebookConversionEvent } = require('../services');
const { ClientSchema } = require('../models');

const router = express.Router();

// API per spostare un lead da uno stato a un altro nel funnel (versione aggiornata)
router.post('/move', async (req, res) => {
  try {
    const { 
      leadId, 
      leadType, 
      fromStage, 
      toStage, 
      sendToFacebook, 
      facebookData, 
      originalFromStage, 
      originalToStage,
      createClient,
      consentError
    } = req.body;
    
    if (!leadId || !fromStage || !toStage) {
      return res.status(400).json({ 
        success: false, 
        message: 'Lead ID, status originale e status destinazione sono richiesti' 
      });
    }
    
    // Ottieni la connessione dell'utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Usa il modello Lead
    const Lead = connection.model('Lead');
    
    // IMPORTANTE: Cerca utilizzando il campo leadId invece di _id
    const lead = await Lead.findOne({ leadId: leadId });
    
    if (!lead) {
      return res.status(404).json({ 
        success: false, 
        message: 'Lead non trovato' 
      });
    }
    
    // Aggiorna lo stato
    lead.status = toStage;
    lead.updatedAt = new Date();
    
    await lead.save();
    
    // Risultati dell'invio a Facebook
    let facebookResult = null;
    let clientResult = null;
    
    // Se è richiesta la creazione di un cliente (lead convertito in customer)
    if (createClient && toStage === 'converted') {
      try {
        // Verifica se esiste già un Client model nel connection
        if (!connection.models['Client']) {
          connection.model('Client', ClientSchema);
        }
        
        // Ottieni il modello Client
        const Client = connection.model('Client');
        
        // Verifica se esiste già un cliente con questo leadId
        const existingClient = await Client.findOne({ leadId: leadId });
        
        // Variabile per mantenere il riferimento al cliente per aggiornare i dati CAPI in seguito
        let client = null;
        
        if (!existingClient) {
          // Prepara i dati del cliente basandosi sul lead
          const clientData = {
            leadId: lead.leadId,
            clientId: 'CL-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            firstName: lead.firstName || '',
            lastName: lead.lastName || '',
            email: lead.email,
            phone: lead.phone || '',
            fullName: [lead.firstName || '', lead.lastName || ''].filter(Boolean).join(' ') || lead.name || lead.email.split('@')[0],
            value: lead.value || 0,
            service: lead.service || '',
            leadSource: lead.source || lead.medium || '',
            campaign: lead.campaign || '',
            medium: lead.medium || '',
            location: lead.location || {},
            convertedAt: new Date(),
            consent: lead.consent || {
              marketing: false,
              analytics: false,
              thirdParty: false
            },
            extendedData: lead.extendedData || {},
            // Inizializza il campo facebookCapi
            facebookCapi: {
              sent: false,
              timestamp: null,
              success: null,
              eventId: null,
              payload: null,
              response: null,
              error: null
            }
          };
          
          // Crea il nuovo cliente
          const newClient = new Client(clientData);
          await newClient.save();
          
          clientResult = {
            success: true,
            clientId: newClient.clientId,
            message: 'Cliente creato con successo'
          };
          
          client = newClient;
        } else {
          // Aggiorna il cliente esistente
          existingClient.updatedAt = new Date();
          existingClient.value = lead.value || existingClient.value;
          existingClient.service = lead.service || existingClient.service;
          existingClient.status = 'active';
          
          // Assicurati che il campo facebookCapi esista
          if (!existingClient.facebookCapi) {
            existingClient.facebookCapi = {
              sent: false,
              timestamp: null,
              success: null,
              eventId: null,
              payload: null,
              response: null,
              error: null
            };
          }
          
          await existingClient.save();
          
          clientResult = {
            success: true,
            clientId: existingClient.clientId,
            message: 'Cliente esistente aggiornato'
          };
          
          client = existingClient;
        }
        
        // Salvare l'ID del cliente per poterlo aggiornare con i risultati CAPI dopo
        // l'invio a Facebook
        if (client) {
          clientResult.client = client;
        }
      } catch (clientError) {
        console.error('Errore nella creazione/aggiornamento del cliente:', clientError);
        clientResult = {
          success: false,
          error: clientError.message,
          message: 'Errore nella gestione del cliente'
        };
      }
    }
    
    if (sendToFacebook && facebookData) {
      try {
        // Recupera le configurazioni Facebook dell'utente
        const accessToken = req.session?.userConfig?.access_token || process.env.FACEBOOK_ACCESS_TOKEN || process.env.ACCESS_TOKEN;
        const metaPixelId = req.session?.userConfig?.meta_pixel_id || process.env.FACEBOOK_PIXEL_ID || '1543790469631614';
        
        if (!accessToken) {
          throw new Error('Facebook Access Token non configurato');
        }
        
        // Timestamp dell'invio
        const sendTimestamp = new Date();
        
        // Prepara il payload per la CAPI
        const payload = {
          data: [{
            event_name: facebookData.eventName,
            event_time: Math.floor(Date.now() / 1000),
            event_id: facebookData.eventId,
            action_source: "system_generated",
            user_data: facebookData.userData,
            custom_data: facebookData.customData,
            event_source_url: facebookData.eventSourceUrl || `https://${req.get('host')}`,
          }],
          access_token: accessToken,
          partner_agent: 'costruzionedigitale-nodejs-crm'
        };
        
        // Aggiungi parametri specifici per eventi di acquisto
        if (facebookData.eventName === 'Purchase') {
          payload.data[0].custom_data = {
            ...payload.data[0].custom_data,
            value: facebookData.value || 0,
            currency: facebookData.currency || 'EUR',
            content_type: facebookData.contentType || 'product',
            content_name: facebookData.customData.content_name || 'Servizio'
          };
        }
        
        // IP address e user agent se disponibili
        if (facebookData.ipAddress) {
          payload.data[0].user_data.client_ip_address = facebookData.ipAddress;
        }
        
        if (facebookData.userAgent) {
          payload.data[0].user_data.client_user_agent = facebookData.userAgent;
        }
        
        // Aggiungi FBC se disponibile
        if (facebookData.fbc) {
          payload.data[0].user_data.fbc = facebookData.fbc;
        }
        
        // Invia l'evento alla Facebook CAPI
        const response = await axios.post(
          `https://graph.facebook.com/v22.0/${metaPixelId}/events`,
          payload
        );
        
        // Salva l'evento nel database
        if (connection.models['FacebookEvent']) {
          const FacebookEvent = connection.models['FacebookEvent'];
          
          await FacebookEvent.create({
            leadId: lead._id,
            leadType: leadType,
            eventName: facebookData.eventName,
            eventTime: new Date(),
            userData: facebookData.userData,
            customData: facebookData.customData,
            eventId: facebookData.eventId,
            success: true,
            response: response.data
          });
        }
        
        // Prepara l'oggetto risultato
        facebookResult = {
          success: true,
          eventId: facebookData.eventId,
          response: response.data
        };
        
        // NUOVO: Aggiorna il cliente con i dati CAPI se disponibile
        if (clientResult && clientResult.client) {
          try {
            const client = clientResult.client;
            
            // Aggiorna il record del cliente con i dati di successo
            client.facebookCapi = {
              sent: true,
              timestamp: sendTimestamp,
              success: true,
              eventId: facebookData.eventId,
              payload: payload,
              response: response.data
            };
            
            await client.save();
            console.log(`Record cliente ${client.clientId} aggiornato con dati CAPI`);
          } catch (clientUpdateError) {
            console.error('Errore nell\'aggiornamento dei dati CAPI del cliente:', clientUpdateError);
          }
        }
      } catch (fbError) {
        console.error(`Errore nell'invio dell'evento ${facebookData.eventName}:`, fbError);
        
        // Timestamp dell'errore
        const errorTimestamp = new Date();
        
        // Registra comunque l'errore nel database
        if (connection.models['FacebookEvent']) {
          const FacebookEvent = connection.models['FacebookEvent'];
          
          await FacebookEvent.create({
            leadId: lead._id,
            leadType: leadType,
            eventName: facebookData?.eventName || 'unknown',
            eventTime: new Date(),
            userData: facebookData?.userData || {},
            customData: facebookData?.customData || {},
            eventId: facebookData?.eventId || `error_${Date.now()}`,
            success: false,
            error: fbError.message || 'Errore sconosciuto',
            details: fbError.response ? fbError.response.data : null
          });
        }
        
        // Prepara l'oggetto risultato di errore
        facebookResult = {
          success: false,
          error: fbError.message || 'Errore sconosciuto',
          details: fbError.response ? fbError.response.data : null
        };
        
        // NUOVO: Aggiorna il cliente con i dati di errore CAPI se disponibile
        if (clientResult && clientResult.client) {
          try {
            const client = clientResult.client;
            
            // Aggiorna il record del cliente con i dati dell'errore
            client.facebookCapi = {
              sent: true,
              timestamp: errorTimestamp,
              success: false,
              eventId: facebookData?.eventId || `error_${Date.now()}`,
              payload: facebookData ? {
                eventName: facebookData.eventName,
                userData: facebookData.userData,
                customData: facebookData.customData
              } : null,
              error: {
                message: fbError.message,
                stack: fbError.stack,
                details: fbError.response ? fbError.response.data : null
              }
            };
            
            await client.save();
            console.log(`Record cliente ${client.clientId} aggiornato con dati errore CAPI`);
          } catch (clientUpdateError) {
            console.error('Errore nell\'aggiornamento dei dati errore CAPI del cliente:', clientUpdateError);
          }
        }
      }
    }
    
    res.json({
      success: true,
      message: 'Lead spostato con successo',
      data: { 
        leadId, 
        status: toStage, 
        originalStatus: originalToStage || toStage 
      },
      facebookResult,
      clientResult
    });
  } catch (error) {
    console.error('Errore nello spostamento del lead:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nello spostamento del lead', 
      error: error.message 
    });
  }
});

module.exports = router;