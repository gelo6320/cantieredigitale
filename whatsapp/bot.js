// ============================================
// 📁 whatsapp/bot.js - BOT SEMPLIFICATO
// ============================================
const ClaudeService = require('./claude');
const WhatsAppService = require('./handlers');
const config = require('./config');

class WhatsAppBot {
    constructor() {
        this.claude = new ClaudeService();
        this.whatsapp = new WhatsAppService();
        this.conversazioni = new Map();
        this.stats = {
            messaggiRicevuti: 0,
            messaggiInviati: 0,
            appuntamentiCompletati: 0,
            ultimoRestart: new Date()
        };
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
                this.stats.messaggiRicevuti++;
                console.log(`💬 [BOT] Messaggio #${this.stats.messaggiRicevuti} da: ${messageData.from}`);
                console.log(`📝 [BOT] Contenuto: "${messageData.text}"`);
                
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
        const { from: userPhone, text: messageText, contactName } = messageData;
    
        try {
            // Ottieni o crea conversazione
            let conversazione = this.conversazioni.get(userPhone) || {
                messaggi: [],
                datiCliente: {},
                currentStep: config.bot.steps.START,
                whatsappNumber: userPhone,
                contactName: contactName,
                startTime: new Date()
            };

            console.log(`📊 [BOT] Step attuale: ${conversazione.currentStep}`);
            console.log(`📋 [BOT] Dati attuali:`, conversazione.datiCliente);

            // Aggiungi messaggio utente
            conversazione.messaggi.push({
                role: 'user',
                content: messageText,
                timestamp: new Date()
            });

            // Genera risposta
            const startTime = Date.now();
            const risposta = await this.claude.generateResponse(conversazione, messageText);
            const responseTime = Date.now() - startTime;

            // Invia risposta
            console.log(`📤 [BOT] Invio risposta: "${risposta}"`);
            const success = await this.whatsapp.sendMessage(userPhone, risposta);

            if (success) {
                this.stats.messaggiInviati++;
                
                // Salva risposta bot
                conversazione.messaggi.push({
                    role: 'assistant',
                    content: risposta,
                    timestamp: new Date(),
                    responseTime: responseTime
                });

                // Aggiorna conversazione
                this.conversazioni.set(userPhone, conversazione);

                console.log(`✅ [BOT] Processo completato in ${responseTime}ms`);
                console.log(`🔄 [BOT] Nuovo step: ${conversazione.currentStep}`);

                // Notifica appuntamento completato
                if (conversazione.currentStep === config.bot.steps.CONFERMATO) {
                    this.stats.appuntamentiCompletati++;
                    const durata = Math.round((new Date() - conversazione.startTime) / 60000);
                    
                    console.log(`\n🎉 [BOT] *** APPUNTAMENTO COMPLETATO! ***`);
                    console.log(`   👤 Cliente: ${conversazione.datiCliente.nome}`);
                    console.log(`   📧 Email: ${conversazione.datiCliente.email}`);
                    console.log(`   📅 Data: ${conversazione.datiCliente.data}`);
                    console.log(`   🕐 Ora: ${conversazione.datiCliente.ora}`);
                    console.log(`   📱 Telefono: ${userPhone}`);
                    console.log(`   ⏱️ Durata: ${durata} minuti\n`);
                }

            } else {
                console.error('❌ [BOT] Invio messaggio fallito');
            }

        } catch (error) {
            console.error('❌ [BOT] Errore processamento:', error);
            await this.whatsapp.sendMessage(userPhone, 
                "Ops! C'è stato un problemino 😅 Riprova!");
        }
    }

    // Ottieni statistiche
    getStats() {
        return {
            messaggiRicevuti: this.stats.messaggiRicevuti,
            messaggiInviati: this.stats.messaggiInviati,
            conversazioniAttive: this.conversazioni.size,
            appuntamentiCompletati: this.stats.appuntamentiCompletati,
            uptime: Math.round((new Date() - this.stats.ultimoRestart) / 60000),
            conversionRate: this.conversazioni.size > 0 ? 
                Math.round(this.stats.appuntamentiCompletati / this.conversazioni.size * 100) : 0
        };
    }

    // Cleanup conversazioni vecchie (24h)
    cleanupOldConversations() {
        const now = new Date();
        const CLEANUP_HOURS = 24;
        let cleaned = 0;

        for (const [phone, conv] of this.conversazioni) {
            const hoursDiff = (now - (conv.ultimoMessaggio || conv.startTime)) / (1000 * 60 * 60);
            if (hoursDiff > CLEANUP_HOURS) {
                this.conversazioni.delete(phone);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            console.log(`🗑️ [BOT] Cleanup: ${cleaned} conversazioni rimosse`);
        }
        
        return cleaned;
    }

    // Test completo del bot
    async testBot() {
        console.log('\n🧪 [BOT] Test bot...');
        
        try {
            // Test configurazione
            const configTest = config.validate();
            console.log(`⚙️ [BOT] Config: ${configTest.isValid ? '✅' : '❌'}`);
            
            // Test WhatsApp
            const whatsappTest = await this.whatsapp.testConnection();
            console.log(`📱 [BOT] WhatsApp: ${whatsappTest.success ? '✅' : '❌'}`);
            
            // Test Claude
            const claudeTest = await this.claude.testConnection();
            console.log(`🤖 [BOT] Claude: ${claudeTest.success ? '✅' : '❌'}`);
            
            const allOk = configTest.isValid && whatsappTest.success && claudeTest.success;
            
            console.log(`\n🎯 [BOT] Risultato: ${allOk ? '✅ TUTTO OK!' : '❌ CI SONO PROBLEMI'}`);
            
            return { success: allOk };
            
        } catch (error) {
            console.error('❌ [BOT] Test fallito:', error.message);
            return { success: false, error: error.message };
        }
    }

    // Reset conversazione
    resetConversation(phoneNumber) {
        if (this.conversazioni.has(phoneNumber)) {
            this.conversazioni.delete(phoneNumber);
            console.log(`🔄 [BOT] Reset conversazione: ${phoneNumber}`);
            return true;
        }
        return false;
    }

    // Reset stats
    resetStats() {
        this.stats = {
            messaggiRicevuti: 0,
            messaggiInviati: 0,
            appuntamentiCompletati: 0,
            ultimoRestart: new Date()
        };
        console.log('🔄 [BOT] Statistiche resettate');
    }
}

module.exports = WhatsAppBot;