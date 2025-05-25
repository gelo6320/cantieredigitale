// ============================================
// 📁 whatsapp/handlers.js - VERSIONE MIGLIORATA E CORRETTA
// ============================================
const axios = require('axios');
const config = require('./config');

class WhatsAppService {
    constructor() {
        this.phoneNumberId = config.whatsapp.phoneNumberId;
        this.accessToken = config.whatsapp.accessToken;
        this.baseURL = `https://graph.facebook.com/v22.0/${this.phoneNumberId}/messages`;
        this.apiVersion = 'v22.0';
        
        // 🆕 Statistiche delivery
        this.deliveryStats = {
            sent: 0,
            delivered: 0,
            read: 0,
            failed: 0,
            lastUpdated: new Date()
        };
        
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

            // 🆕 Validazione messaggio
            if (!message || message.trim().length === 0) {
                console.error('❌ [WHATSAPP SERVICE] Messaggio vuoto - annullo invio');
                return false;
            }

            if (message.length > 4096) {
                console.warn('⚠️ [WHATSAPP SERVICE] Messaggio troppo lungo, lo tronco a 4096 caratteri');
                message = message.substring(0, 4093) + '...';
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

            // 🆕 Aggiorna statistiche
            this.deliveryStats.sent++;
            this.deliveryStats.lastUpdated = new Date();

            console.log(`✅ [WHATSAPP SERVICE] Messaggio inviato con successo`);
            console.log(`📊 [WHATSAPP SERVICE] Response status: ${response.status}`);
            console.log(`📊 [WHATSAPP SERVICE] Message ID: ${response.data.messages?.[0]?.id || 'N/A'}`);
            console.log(`📊 [WHATSAPP SERVICE] Messaggi inviati oggi: ${this.deliveryStats.sent}`);
            
            return true;

        } catch (error) {
            console.error('❌ [WHATSAPP SERVICE] Errore invio messaggio:', error.message);
            
            // 🆕 Aggiorna statistiche errori
            this.deliveryStats.failed++;
            this.deliveryStats.lastUpdated = new Date();
            
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
                            console.error('💡 Verifica formato del messaggio e numero destinatario');
                            break;
                        case 80007:
                            console.error('📱 [WHATSAPP SERVICE] Numero WhatsApp non valido');
                            console.error('💡 Verifica che il numero sia nel formato corretto (+39...)');
                            break;
                        case 131026:
                            console.error('⏱️ [WHATSAPP SERVICE] Rate limit raggiunto');
                            console.error('💡 Attendi qualche minuto prima di inviare altri messaggi');
                            break;
                        case 131047:
                            console.error('🚫 [WHATSAPP SERVICE] Utente ha bloccato il numero business');
                            break;
                        case 131016:
                            console.error('📵 [WHATSAPP SERVICE] Numero destinatario non ha WhatsApp');
                            break;
                        default:
                            console.error(`🔍 [WHATSAPP SERVICE] Errore sconosciuto - Codice: ${errorData.code}`);
                            console.error(`📝 [WHATSAPP SERVICE] Dettaglio: ${errorData.message}`);
                    }
                }
            } else if (error.code === 'ECONNABORTED') {
                console.error('⏰ [WHATSAPP SERVICE] Timeout richiesta - rete lenta o server non raggiungibile');
            } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
                console.error('🌐 [WHATSAPP SERVICE] Errore di connessione di rete');
                console.error('💡 Verifica la connessione internet');
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

            // 🆕 Validazione bottoni
            if (!buttons || buttons.length === 0) {
                console.error('❌ [WHATSAPP SERVICE] Nessun bottone fornito per messaggio interattivo');
                return false;
            }

            if (buttons.length > 3) {
                console.warn('⚠️ [WHATSAPP SERVICE] WhatsApp supporta max 3 bottoni, rimuovo gli extra');
                buttons = buttons.slice(0, 3);
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

            // 🆕 Aggiorna statistiche
            this.deliveryStats.sent++;
            this.deliveryStats.lastUpdated = new Date();

            console.log(`✅ [WHATSAPP SERVICE] Messaggio interattivo inviato con successo`);
            console.log(`📊 [WHATSAPP SERVICE] Message ID: ${response.data.messages?.[0]?.id || 'N/A'}`);
            
            return true;

        } catch (error) {
            console.error('❌ [WHATSAPP SERVICE] Errore messaggio interattivo:', error.response?.data || error.message);
            this.deliveryStats.failed++;
            return false;
        }
    }

    // ===== METODO MIGLIORATO PER GESTIRE WEBHOOK =====
    extractMessageData(body) {
        try {
            console.log('📥 [WHATSAPP SERVICE] Analisi webhook ricevuto...');
            
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

            // ===== DISTINGUI TRA MESSAGGI E STATUS =====
            const webhookValue = changes.value;
            
            // Controlla se è un webhook di status (sent, delivered, read)
            if (webhookValue.statuses && webhookValue.statuses.length > 0) {
                const status = webhookValue.statuses[0];
                console.log(`📋 [WHATSAPP SERVICE] Webhook di stato ricevuto: ${status.status}`);
                console.log(`   📱 Messaggio ID: ${status.id}`);
                console.log(`   👤 Destinatario: ${status.recipient_id}`);
                console.log(`   🕐 Timestamp: ${status.timestamp}`);
                
                // Gestisci diversi tipi di status
                switch (status.status) {
                    case 'sent':
                        console.log('📤 [WHATSAPP SERVICE] ✅ Messaggio inviato dal server');
                        break;
                    case 'delivered':
                        console.log('📱 [WHATSAPP SERVICE] ✅ Messaggio consegnato al dispositivo');
                        this.deliveryStats.delivered++;
                        break;
                    case 'read':
                        console.log('👁️ [WHATSAPP SERVICE] ✅ Messaggio letto dall\'utente');
                        this.deliveryStats.read++;
                        break;
                    case 'failed':
                        console.log('❌ [WHATSAPP SERVICE] ⚠️ Invio messaggio fallito');
                        this.deliveryStats.failed++;
                        if (status.errors) {
                            console.log('📊 [WHATSAPP SERVICE] Dettagli errore:', status.errors);
                        }
                        break;
                    default:
                        console.log(`📊 [WHATSAPP SERVICE] Status sconosciuto: ${status.status}`);
                }
                
                // Aggiorna timestamp statistiche
                this.deliveryStats.lastUpdated = new Date();
                
                // Salva statistiche sui delivery status
                this.handleMessageStatus(status);
                
                // Ritorna null perché non è un messaggio in arrivo da processare
                return null;
            }

            // Controlla se è un messaggio in arrivo
            const message = webhookValue.messages?.[0];
            if (!message) {
                console.log('ℹ️ [WHATSAPP SERVICE] Webhook ricevuto ma nessun messaggio o status da processare');
                return null;
            }

            // 🆕 Verifica che non sia un messaggio dal nostro bot
            if (message.from === this.phoneNumberId) {
                console.log('🔄 [WHATSAPP SERVICE] Ignorato messaggio dal nostro bot');
                return null;
            }

            // 🆕 Gestisci diversi tipi di messaggio
            let messageText = '';
            switch (message.type) {
                case 'text':
                    messageText = message.text?.body || '';
                    break;
                case 'button':
                    messageText = message.button?.text || '';
                    console.log(`🔘 [WHATSAPP SERVICE] Bottone premuto: ${messageText}`);
                    break;
                case 'interactive':
                    if (message.interactive?.type === 'button_reply') {
                        messageText = message.interactive.button_reply.title || '';
                        console.log(`🔘 [WHATSAPP SERVICE] Risposta interattiva: ${messageText}`);
                    }
                    break;
                default:
                    console.log(`📱 [WHATSAPP SERVICE] Tipo messaggio non supportato: ${message.type}`);
                    return null;
            }

            // Estrai contatto se disponibile
            const contact = webhookValue.contacts?.[0];
            const contactName = contact?.profile?.name || 'Utente sconosciuto';

            const messageData = {
                from: message.from,
                text: messageText,
                type: message.type,
                timestamp: message.timestamp,
                messageId: message.id,
                contactName: contactName
            };

            // 🆕 Validazione dati estratti
            if (!messageData.from || !messageData.text) {
                console.error('❌ [WHATSAPP SERVICE] Dati messaggio incompleti:', messageData);
                return null;
            }

            console.log('✅ [WHATSAPP SERVICE] 💬 NUOVO MESSAGGIO ESTRATTO:');
            console.log(`   📱 Da: ${messageData.from} (${contactName})`);
            console.log(`   📝 Testo: "${messageData.text}"`);
            console.log(`   📑 Tipo: ${messageData.type}`);
            console.log(`   🕐 Timestamp: ${messageData.timestamp}`);
            console.log(`   🆔 Message ID: ${messageData.messageId}`);
            
            return messageData;

        } catch (error) {
            console.error('❌ [WHATSAPP SERVICE] Errore parsing webhook:', error.message);
            console.error('📊 [WHATSAPP SERVICE] Body ricevuto:', JSON.stringify(body, null, 2));
            return null;
        }
    }

    // ===== GESTIONE STATUS DEI MESSAGGI =====
    handleMessageStatus(status) {
        try {
            // Log dettagliato per analytics
            console.log(`📊 [WHATSAPP SERVICE] Processing status: ${status.status} for ${status.recipient_id}`);
            
            // Esempio: Salva timestamp di lettura per analytics
            if (status.status === 'read') {
                console.log(`📊 [WHATSAPP SERVICE] Messaggio letto dal cliente: ${status.recipient_id}`);
                // TODO: Salva nel database per analytics
                // await this.saveReadReceipt(status);
            }
            
            // Esempio: Traccia fallimenti di delivery
            if (status.status === 'failed') {
                console.error(`📊 [WHATSAPP SERVICE] Errore delivery per ${status.recipient_id}:`, status.errors);
                // TODO: Notifica amministratore o retry automatico
                // await this.handleDeliveryFailure(status);
            }
            
            // Traccia delivery rate
            if (status.status === 'delivered') {
                console.log(`📊 [WHATSAPP SERVICE] Delivery confermato per ${status.recipient_id}`);
            }
            
        } catch (error) {
            console.error('❌ [WHATSAPP SERVICE] Errore gestione status:', error.message);
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

    // 🆕 TEST CONNESSIONE MIGLIORATO
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
            console.log(`⭐ [WHATSAPP SERVICE] Quality rating: ${response.data.quality_rating}`);

            return { 
                success: true, 
                message: 'Connessione WhatsApp API funzionante',
                data: {
                    phone_number: response.data.display_phone_number,
                    verified_name: response.data.verified_name,
                    quality_rating: response.data.quality_rating,
                    messaging_limit_tier: response.data.messaging_limit_tier || 'N/A'
                }
            };

        } catch (error) {
            console.error('❌ [WHATSAPP SERVICE] Test connessione fallito:', error.message);
            
            let errorMessage = 'Connessione WhatsApp API non funzionante';
            let suggestions = [];
            
            if (error.response?.data?.error) {
                const errorData = error.response.data.error;
                errorMessage = `${errorData.message} (Codice: ${errorData.code})`;
                
                // Suggerimenti specifici per codici di errore
                switch (errorData.code) {
                    case 190:
                        suggestions.push('Genera un nuovo Access Token su Facebook Developers');
                        suggestions.push('Verifica che il token abbia i permessi necessari');
                        break;
                    case 100:
                        suggestions.push('Verifica che il Phone Number ID sia corretto');
                        suggestions.push('Controlla i permessi dell\'app Facebook');
                        break;
                }
            }

            return { 
                success: false, 
                message: errorMessage,
                suggestions: suggestions,
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

    // ===== 🆕 METODI PER STATISTICHE MESSAGGIO =====
    
    // Ottieni statistiche di delivery dei messaggi
    getMessageDeliveryStats() {
        const stats = { ...this.deliveryStats };
        
        // Calcola percentuali
        if (stats.sent > 0) {
            stats.deliveryRate = Math.round(stats.delivered / stats.sent * 100);
            stats.readRate = Math.round(stats.read / stats.sent * 100);
            stats.failureRate = Math.round(stats.failed / stats.sent * 100);
        } else {
            stats.deliveryRate = 0;
            stats.readRate = 0;
            stats.failureRate = 0;
        }
        
        return stats;
    }

    // 🆕 OTTIENI STATISTICHE DETTAGLIATE
    getDetailedStats() {
        const stats = this.getMessageDeliveryStats();
        
        return {
            ...stats,
            uptime: Math.round((new Date() - this.deliveryStats.lastUpdated) / 60000),
            health: {
                configValid: this.validateConfig(),
                lastActivity: this.deliveryStats.lastUpdated,
                status: stats.failureRate < 10 ? 'healthy' : 'warning'
            }
        };
    }

    // Reset contatori (utile per testing)
    resetStats() {
        console.log('🔄 [WHATSAPP SERVICE] Reset statistiche messaggi');
        this.deliveryStats = {
            sent: 0,
            delivered: 0,
            read: 0,
            failed: 0,
            lastUpdated: new Date()
        };
    }

    // 🆕 VERIFICA STATO SERVIZIO
    async healthCheck() {
        try {
            const connectionTest = await this.testConnection();
            const stats = this.getDetailedStats();
            
            return {
                status: connectionTest.success ? 'healthy' : 'unhealthy',
                timestamp: new Date().toISOString(),
                connection: connectionTest,
                statistics: stats,
                config: {
                    phoneNumberId: this.phoneNumberId ? '✅' : '❌',
                    accessToken: this.accessToken ? '✅' : '❌'
                }
            };
            
        } catch (error) {
            return {
                status: 'error',
                timestamp: new Date().toISOString(),
                error: error.message
            };
        }
    }

    // 🆕 INVIA MESSAGGIO CON RETRY
    async sendMessageWithRetry(to, message, maxRetries = 3) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`🔄 [WHATSAPP SERVICE] Tentativo ${attempt}/${maxRetries} per ${to}`);
                
                const success = await this.sendMessage(to, message);
                if (success) {
                    if (attempt > 1) {
                        console.log(`✅ [WHATSAPP SERVICE] Messaggio inviato al tentativo ${attempt}`);
                    }
                    return true;
                }
                
                throw new Error('Invio fallito');
                
            } catch (error) {
                lastError = error;
                console.log(`❌ [WHATSAPP SERVICE] Tentativo ${attempt} fallito: ${error.message}`);
                
                if (attempt < maxRetries) {
                    const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
                    console.log(`⏳ [WHATSAPP SERVICE] Attendo ${delay}ms prima del prossimo tentativo...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        
        console.error(`❌ [WHATSAPP SERVICE] Tutti i ${maxRetries} tentativi falliti per ${to}`);
        return false;
    }
}

module.exports = WhatsAppService;