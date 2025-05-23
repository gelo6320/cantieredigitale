// ============================================
// 📁 whatsapp/handlers.js - VERSIONE CORRETTA
// ============================================
const axios = require('axios');
const config = require('./config');

class WhatsAppService {
    constructor() {
        this.phoneNumberId = config.whatsapp.phoneNumberId;
        this.accessToken = config.whatsapp.accessToken;
        this.baseURL = `https://graph.facebook.com/v22.0/${this.phoneNumberId}/messages`;
        this.apiVersion = 'v22.0';
        
        // Verifica configurazione
        this.validateConfig();
    }

    validateConfig() {
        console.log('🔧 [WHATSAPP SERVICE] Verifica configurazione...');
        
        if (!this.phoneNumberId) {
            console.error('❌ [WHATSAPP SERVICE] ERRORE: WHATSAPP_PHONE_NUMBER_ID non configurato');
            return false;
        }

        if (!this.accessToken) {
            console.error('❌ [WHATSAPP SERVICE] ERRORE: WHATSAPP_ACCESS_TOKEN non configurato');
            return false;
        }

        if (!this.accessToken.startsWith('EAA')) {
            console.error('❌ [WHATSAPP SERVICE] ERRORE: WHATSAPP_ACCESS_TOKEN formato non valido');
            console.error('💡 Il token dovrebbe iniziare con EAA');
            return false;
        }

        console.log('✅ [WHATSAPP SERVICE] Configurazione valida');
        console.log(`   📱 Phone Number ID: ${this.phoneNumberId}`);
        console.log(`   🔑 Access Token: ${this.accessToken.substring(0, 15)}...`);
        console.log(`   🌐 Base URL: ${this.baseURL}`);
        
        return true;
    }

    async sendMessage(to, message) {
        try {
            console.log(`📤 [WHATSAPP SERVICE] Invio messaggio a: ${to}`);
            console.log(`📝 [WHATSAPP SERVICE] Contenuto: "${message}"`);
            
            // Verifica configurazione prima di procedere
            if (!this.validateConfig()) {
                console.error('❌ [WHATSAPP SERVICE] Configurazione non valida - annullo invio');
                return false;
            }

            // Prepara il payload
            const payload = {
                messaging_product: 'whatsapp',
                to: to,
                text: { body: message }
            };

            console.log(`📊 [WHATSAPP SERVICE] Payload preparato:`, JSON.stringify(payload, null, 2));

            // Effettua la richiesta
            const response = await axios.post(this.baseURL, payload, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });

            console.log(`✅ [WHATSAPP SERVICE] Messaggio inviato con successo`);
            console.log(`📊 [WHATSAPP SERVICE] Response status: ${response.status}`);
            console.log(`📊 [WHATSAPP SERVICE] Message ID: ${response.data.messages?.[0]?.id || 'N/A'}`);
            
            return true;

        } catch (error) {
            console.error('❌ [WHATSAPP SERVICE] Errore invio messaggio:', error.message);
            
            // Log dettagliato degli errori
            if (error.response) {
                console.error('📊 [WHATSAPP SERVICE] Status:', error.response.status);
                console.error('📊 [WHATSAPP SERVICE] Status Text:', error.response.statusText);
                console.error('📊 [WHATSAPP SERVICE] Error Data:', JSON.stringify(error.response.data, null, 2));
                
                // Gestione errori specifici WhatsApp
                const errorData = error.response.data?.error;
                if (errorData) {
                    switch (errorData.code) {
                        case 190:
                            console.error('🔑 [WHATSAPP SERVICE] Token di accesso non valido o scaduto');
                            console.error('💡 Genera un nuovo token su Facebook Developers');
                            break;
                        case 100:
                            console.error('📝 [WHATSAPP SERVICE] Parametri richiesta non validi');
                            break;
                        case 80007:
                            console.error('📱 [WHATSAPP SERVICE] Numero WhatsApp non valido');
                            break;
                        case 131026:
                            console.error('⏱️ [WHATSAPP SERVICE] Rate limit raggiunto');
                            break;
                        default:
                            console.error(`🔍 [WHATSAPP SERVICE] Errore sconosciuto - Codice: ${errorData.code}`);
                    }
                }
            } else if (error.code === 'ECONNABORTED') {
                console.error('⏰ [WHATSAPP SERVICE] Timeout richiesta');
            } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
                console.error('🌐 [WHATSAPP SERVICE] Errore di connessione di rete');
            } else {
                console.error('🔍 [WHATSAPP SERVICE] Errore generico:', error.code || 'UNKNOWN');
            }
            
            return false;
        }
    }

    async sendInteractiveMessage(to, text, buttons) {
        try {
            console.log(`📤 [WHATSAPP SERVICE] Invio messaggio interattivo a: ${to}`);
            
            if (!this.validateConfig()) {
                console.error('❌ [WHATSAPP SERVICE] Configurazione non valida - annullo invio interattivo');
                return false;
            }

            const payload = {
                messaging_product: 'whatsapp',
                to: to,
                type: 'interactive',
                interactive: {
                    type: 'button',
                    body: { text: text },
                    action: {
                        buttons: buttons.map((btn, index) => ({
                            type: 'reply',
                            reply: {
                                id: `btn_${index}`,
                                title: btn.substring(0, 20) // WhatsApp limita a 20 caratteri
                            }
                        }))
                    }
                }
            };

            console.log(`📊 [WHATSAPP SERVICE] Payload interattivo:`, JSON.stringify(payload, null, 2));

            const response = await axios.post(this.baseURL, payload, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });

            console.log(`✅ [WHATSAPP SERVICE] Messaggio interattivo inviato con successo`);
            console.log(`📊 [WHATSAPP SERVICE] Message ID: ${response.data.messages?.[0]?.id || 'N/A'}`);
            
            return true;

        } catch (error) {
            console.error('❌ [WHATSAPP SERVICE] Errore messaggio interattivo:', error.response?.data || error.message);
            return false;
        }
    }

    extractMessageData(body) {
        try {
            console.log('📥 [WHATSAPP SERVICE] Estrazione dati messaggio...');
            console.log('📊 [WHATSAPP SERVICE] Webhook body:', JSON.stringify(body, null, 2));
            
            const entry = body.entry?.[0];
            if (!entry) {
                console.log('❌ [WHATSAPP SERVICE] Nessun entry trovato nel webhook');
                return null;
            }

            const changes = entry.changes?.[0];
            if (!changes) {
                console.log('❌ [WHATSAPP SERVICE] Nessun change trovato nel webhook');
                return null;
            }
            
            if (changes.field !== 'messages') {
                console.log(`ℹ️ [WHATSAPP SERVICE] Webhook field non è 'messages': ${changes.field}`);
                return null;
            }

            const message = changes.value?.messages?.[0];
            if (!message) {
                console.log('❌ [WHATSAPP SERVICE] Nessun messaggio trovato nel webhook');
                return null;
            }

            // Estrai contatto se disponibile
            const contact = changes.value?.contacts?.[0];
            const contactName = contact?.profile?.name || 'Utente sconosciuto';

            const messageData = {
                from: message.from,
                text: message.text?.body || '',
                type: message.type,
                timestamp: message.timestamp,
                messageId: message.id,
                contactName: contactName
            };

            console.log('✅ [WHATSAPP SERVICE] Dati messaggio estratti:');
            console.log(`   📱 Da: ${messageData.from} (${contactName})`);
            console.log(`   📝 Testo: "${messageData.text}"`);
            console.log(`   🕐 Timestamp: ${messageData.timestamp}`);
            console.log(`   🆔 Message ID: ${messageData.messageId}`);
            
            return messageData;

        } catch (error) {
            console.error('❌ [WHATSAPP SERVICE] Errore parsing messaggio:', error.message);
            console.error('📊 [WHATSAPP SERVICE] Body ricevuto:', JSON.stringify(body, null, 2));
            return null;
        }
    }

    isValidWebhook(req) {
        try {
            console.log('🔍 [WHATSAPP SERVICE] Verifica webhook...');
            
            const mode = req.query['hub.mode'];
            const token = req.query['hub.verify_token'];
            const challenge = req.query['hub.challenge'];
            
            console.log(`📊 [WHATSAPP SERVICE] Webhook params:`);
            console.log(`   Mode: ${mode}`);
            console.log(`   Token ricevuto: ${token}`);
            console.log(`   Token atteso: ${config.whatsapp.webhookToken}`);
            console.log(`   Challenge: ${challenge}`);
            
            const isValid = mode === 'subscribe' && token === config.whatsapp.webhookToken;
            
            console.log(`${isValid ? '✅' : '❌'} [WHATSAPP SERVICE] Webhook ${isValid ? 'valido' : 'non valido'}`);
            
            return isValid;

        } catch (error) {
            console.error('❌ [WHATSAPP SERVICE] Errore verifica webhook:', error.message);
            return false;
        }
    }

    // Metodo per testare la connessione WhatsApp
    async testConnection() {
        try {
            console.log('🧪 [WHATSAPP SERVICE] Test connessione API...');
            
            if (!this.validateConfig()) {
                return { 
                    success: false, 
                    message: 'Configurazione non valida',
                    details: 'Verifica WHATSAPP_ACCESS_TOKEN e WHATSAPP_PHONE_NUMBER_ID' 
                };
            }

            // Test con richiesta di informazioni sul numero
            const response = await axios.get(
                `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`
                    },
                    timeout: 10000
                }
            );

            console.log('✅ [WHATSAPP SERVICE] Test connessione riuscito');
            console.log(`📱 [WHATSAPP SERVICE] Numero verificato: ${response.data.display_phone_number}`);
            console.log(`🏢 [WHATSAPP SERVICE] Nome business: ${response.data.verified_name}`);

            return { 
                success: true, 
                message: 'Connessione WhatsApp API funzionante',
                data: {
                    phone_number: response.data.display_phone_number,
                    verified_name: response.data.verified_name,
                    quality_rating: response.data.quality_rating
                }
            };

        } catch (error) {
            console.error('❌ [WHATSAPP SERVICE] Test connessione fallito:', error.message);
            
            let errorMessage = 'Connessione WhatsApp API non funzionante';
            if (error.response?.data?.error) {
                const errorData = error.response.data.error;
                errorMessage = `${errorData.message} (Codice: ${errorData.code})`;
            }

            return { 
                success: false, 
                message: errorMessage,
                error: error.response?.data || error.message 
            };
        }
    }

    // Metodo per ottenere informazioni sul numero WhatsApp
    async getPhoneNumberInfo() {
        try {
            const response = await axios.get(
                `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`
                    }
                }
            );
            return response.data;
        } catch (error) {
            console.error('❌ [WHATSAPP SERVICE] Errore info numero:', error.message);
            return null;
        }
    }
}

module.exports = WhatsAppService;