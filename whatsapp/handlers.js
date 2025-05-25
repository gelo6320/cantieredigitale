// ============================================
// 📁 whatsapp/handlers.js - HANDLERS OTTIMIZZATI PER AI
// ============================================
const axios = require('axios');
const config = require('./config');

class WhatsAppService {
    constructor() {
        this.phoneNumberId = config.whatsapp.phoneNumberId;
        this.accessToken = config.whatsapp.accessToken;
        this.baseURL = `https://graph.facebook.com/v22.0/${this.phoneNumberId}/messages`;
        this.validateConfig();
        
        // Statistiche per monitoring
        this.messageStats = {
            sent: 0,
            failed: 0,
            received: 0,
            avgResponseTime: 0
        };
    }

    validateConfig() {
        console.log('🔧 [WHATSAPP] Verifica configurazione...');
        
        if (!this.phoneNumberId || !this.accessToken) {
            console.error('❌ [WHATSAPP] ERRORE: Configurazione mancante');
            console.error('❌ [WHATSAPP] Verifica WHATSAPP_PHONE_NUMBER_ID e WHATSAPP_ACCESS_TOKEN');
            return false;
        }

        console.log('✅ [WHATSAPP] Configurazione OK');
        console.log(`📱 [WHATSAPP] Phone Number ID: ${this.phoneNumberId.substring(0, 8)}...`);
        return true;
    }

    async sendMessage(to, message) {
        const startTime = Date.now();
        
        try {
            console.log(`📤 [WHATSAPP] Invio messaggio a: ${to}`);
            
            if (!this.validateConfig()) {
                this.messageStats.failed++;
                return false;
            }

            if (!message || message.trim().length === 0) {
                console.error('❌ [WHATSAPP] Messaggio vuoto non inviato');
                this.messageStats.failed++;
                return false;
            }

            // Sanitize message per WhatsApp
            const sanitizedMessage = this.sanitizeMessage(message);

            const payload = {
                messaging_product: 'whatsapp',
                to: to,
                text: { body: sanitizedMessage }
            };

            console.log(`📝 [WHATSAPP] Contenuto: "${sanitizedMessage.substring(0, 100)}${sanitizedMessage.length > 100 ? '...' : ''}"`);

            const response = await axios.post(this.baseURL, payload, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000 // Increased timeout for AI responses
            });

            const responseTime = Date.now() - startTime;
            this.messageStats.sent++;
            this.updateAvgResponseTime(responseTime);

            console.log(`✅ [WHATSAPP] Messaggio inviato in ${responseTime}ms`);
            
            if (response.data.messages?.[0]?.id) {
                console.log(`📊 [WHATSAPP] Message ID: ${response.data.messages[0].id}`);
            }

            return true;

        } catch (error) {
            const responseTime = Date.now() - startTime;
            this.messageStats.failed++;
            
            console.error(`❌ [WHATSAPP] Errore invio (${responseTime}ms):`, error.message);
            
            if (error.response?.data?.error) {
                const errorData = error.response.data.error;
                console.error(`📊 [WHATSAPP] Codice errore WhatsApp: ${errorData.code}`);
                console.error(`📊 [WHATSAPP] Dettaglio errore: ${errorData.message}`);
                
                // Log errori comuni per debugging
                if (errorData.code === 131026) {
                    console.error('💡 [WHATSAPP] Suggerimento: Verifica che il numero sia registrato su WhatsApp');
                } else if (errorData.code === 100) {
                    console.error('💡 [WHATSAPP] Suggerimento: Verifica ACCESS_TOKEN');
                }
            }
            
            if (error.code === 'ENOTFOUND') {
                console.error('💡 [WHATSAPP] Suggerimento: Verifica connessione internet');
            }
            
            return false;
        }
    }

    sanitizeMessage(message) {
        // Rimuove caratteri che potrebbero causare problemi su WhatsApp
        return message
            .replace(/[\u2000-\u200F\u2028-\u202F]/g, ' ') // Rimuove spazi Unicode problematici
            .replace(/\s+/g, ' ') // Normalizza spazi multipli
            .trim()
            .substring(0, 4096); // Limite lunghezza messaggio WhatsApp
    }

    updateAvgResponseTime(responseTime) {
        if (this.messageStats.sent === 1) {
            this.messageStats.avgResponseTime = responseTime;
        } else {
            this.messageStats.avgResponseTime = 
                (this.messageStats.avgResponseTime * (this.messageStats.sent - 1) + responseTime) / this.messageStats.sent;
        }
    }

    extractMessageData(body) {
        try {
            console.log('📥 [WHATSAPP] Analisi webhook...');
            
            // Debug: log della struttura webhook (solo in development)
            if (config.server.environment === 'development') {
                console.log('🔍 [WHATSAPP] Webhook body:', JSON.stringify(body, null, 2));
            }
            
            const entry = body.entry?.[0];
            if (!entry) {
                console.log('⚠️ [WHATSAPP] Nessun entry nel webhook');
                return null;
            }

            const changes = entry.changes?.[0];
            if (!changes || changes.field !== 'messages') {
                console.log(`⚠️ [WHATSAPP] Change field non è 'messages': ${changes?.field}`);
                return null;
            }

            const webhookValue = changes.value;
            
            // Gestisci webhook di status delivery
            if (webhookValue.statuses) {
                const status = webhookValue.statuses[0];
                console.log(`📋 [WHATSAPP] Status update: ${status.status} per messaggio ${status.id}`);
                return null;
            }

            const message = webhookValue.messages?.[0];
            if (!message) {
                console.log('⚠️ [WHATSAPP] Nessun messaggio nel webhook');
                return null;
            }

            // Ignora messaggi dal nostro bot
            if (message.from === this.phoneNumberId) {
                console.log('🤖 [WHATSAPP] Messaggio dal bot ignorato');
                return null;
            }

            // Estrai testo in base al tipo di messaggio
            let messageText = '';
            let messageType = message.type;

            switch (message.type) {
                case 'text':
                    messageText = message.text?.body || '';
                    break;
                    
                case 'button':
                    messageText = message.button?.text || '';
                    console.log(`🔘 [WHATSAPP] Bottone premuto: ${messageText}`);
                    break;
                    
                case 'interactive':
                    if (message.interactive?.type === 'button_reply') {
                        messageText = message.interactive.button_reply.title || '';
                        console.log(`🔗 [WHATSAPP] Risposta interattiva: ${messageText}`);
                    } else if (message.interactive?.type === 'list_reply') {
                        messageText = message.interactive.list_reply.title || '';
                        console.log(`📋 [WHATSAPP] Lista selezionata: ${messageText}`);
                    }
                    break;
                    
                case 'image':
                    messageText = message.image?.caption || 'Immagine ricevuta';
                    console.log(`🖼️ [WHATSAPP] Immagine ricevuta con caption: ${messageText}`);
                    break;
                    
                case 'document':
                    messageText = message.document?.caption || 'Documento ricevuto';
                    console.log(`📄 [WHATSAPP] Documento ricevuto: ${message.document?.filename || 'senza nome'}`);
                    break;
                    
                default:
                    console.log(`❓ [WHATSAPP] Tipo messaggio non supportato: ${message.type}`);
                    messageText = `Hai inviato un ${message.type}. Puoi scrivermi un messaggio di testo? 😊`;
                    messageType = 'unsupported';
                    break;
            }

            // Ottieni informazioni del contatto
            const contact = webhookValue.contacts?.[0];
            const contactName = contact?.profile?.name || 'Utente';
            const contactWaId = contact?.wa_id || message.from;

            const messageData = {
                from: message.from,
                text: messageText,
                type: messageType,
                originalType: message.type,
                timestamp: message.timestamp,
                messageId: message.id,
                contactName: contactName,
                contactWaId: contactWaId
            };

            // Valida dati essenziali
            if (!messageData.from || !messageData.text) {
                console.log('⚠️ [WHATSAPP] Dati messaggio incompleti');
                return null;
            }

            this.messageStats.received++;

            console.log('✅ [WHATSAPP] Nuovo messaggio processato:');
            console.log(`   📱 Da: ${messageData.from} (${contactName})`);
            console.log(`   📝 Testo: "${messageData.text}"`);
            console.log(`   🏷️ Tipo: ${messageData.type}`);
            console.log(`   🆔 ID: ${messageData.messageId}`);
            
            return messageData;

        } catch (error) {
            console.error('❌ [WHATSAPP] Errore parsing webhook:', error.message);
            console.error('❌ [WHATSAPP] Stack:', error.stack);
            return null;
        }
    }

    isValidWebhook(req) {
        try {
            const mode = req.query['hub.mode'];
            const token = req.query['hub.verify_token'];
            const challenge = req.query['hub.challenge'];
            
            console.log(`🔍 [WHATSAPP] Verifica webhook:`);
            console.log(`   Mode: ${mode}`);
            console.log(`   Token ricevuto: ${token ? token.substring(0, 8) + '...' : 'MANCANTE'}`);
            console.log(`   Token configurato: ${config.whatsapp.webhookToken ? config.whatsapp.webhookToken.substring(0, 8) + '...' : 'MANCANTE'}`);
            
            const isValid = mode === 'subscribe' && token === config.whatsapp.webhookToken;
            
            console.log(`${isValid ? '✅' : '❌'} [WHATSAPP] Webhook ${isValid ? 'valido' : 'non valido'}`);
            
            if (!isValid && mode === 'subscribe') {
                console.error('💡 [WHATSAPP] Suggerimento: Verifica WHATSAPP_WEBHOOK_TOKEN nel .env');
            }
            
            return isValid;

        } catch (error) {
            console.error('❌ [WHATSAPP] Errore verifica webhook:', error.message);
            return false;
        }
    }

    async testConnection() {
        try {
            console.log('🧪 [WHATSAPP] Test connessione API...');
            
            if (!this.validateConfig()) {
                return { 
                    success: false, 
                    message: 'Configurazione non valida - verifica .env'
                };
            }

            const response = await axios.get(
                `https://graph.facebook.com/v22.0/${this.phoneNumberId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`
                    },
                    timeout: 10000
                }
            );

            console.log('✅ [WHATSAPP] Test connessione riuscito');
            console.log(`📱 [WHATSAPP] Numero WhatsApp: ${response.data.display_phone_number}`);
            console.log(`🏷️ [WHATSAPP] Nome account: ${response.data.name || 'N/A'}`);

            return { 
                success: true, 
                message: 'WhatsApp Business API connessa',
                phone_number: response.data.display_phone_number,
                account_name: response.data.name
            };

        } catch (error) {
            console.error('❌ [WHATSAPP] Test connessione fallito:', error.message);
            
            let errorMessage = 'Connessione WhatsApp fallita';
            let suggestion = '';

            if (error.response?.data?.error) {
                const apiError = error.response.data.error;
                errorMessage = apiError.message;
                
                if (apiError.code === 100) {
                    suggestion = 'Verifica WHATSAPP_ACCESS_TOKEN';
                } else if (apiError.code === 190) {
                    suggestion = 'Token scaduto o non valido';
                }
            } else if (error.code === 'ENOTFOUND') {
                suggestion = 'Verifica connessione internet';
            }

            if (suggestion) {
                console.error(`💡 [WHATSAPP] Suggerimento: ${suggestion}`);
            }

            return { 
                success: false, 
                message: errorMessage,
                suggestion: suggestion
            };
        }
    }

    getStats() {
        return {
            messagesSent: this.messageStats.sent,
            messagesFailed: this.messageStats.failed,
            messagesReceived: this.messageStats.received,
            successRate: this.messageStats.sent + this.messageStats.failed > 0 
                ? Math.round((this.messageStats.sent / (this.messageStats.sent + this.messageStats.failed)) * 100)
                : 0,
            avgResponseTimeMs: Math.round(this.messageStats.avgResponseTime)
        };
    }

    resetStats() {
        this.messageStats = {
            sent: 0,
            failed: 0,
            received: 0,
            avgResponseTime: 0
        };
        console.log('🔄 [WHATSAPP] Statistiche messaggi resettate');
    }
}

module.exports = WhatsAppService;