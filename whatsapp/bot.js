// ============================================
// 📁 whatsapp/bot.js (MAIN LOGIC)
// ============================================
const ClaudeService = require('./claude');
const WhatsAppService = require('./handlers');

class WhatsAppBot {
    constructor() {
        this.claude = new ClaudeService();
        this.whatsapp = new WhatsAppService();
        this.conversazioni = new Map(); // In produzione usa Redis/Database

        this.mongoConnection = require('mongoose').connection;
    }

    // Verifica webhook WhatsApp
    handleWebhookVerification(req, res) {
        if (this.whatsapp.isValidWebhook(req)) {
            console.log('✅ [WHATSAPP BOT] Webhook verificato');
            res.status(200).send(req.query['hub.challenge']);
        } else {
            console.log('❌ [WHATSAPP BOT] Verifica webhook fallita');
            res.sendStatus(403);
        }
    }

    // Gestisce messaggi in arrivo
    async handleIncomingMessage(req, res) {
        try {
            const messageData = this.whatsapp.extractMessageData(req.body);
            
            if (messageData) {
                console.log(`💬 [WHATSAPP BOT] Messaggio ricevuto da: ${messageData.from}`);
                // Processa in background per risposta veloce
                setImmediate(() => this.processMessage(messageData));
            }
            
            res.status(200).send('OK');
        } catch (error) {
            console.error('❌ [WHATSAPP BOT] Errore gestione messaggio:', error);
            res.status(500).send('Error');
        }
    }

    async processMessage(messageData) {
        const { from: userPhone, text: messageText } = messageData;
    
        try {
            // ===== FIX: AGGIUNGI NUMERO WHATSAPP ALLA CONVERSAZIONE =====
            let conversazione = this.conversazioni.get(userPhone) || {
                messaggi: [],
                datiCliente: {},
                stato: 'nuovo_cliente',
                ultimoMessaggio: new Date(),
                whatsappNumber: userPhone  // ← AGGIUNTO
            };
    
            // Se non presente, assicurati che sia sempre aggiornato
            conversazione.whatsappNumber = userPhone;

            // Aggiungi messaggio utente
            conversazione.messaggi.push({
                role: 'user',
                content: messageText,
                timestamp: new Date()
            });

            // Genera risposta con Claude
            console.log(`🤖 [WHATSAPP BOT] Generazione risposta per: ${userPhone}`);
            const risposta = await this.claude.generateResponse(conversazione, messageText);

            // Invia risposta
            const success = await this.whatsapp.sendMessage(userPhone, risposta);

            if (success) {
                // Salva risposta bot
                conversazione.messaggi.push({
                    role: 'assistant',
                    content: risposta,
                    timestamp: new Date()
                });

                // Aggiorna stato conversazione
                conversazione.ultimoMessaggio = new Date();
                this.conversazioni.set(userPhone, conversazione);

                console.log(`✅ [WHATSAPP BOT] Conversazione completata: ${messageText} → ${risposta}`);
            }

        } catch (error) {
            console.error('❌ [WHATSAPP BOT] Errore processamento messaggio:', error);
            await this.whatsapp.sendMessage(userPhone, 
                "Mi dispiace, c'è stato un problema. Riprova tra poco o contattaci direttamente.");
        }
    }

    // Cleanup conversazioni vecchie (chiamata periodica)
    cleanupOldConversations() {
        const now = new Date();
        const CLEANUP_HOURS = 24;

        for (const [phone, conv] of this.conversazioni) {
            const hoursDiff = (now - conv.ultimoMessaggio) / (1000 * 60 * 60);
            if (hoursDiff > CLEANUP_HOURS) {
                this.conversazioni.delete(phone);
                console.log(`🗑️ [WHATSAPP BOT] Cleanup conversazione: ${phone}`);
            }
        }
    }

    // Stats conversazioni
    getStats() {
        return {
            conversazioniAttive: this.conversazioni.size,
            messaggiTotali: Array.from(this.conversazioni.values())
                .reduce((sum, conv) => sum + conv.messaggi.length, 0)
        };
    }
}

module.exports = WhatsAppBot;