// ============================================
// 📁 whatsapp/bot.js - BOT AI-ENHANCED
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
            erroriAI: 0,
            tempoRispostaArray: [],
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
                console.log(`\n💬 [BOT] Messaggio #${this.stats.messaggiRicevuti} da: ${messageData.from}`);
                console.log(`📝 [BOT] Contenuto: "${messageData.text}"`);
                console.log(`👤 [BOT] Nome contatto: ${messageData.contactName}`);
                
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
                startTime: new Date(),
                lastActivity: new Date()
            };

            // Aggiorna ultima attività
            conversazione.lastActivity = new Date();

            console.log(`📊 [BOT] Step attuale: ${conversazione.currentStep}`);
            console.log(`📋 [BOT] Dati attuali:`, JSON.stringify(conversazione.datiCliente, null, 2));

            // Aggiungi messaggio utente
            conversazione.messaggi.push({
                role: 'user',
                content: messageText,
                timestamp: new Date()
            });

            // Genera risposta AI
            const startTime = Date.now();
            const risposta = await this.claude.generateResponse(conversazione, messageText);
            const responseTime = Date.now() - startTime;

            // Traccia tempi di risposta per statistiche
            this.stats.tempoRispostaArray.push(responseTime);
            if (this.stats.tempoRispostaArray.length > 100) {
                this.stats.tempoRispostaArray.shift(); // Mantieni solo gli ultimi 100
            }

            // Invia risposta
            console.log(`📤 [BOT] Invio risposta AI: "${risposta}"`);
            const success = await this.whatsapp.sendMessage(userPhone, risposta);

            if (success) {
                this.stats.messaggiInviati++;
                
                // Salva risposta bot
                conversazione.messaggi.push({
                    role: 'assistant',
                    content: risposta,
                    timestamp: new Date(),
                    responseTime: responseTime,
                    aiGenerated: true
                });

                // Aggiorna conversazione
                this.conversazioni.set(userPhone, conversazione);

                console.log(`✅ [BOT] Processo AI completato in ${responseTime}ms`);
                console.log(`🔄 [BOT] Nuovo step: ${conversazione.currentStep}`);
                console.log(`📊 [BOT] Dati aggiornati:`, JSON.stringify(conversazione.datiCliente, null, 2));

                // Notifica appuntamento completato
                if (conversazione.currentStep === config.bot.steps.CONFERMATO) {
                    this.stats.appuntamentiCompletati++;
                    const durata = Math.round((new Date() - conversazione.startTime) / 60000);
                    
                    console.log(`\n🎉 [BOT] *** APPUNTAMENTO COMPLETATO CON AI! ***`);
                    console.log(`   👤 Cliente: ${conversazione.datiCliente.nome}`);
                    console.log(`   📧 Email: ${conversazione.datiCliente.email}`);
                    console.log(`   📅 Data: ${conversazione.datiCliente.data}`);
                    console.log(`   🕐 Ora: ${conversazione.datiCliente.ora}`);
                    console.log(`   📱 Telefono: ${userPhone}`);
                    console.log(`   👤 Nome contatto: ${contactName}`);
                    console.log(`   ⏱️ Durata: ${durata} minuti`);
                    console.log(`   🤖 Gestito da: Sofia AI`);
                    console.log(`   💬 Messaggi totali: ${conversazione.messaggi.length}\n`);
                }

            } else {
                console.error('❌ [BOT] Invio messaggio fallito');
                // Prova fallback semplice
                await this.whatsapp.sendMessage(userPhone, 
                    "Mi dispiace, c'è stato un problemino tecnico. Riprova tra un momento! 😅");
            }

        } catch (error) {
            this.stats.erroriAI++;
            console.error('❌ [BOT] Errore processamento AI:', error);
            
            // Fallback intelligente basato sullo step
            const fallbackMessage = this.getFallbackMessage(userPhone);
            await this.whatsapp.sendMessage(userPhone, fallbackMessage);
        }
    }

    getFallbackMessage(userPhone) {
        const conversazione = this.conversazioni.get(userPhone);
        
        if (!conversazione) {
            return "Ciao! Sono Sofia di Costruzione Digitale. Aiutiamo imprese edili a trovare nuovi clienti online. Ti interessa una consulenza gratuita? 🏗️";
        }

        const step = conversazione.currentStep;
        
        switch (step) {
            case config.bot.steps.START:
                return "Ciao! Sono Sofia di Costruzione Digitale. Ci specializziamo nel marketing per imprese edili. Vuoi saperne di più? 🏗️";
            
            case config.bot.steps.INTERESSE:
            case config.bot.steps.NOME:
                return "Perfetto! Per organizzare la consulenza, come ti chiami? 📝";
                
            case config.bot.steps.COGNOME:
                return "E il cognome? 📝";
                
            case config.bot.steps.EMAIL:
                return "Ottimo! Ora la tua email per confermare l'appuntamento? 📧";
                
            case config.bot.steps.DATA:
                return "Che giorno va bene per la consulenza? (es: lunedì, martedì, oggi...) 📅";
                
            case config.bot.steps.ORA:
                return "A che ora preferisci? (es: 15:00, mattina, pomeriggio) 🕐";
                
            case config.bot.steps.RIEPILOGO:
                return "Confermi l'appuntamento? Scrivi 'sì' per procedere ✅";
                
            default:
                return "Scusa, non ho capito bene. Puoi ripetere? 😅";
        }
    }

    // Ottieni statistiche avanzate
    getStats() {
        const tempoMedio = this.stats.tempoRispostaArray.length > 0 
            ? Math.round(this.stats.tempoRispostaArray.reduce((a, b) => a + b, 0) / this.stats.tempoRispostaArray.length)
            : 0;

        const conversionRate = this.conversazioni.size > 0 
            ? Math.round(this.stats.appuntamentiCompletati / this.conversazioni.size * 100) 
            : 0;

        const successRate = this.stats.messaggiRicevuti > 0 
            ? Math.round((this.stats.messaggiInviati / this.stats.messaggiRicevuti) * 100) 
            : 0;

        return {
            messaggiRicevuti: this.stats.messaggiRicevuti,
            messaggiInviati: this.stats.messaggiInviati,
            conversazioniAttive: this.conversazioni.size,
            appuntamentiCompletati: this.stats.appuntamentiCompletati,
            erroriAI: this.stats.erroriAI,
            tempoRispostaMediaMs: tempoMedio,
            conversionRate: conversionRate,
            successRate: successRate,
            uptime: Math.round((new Date() - this.stats.ultimoRestart) / 60000)
        };
    }

    // Cleanup conversazioni vecchie (24h) e statistiche dettagliate
    cleanupOldConversations() {
        const now = new Date();
        const CLEANUP_HOURS = 24;
        let cleaned = 0;
        let completate = 0;

        for (const [phone, conv] of this.conversazioni) {
            const hoursDiff = (now - conv.lastActivity) / (1000 * 60 * 60);
            
            if (hoursDiff > CLEANUP_HOURS) {
                if (conv.currentStep === config.bot.steps.CONFERMATO) {
                    completate++;
                }
                this.conversazioni.delete(phone);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            console.log(`🗑️ [BOT] Cleanup: ${cleaned} conversazioni rimosse (${completate} erano completate)`);
        }
        
        return { cleaned, completate };
    }

    // Test completo del bot AI-enhanced
    async testBot() {
        console.log('\n🧪 [BOT] Test bot AI-enhanced...');
        
        try {
            // Test configurazione
            const configTest = config.validate();
            console.log(`⚙️ [BOT] Config: ${configTest.isValid ? '✅' : '❌'}`);
            if (!configTest.isValid) {
                console.log(`❌ [BOT] Variabili mancanti: ${configTest.errors.join(', ')}`);
            }
            
            // Test WhatsApp
            const whatsappTest = await this.whatsapp.testConnection();
            console.log(`📱 [BOT] WhatsApp: ${whatsappTest.success ? '✅' : '❌'}`);
            if (!whatsappTest.success) {
                console.log(`❌ [BOT] Errore WhatsApp: ${whatsappTest.message}`);
            }
            
            // Test Claude AI
            const claudeTest = await this.claude.testConnection();
            console.log(`🤖 [BOT] Claude AI: ${claudeTest.success ? '✅' : '❌'}`);
            if (!claudeTest.success) {
                console.log(`❌ [BOT] Errore Claude: ${claudeTest.error}`);
            }
            
            const allOk = configTest.isValid && whatsappTest.success && claudeTest.success;
            
            console.log(`\n🎯 [BOT] Risultato: ${allOk ? '✅ TUTTO OK - BOT AI PRONTO!' : '❌ CI SONO PROBLEMI'}`);
            
            if (allOk) {
                console.log(`🚀 [BOT] Sofia AI è pronta ad assistere i clienti di Costruzione Digitale!`);
                console.log(`📊 [BOT] Servizi: Marketing digitale per imprese edili`);
                console.log(`🎯 [BOT] Obiettivo: Fissare consulenze gratuite`);
            }
            
            return { success: allOk };
            
        } catch (error) {
            console.error('❌ [BOT] Test fallito:', error.message);
            return { success: false, error: error.message };
        }
    }

    // Reset conversazione specifica
    resetConversation(phoneNumber) {
        if (this.conversazioni.has(phoneNumber)) {
            const conv = this.conversazioni.get(phoneNumber);
            console.log(`🔄 [BOT] Reset conversazione: ${phoneNumber} (era al step: ${conv.currentStep})`);
            this.conversazioni.delete(phoneNumber);
            return true;
        }
        return false;
    }

    // Reset completo delle statistiche
    resetStats() {
        const oldStats = { ...this.stats };
        this.stats = {
            messaggiRicevuti: 0,
            messaggiInviati: 0,
            appuntamentiCompletati: 0,
            erroriAI: 0,
            tempoRispostaArray: [],
            ultimoRestart: new Date()
        };
        
        console.log('🔄 [BOT] Statistiche resettate');
        console.log(`📊 [BOT] Statistiche precedenti: ${JSON.stringify(oldStats, null, 2)}`);
    }

    // Ottieni dettagli conversazione per debugging
    getConversationDetails(phoneNumber) {
        const conv = this.conversazioni.get(phoneNumber);
        if (!conv) return null;

        return {
            phone: phoneNumber,
            contactName: conv.contactName,
            currentStep: conv.currentStep,
            datiCliente: conv.datiCliente,
            startTime: conv.startTime,
            lastActivity: conv.lastActivity,
            messaggiCount: conv.messaggi.length,
            isComplete: config.bot.isComplete ? config.bot.isComplete(conv) : false,
            durataTotalMinutes: Math.round((new Date() - conv.startTime) / 60000)
        };
    }

    // Elenca tutte le conversazioni attive
    getActiveConversations() {
        const conversations = [];
        for (const [phone, conv] of this.conversazioni) {
            conversations.push(this.getConversationDetails(phone));
        }
        return conversations.sort((a, b) => b.lastActivity - a.lastActivity);
    }
}

module.exports = WhatsAppBot;