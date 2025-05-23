// ============================================
// 📁 whatsapp/bot.js - VERSIONE SEMPLIFICATA
// ============================================
const ClaudeService = require('./claude');
const WhatsAppService = require('./handlers');
const config = require('./config');

class WhatsAppBot {
    constructor() {
        this.claude = new ClaudeService();
        this.whatsapp = new WhatsAppService();
        this.conversazioni = new Map();
    }

    // Verifica webhook WhatsApp
    handleWebhookVerification(req, res) {
        if (this.whatsapp.isValidWebhook(req)) {
            console.log('✅ [BOT] Webhook verificato');
            res.status(200).send(req.query['hub.challenge']);
        } else {
            console.log('❌ [BOT] Verifica webhook fallita');
            res.sendStatus(403);
        }
    }

    // Gestisce messaggi in arrivo
    async handleIncomingMessage(req, res) {
        try {
            const messageData = this.whatsapp.extractMessageData(req.body);
            
            if (messageData) {
                console.log(`💬 [BOT] Messaggio da: ${messageData.from}`);
                // Processa in background
                setImmediate(() => this.processMessage(messageData));
            }
            
            res.status(200).send('OK');
        } catch (error) {
            console.error('❌ [BOT] Errore gestione messaggio:', error);
            res.status(500).send('Error');
        }
    }

    async processMessage(messageData) {
        const { from: userPhone, text: messageText } = messageData;
    
        try {
            // Ottieni o crea conversazione
            let conversazione = this.conversazioni.get(userPhone) || {
                messaggi: [],
                datiCliente: {},
                currentStep: config.bot.steps.START,
                ultimoMessaggio: new Date(),
                whatsappNumber: userPhone
            };

            console.log(`📊 [BOT] Step attuale: ${conversazione.currentStep}`);
            console.log(`📊 [BOT] Dati attuali:`, conversazione.datiCliente);

            // Aggiungi messaggio utente
            conversazione.messaggi.push({
                role: 'user',
                content: messageText,
                timestamp: new Date()
            });

            // Genera risposta
            console.log(`🤖 [BOT] Generazione risposta...`);
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

                // Aggiorna conversazione
                conversazione.ultimoMessaggio = new Date();
                this.conversazioni.set(userPhone, conversazione);

                console.log(`✅ [BOT] Completato: "${messageText}" → "${risposta}"`);
                console.log(`📊 [BOT] Nuovo step: ${conversazione.currentStep}`);

                // Se appuntamento confermato, log speciale
                if (conversazione.currentStep === config.bot.steps.CONFERMATO) {
                    console.log(`🎉 [BOT] APPUNTAMENTO CONFERMATO per ${userPhone}!`);
                    console.log(`📋 [BOT] Dettagli:`, conversazione.datiCliente);
                }
            }

        } catch (error) {
            console.error('❌ [BOT] Errore processamento:', error);
            await this.whatsapp.sendMessage(userPhone, 
                "Ops! C'è stato un problemino 😅 Riprova o scrivimi di nuovo!");
        }
    }

    // Cleanup conversazioni vecchie (24h)
    cleanupOldConversations() {
        const now = new Date();
        const CLEANUP_HOURS = 24;

        for (const [phone, conv] of this.conversazioni) {
            const hoursDiff = (now - conv.ultimoMessaggio) / (1000 * 60 * 60);
            if (hoursDiff > CLEANUP_HOURS) {
                this.conversazioni.delete(phone);
                console.log(`🗑️ [BOT] Cleanup conversazione: ${phone}`);
            }
        }
    }

    // Stats semplici
    getStats() {
        const conversazioni = Array.from(this.conversazioni.values());
        
        const stepCount = {};
        conversazioni.forEach(conv => {
            const step = conv.currentStep || 'unknown';
            stepCount[step] = (stepCount[step] || 0) + 1;
        });

        const appointmentsCompleted = conversazioni.filter(conv => 
            conv.currentStep === config.bot.steps.CONFERMATO
        ).length;

        return {
            conversazioniAttive: this.conversazioni.size,
            stepDistribution: stepCount,
            appuntamentiCompletati: appointmentsCompleted,
            messaggiTotali: conversazioni.reduce((sum, conv) => sum + conv.messaggi.length, 0)
        };
    }

    // Test bot completo
    async testBot() {
        console.log('🧪 [BOT] Test completo del bot...');
        
        try {
            // Test WhatsApp
            const whatsappTest = await this.whatsapp.testConnection();
            console.log('📱 [BOT] WhatsApp test:', whatsappTest.success ? '✅' : '❌');
            
            // Test Claude
            const claudeTest = await this.claude.testConnection();
            console.log('🤖 [BOT] Claude test:', claudeTest.success ? '✅' : '❌');
            
            // Test configurazione
            const configTest = config.validate();
            console.log('⚙️ [BOT] Config test:', configTest.isValid ? '✅' : '❌');
            
            const overallSuccess = whatsappTest.success && claudeTest.success && configTest.isValid;
            
            console.log(`\n🎯 [BOT] RISULTATO TEST: ${overallSuccess ? '✅ TUTTO OK' : '❌ CI SONO PROBLEMI'}`);
            
            return {
                success: overallSuccess,
                whatsapp: whatsappTest,
                claude: claudeTest,
                config: configTest
            };
            
        } catch (error) {
            console.error('❌ [BOT] Errore test:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Reset conversazione specifica (per debug)
    resetConversation(phoneNumber) {
        if (this.conversazioni.has(phoneNumber)) {
            this.conversazioni.delete(phoneNumber);
            console.log(`🔄 [BOT] Reset conversazione: ${phoneNumber}`);
            return true;
        }
        return false;
    }
}

module.exports = WhatsAppBot;