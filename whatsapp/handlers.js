// ============================================
// 📁 whatsapp/handlers.js
// ============================================
const axios = require('axios');
const config = require('./config');

class WhatsAppService {
    constructor() {
        this.phoneNumberId = config.whatsapp.phoneNumberId;
        this.accessToken = config.whatsapp.accessToken;
        this.baseURL = `https://graph.facebook.com/v17.0/${this.phoneNumberId}/messages`;
    }

    async sendMessage(to, message) {
        try {
            const payload = {
                messaging_product: 'whatsapp',
                to: to,
                text: { body: message }
            };

            await axios.post(this.baseURL, payload, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 5000
            });

            console.log(`✅ [WHATSAPP] Messaggio inviato a: ${to}`);
            return true;
        } catch (error) {
            console.error('❌ [WHATSAPP] Errore invio messaggio:', error.response?.data || error.message);
            return false;
        }
    }

    async sendInteractiveMessage(to, text, buttons) {
        try {
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
                                title: btn.substring(0, 20)
                            }
                        }))
                    }
                }
            };

            await axios.post(this.baseURL, payload, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            console.log(`✅ [WHATSAPP] Messaggio interattivo inviato a: ${to}`);
            return true;
        } catch (error) {
            console.error('❌ [WHATSAPP] Errore messaggio interattivo:', error.response?.data);
            return false;
        }
    }

    extractMessageData(body) {
        try {
            const entry = body.entry?.[0];
            const changes = entry?.changes?.[0];
            
            if (changes?.field === 'messages') {
                const message = changes.value?.messages?.[0];
                if (message) {
                    return {
                        from: message.from,
                        text: message.text?.body || '',
                        type: message.type,
                        timestamp: message.timestamp,
                        messageId: message.id
                    };
                }
            }
            return null;
        } catch (error) {
            console.error('Errore parsing messaggio:', error);
            return null;
        }
    }

    isValidWebhook(req) {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        return mode === 'subscribe' && token === config.whatsapp.webhookToken;
    }
}

module.exports = WhatsAppService;