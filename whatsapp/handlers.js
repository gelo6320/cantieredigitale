// ============================================
// 📁 whatsapp/handlers.js - HANDLERS SEMPLIFICATI
// ============================================
const axios = require('axios');
const config = require('./config');

class WhatsAppService {
    constructor() {
        this.phoneNumberId = config.whatsapp.phoneNumberId;
        this.accessToken = config.whatsapp.accessToken;
        this.baseURL = `https://graph.facebook.com/v22.0/${this.phoneNumberId}/messages`;
        this.validateConfig();
    }

    validateConfig() {
        console.log('🔧 [WHATSAPP] Verifica configurazione...');
        
        if (!this.phoneNumberId || !this.accessToken) {
            console.error('❌ [WHATSAPP] ERRORE: Configurazione mancante');
            return false;
        }

        console.log('✅ [WHATSAPP] Configurazione OK');
        return true;
    }

    async sendMessage(to, message) {
        try {
            console.log(`📤 [WHATSAPP] Invio a: ${to}`);
            
            if (!this.validateConfig()) {
                return false;
            }

            if (!message || message.trim().length === 0) {
                console.error('❌ [WHATSAPP] Messaggio vuoto');
                return false;
            }

            const payload = {
                messaging_product: 'whatsapp',
                to: to,
                text: { body: message }
            };

            const response = await axios.post(this.baseURL, payload, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });

            console.log(`✅ [WHATSAPP] Messaggio inviato con successo`);
            return true;

        } catch (error) {
            console.error('❌ [WHATSAPP] Errore invio:', error.message);
            
            if (error.response?.data?.error) {
                const errorData = error.response.data.error;
                console.error(`📊 [WHATSAPP] Codice errore: ${errorData.code}`);
                console.error(`📊 [WHATSAPP] Dettaglio: ${errorData.message}`);
            }
            
            return false;
        }
    }

    extractMessageData(body) {
        try {
            console.log('📥 [WHATSAPP] Analisi webhook...');
            
            const entry = body.entry?.[0];
            if (!entry) return null;

            const changes = entry.changes?.[0];
            if (!changes || changes.field !== 'messages') return null;

            const webhookValue = changes.value;
            
            // Ignora webhook di status
            if (webhookValue.statuses) {
                console.log('📋 [WHATSAPP] Webhook di stato ignorato');
                return null;
            }

            const message = webhookValue.messages?.[0];
            if (!message) return null;

            // Ignora messaggi dal nostro bot
            if (message.from === this.phoneNumberId) {
                return null;
            }

            let messageText = '';
            switch (message.type) {
                case 'text':
                    messageText = message.text?.body || '';
                    break;
                case 'button':
                    messageText = message.button?.text || '';
                    break;
                case 'interactive':
                    if (message.interactive?.type === 'button_reply') {
                        messageText = message.interactive.button_reply.title || '';
                    }
                    break;
                default:
                    console.log(`📱 [WHATSAPP] Tipo messaggio non supportato: ${message.type}`);
                    return null;
            }

            const contact = webhookValue.contacts?.[0];
            const contactName = contact?.profile?.name || 'Utente';

            const messageData = {
                from: message.from,
                text: messageText,
                type: message.type,
                timestamp: message.timestamp,
                messageId: message.id,
                contactName: contactName
            };

            if (!messageData.from || !messageData.text) {
                return null;
            }

            console.log('✅ [WHATSAPP] Nuovo messaggio:');
            console.log(`   📱 Da: ${messageData.from} (${contactName})`);
            console.log(`   📝 Testo: "${messageData.text}"`);
            
            return messageData;

        } catch (error) {
            console.error('❌ [WHATSAPP] Errore parsing webhook:', error.message);
            return null;
        }
    }

    isValidWebhook(req) {
        try {
            const mode = req.query['hub.mode'];
            const token = req.query['hub.verify_token'];
            const challenge = req.query['hub.challenge'];
            
            console.log(`🔍 [WHATSAPP] Verifica webhook: ${mode} | ${token}`);
            
            const isValid = mode === 'subscribe' && token === config.whatsapp.webhookToken;
            
            console.log(`${isValid ? '✅' : '❌'} [WHATSAPP] Webhook ${isValid ? 'valido' : 'non valido'}`);
            
            return isValid;

        } catch (error) {
            console.error('❌ [WHATSAPP] Errore verifica webhook:', error.message);
            return false;
        }
    }

    async testConnection() {
        try {
            console.log('🧪 [WHATSAPP] Test connessione...');
            
            if (!this.validateConfig()) {
                return { 
                    success: false, 
                    message: 'Configurazione non valida'
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

            console.log('✅ [WHATSAPP] Test riuscito');
            console.log(`📱 [WHATSAPP] Numero: ${response.data.display_phone_number}`);

            return { 
                success: true, 
                message: 'Connessione WhatsApp OK',
                phone_number: response.data.display_phone_number
            };

        } catch (error) {
            console.error('❌ [WHATSAPP] Test fallito:', error.message);
            
            let errorMessage = 'Connessione WhatsApp fallita';
            if (error.response?.data?.error) {
                errorMessage = error.response.data.error.message;
            }

            return { 
                success: false, 
                message: errorMessage
            };
        }
    }
}

module.exports = WhatsAppService;