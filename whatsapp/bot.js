// ============================================
// 📁 whatsapp/bot.js - CON SISTEMA INTENT COMPLETO E CORRETTO
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
            intentStats: {},
            modificheEffettuate: 0, // 🆕 Nuova statistica
            erroriValidazione: 0, // 🆕 Nuova statistica
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
                console.log(`💬 [BOT] Messaggio #${this.stats.messaggiRicevuti} da: ${messageData.from} (${messageData.contactName})`);
                console.log(`📝 [BOT] Contenuto: "${messageData.text}"`);
                
                // Processa in background per risposta veloce
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
            // ===== OTTIENI O CREA CONVERSAZIONE =====
            let conversazione = this.conversazioni.get(userPhone) || {
                messaggi: [],
                datiCliente: {},
                currentStep: config.bot.steps.START,
                ultimoMessaggio: new Date(),
                whatsappNumber: userPhone,
                contactName: contactName,
                startTime: new Date(),
                modificheCount: 0 // 🆕 Contatore modifiche per questa conversazione
            };

            // ===== LOG STATO PRE-PROCESSING =====
            console.log(`📊 [BOT] STATO CONVERSAZIONE PRE-PROCESSING:`);
            console.log(`   👤 Utente: ${contactName} (${userPhone})`);
            console.log(`   🔄 Step attuale: ${conversazione.currentStep}`);
            console.log(`   💬 Messaggi scambiati: ${conversazione.messaggi.length}`);
            console.log(`   📋 Dati attuali:`, conversazione.datiCliente);

            // ===== RILEVA INTENT =====
            const intent = config.bot.detectIntent(messageText);
            console.log(`🎯 [BOT] Intent rilevato: ${intent}`);
            
            // Aggiorna statistiche intent
            this.stats.intentStats[intent] = (this.stats.intentStats[intent] || 0) + 1;

            // 🆕 ===== GESTIONE SPECIALE PER MODIFICHE =====
            if (conversazione.currentStep === config.bot.steps.RIEPILOGO && 
                ['modifica_nome', 'modifica_email', 'modifica_data', 'modifica_ora'].includes(intent)) {
                this.stats.modificheEffettuate++;
                conversazione.modificheCount++;
                console.log(`✏️ [BOT] Modifica richiesta: ${intent} (totale modifiche: ${conversazione.modificheCount})`);
            }

            // ===== AGGIUNGI MESSAGGIO UTENTE =====
            conversazione.messaggi.push({
                role: 'user',
                content: messageText,
                timestamp: new Date(),
                intent: intent
            });

            // ===== GENERA RISPOSTA CON CLAUDE =====
            console.log(`🤖 [BOT] Generazione risposta per intent: ${intent}...`);
            const startTime = Date.now();
            
            const risposta = await this.claude.generateResponse(conversazione, messageText);
            
            const responseTime = Date.now() - startTime;
            console.log(`⚡ [BOT] Risposta generata in ${responseTime}ms`);

            // 🆕 ===== VALIDAZIONE RISPOSTA =====
            if (!risposta || risposta.length === 0) {
                console.error('❌ [BOT] Risposta vuota generata, uso fallback');
                const fallbackRisposta = config.bot.getFallbackMessage();
                risposta = fallbackRisposta;
                this.stats.erroriValidazione++;
            }

            // ===== INVIA RISPOSTA =====
            console.log(`📤 [BOT] Invio risposta: "${risposta}"`);
            const success = await this.whatsapp.sendMessage(userPhone, risposta);

            if (success) {
                this.stats.messaggiInviati++;
                
                // ===== SALVA RISPOSTA BOT =====
                conversazione.messaggi.push({
                    role: 'assistant',
                    content: risposta,
                    timestamp: new Date(),
                    responseTime: responseTime
                });

                // ===== AGGIORNA CONVERSAZIONE =====
                conversazione.ultimoMessaggio = new Date();
                this.conversazioni.set(userPhone, conversazione);

                // ===== LOG STATO POST-PROCESSING =====
                console.log(`✅ [BOT] PROCESSO COMPLETATO:`);
                console.log(`   📝 Input: "${messageText}"`);
                console.log(`   🎯 Intent: ${intent}`);
                console.log(`   🔄 Step: ${conversazione.currentStep}`);
                console.log(`   📤 Output: "${risposta}"`);
                console.log(`   ⚡ Tempo: ${responseTime}ms`);
                
                // ===== ANALISI COMPLETEZZA =====
                const analysis = this.claude.analyzeConversation(conversazione);
                console.log(`📊 [BOT] ANALISI CONVERSAZIONE:`);
                console.log(`   📈 Completezza: ${analysis.completenessPercentage}%`);
                console.log(`   📋 Dati raccolti:`, analysis.completeness);
                console.log(`   🎯 Step: ${analysis.step}`);
                console.log(`   ✅ Dati validi: ${analysis.isValidData}`);
                
                // 🆕 Log suggerimenti se ci sono
                if (analysis.suggestions && analysis.suggestions.length > 0) {
                    console.log(`💡 [BOT] Suggerimenti: ${analysis.suggestions.join(', ')}`);
                }

                // ===== NOTIFICA APPUNTAMENTO COMPLETATO =====
                if (conversazione.currentStep === config.bot.steps.CONFERMATO && analysis.isComplete) {
                    this.stats.appuntamentiCompletati++;
                    const durata = new Date() - conversazione.startTime;
                    const durataMin = Math.round(durata / 60000);
                    
                    console.log(`\n🎉 [BOT] *** APPUNTAMENTO COMPLETATO! ***`);
                    console.log(`   👤 Cliente: ${analysis.data.nome} (${contactName})`);
                    console.log(`   📧 Email: ${analysis.data.email}`);
                    console.log(`   📅 Data: ${analysis.data.data}`);
                    console.log(`   🕐 Ora: ${analysis.data.ora}`);
                    console.log(`   📱 Telefono: ${userPhone}`);
                    console.log(`   ⏱️ Durata conversazione: ${durataMin} minuti`);
                    console.log(`   💬 Messaggi totali: ${conversazione.messaggi.length}`);
                    console.log(`   ✏️ Modifiche effettuate: ${conversazione.modificheCount}`);
                    console.log(`🎉 *** SUCCESSO! ***\n`);
                }

            } else {
                console.error('❌ [BOT] Invio messaggio fallito');
                this.stats.erroriValidazione++;
            }

        } catch (error) {
            console.error('❌ [BOT] Errore processamento:', error);
            this.stats.erroriValidazione++;
            await this.whatsapp.sendMessage(userPhone, 
                "Ops! C'è stato un problemino tecnico 😅 Riprova o scrivimi di nuovo!");
        }
    }

    // ===== STATS E ANALYTICS =====

    // 🆕 OTTIENI STATISTICHE DETTAGLIATE (MIGLIORATO)
    getDetailedStats() {
        const conversazioni = Array.from(this.conversazioni.values());
        
        // Distribuzione step
        const stepDistribution = {};
        conversazioni.forEach(conv => {
            const step = conv.currentStep || 'unknown';
            stepDistribution[step] = (stepDistribution[step] || 0) + 1;
        });

        // Conversazioni per completezza
        const completenessDistribution = {
            '0%': 0, '25%': 0, '50%': 0, '75%': 0, '100%': 0
        };
        
        // 🆕 Statistiche qualità dati
        const dataQualityStats = {
            validNames: 0,
            validEmails: 0,
            validDates: 0,
            validTimes: 0
        };
        
        // 🆕 Statistiche modifiche
        let totalModifiche = 0;
        let conversazioniConModifiche = 0;
        
        conversazioni.forEach(conv => {
            const analysis = this.claude.analyzeConversation(conv);
            const perc = analysis.completenessPercentage;
            
            // Distribuzione completezza
            if (perc === 0) completenessDistribution['0%']++;
            else if (perc <= 25) completenessDistribution['25%']++;
            else if (perc <= 50) completenessDistribution['50%']++;
            else if (perc <= 75) completenessDistribution['75%']++;
            else completenessDistribution['100%']++;
            
            // Qualità dati
            if (analysis.dataQuality.nome) dataQualityStats.validNames++;
            if (analysis.dataQuality.email) dataQualityStats.validEmails++;
            if (analysis.dataQuality.data) dataQualityStats.validDates++;
            if (analysis.dataQuality.ora) dataQualityStats.validTimes++;
            
            // Statistiche modifiche
            if (conv.modificheCount > 0) {
                conversazioniConModifiche++;
                totalModifiche += conv.modificheCount;
            }
        });

        // Tempo medio per completare appuntamento
        const conversazioniComplete = conversazioni.filter(conv => 
            conv.currentStep === config.bot.steps.CONFERMATO
        );
        
        let tempoMedio = 0;
        if (conversazioniComplete.length > 0) {
            const tempoTotale = conversazioniComplete.reduce((sum, conv) => {
                return sum + (conv.ultimoMessaggio - conv.startTime);
            }, 0);
            tempoMedio = Math.round(tempoTotale / conversazioniComplete.length / 60000); // minuti
        }

        // 🆕 Calcola rate di successo per step
        const stepSuccessRates = {};
        Object.keys(config.bot.steps).forEach(stepName => {
            const stepKey = config.bot.steps[stepName];
            const inStep = stepDistribution[stepKey] || 0;
            const completed = this.stats.appuntamentiCompletati;
            stepSuccessRates[stepKey] = inStep > 0 ? Math.round(completed / inStep * 100) : 0;
        });

        return {
            // Stats generali
            messaggiRicevuti: this.stats.messaggiRicevuti,
            messaggiInviati: this.stats.messaggiInviati,
            conversazioniAttive: this.conversazioni.size,
            appuntamentiCompletati: this.stats.appuntamentiCompletati,
            modificheEffettuate: this.stats.modificheEffettuate,
            erroriValidazione: this.stats.erroriValidazione,
            tempoMedioCompletamento: tempoMedio,
            uptime: Math.round((new Date() - this.stats.ultimoRestart) / 60000),
            
            // Distribuzioni
            stepDistribution: stepDistribution,
            intentDistribution: this.stats.intentStats,
            completenessDistribution: completenessDistribution,
            dataQualityStats: dataQualityStats,
            
            // 🆕 Nuove statistiche
            modificheStats: {
                totale: totalModifiche,
                conversazioniConModifiche: conversazioniConModifiche,
                mediaPerConversazione: conversazioniConModifiche > 0 ? Math.round(totalModifiche / conversazioniConModifiche * 10) / 10 : 0
            },
            
            // Rate di conversione
            conversionRate: this.conversazioni.size > 0 ? 
                Math.round(this.stats.appuntamentiCompletati / this.conversazioni.size * 100) : 0,
                
            // Success rate per step
            stepSuccessRates: stepSuccessRates,
                
            // Top intent
            topIntent: Object.entries(this.stats.intentStats).sort((a, b) => b[1] - a[1])[0] || ['nessuno', 0],
            
            // 🆕 Rate di errore
            errorRate: this.stats.messaggiRicevuti > 0 ? 
                Math.round(this.stats.erroriValidazione / this.stats.messaggiRicevuti * 100) : 0
        };
    }

    // 🆕 OTTIENI STATISTICHE INTENT SPECIFICHE
    getIntentAnalytics() {
        const conversazioni = Array.from(this.conversazioni.values());
        const intentFlow = {};
        
        // Analizza il flusso degli intent
        conversazioni.forEach(conv => {
            conv.messaggi?.forEach((msg, index) => {
                if (msg.role === 'user' && msg.intent) {
                    const intent = msg.intent;
                    if (!intentFlow[intent]) {
                        intentFlow[intent] = {
                            count: 0,
                            successfulCompletions: 0,
                            averagePosition: 0,
                            nextIntents: {}
                        };
                    }
                    
                    intentFlow[intent].count++;
                    intentFlow[intent].averagePosition += index;
                    
                    // Se la conversazione è stata completata, conta come successo
                    if (conv.currentStep === config.bot.steps.CONFERMATO) {
                        intentFlow[intent].successfulCompletions++;
                    }
                    
                    // Analizza intent successivo
                    const nextMsg = conv.messaggi[index + 2]; // +2 per saltare la risposta del bot
                    if (nextMsg && nextMsg.intent) {
                        const nextIntent = nextMsg.intent;
                        intentFlow[intent].nextIntents[nextIntent] = 
                            (intentFlow[intent].nextIntents[nextIntent] || 0) + 1;
                    }
                }
            });
        });
        
        // Calcola medie
        Object.keys(intentFlow).forEach(intent => {
            if (intentFlow[intent].count > 0) {
                intentFlow[intent].averagePosition = Math.round(
                    intentFlow[intent].averagePosition / intentFlow[intent].count
                );
                intentFlow[intent].successRate = Math.round(
                    intentFlow[intent].successfulCompletions / intentFlow[intent].count * 100
                );
            }
        });
        
        return intentFlow;
    }

    // Cleanup conversazioni vecchie (24h)
    cleanupOldConversations() {
        const now = new Date();
        const CLEANUP_HOURS = 24;
        let cleaned = 0;

        for (const [phone, conv] of this.conversazioni) {
            const hoursDiff = (now - conv.ultimoMessaggio) / (1000 * 60 * 60);
            if (hoursDiff > CLEANUP_HOURS) {
                // Log se era un appuntamento in corso
                if (conv.currentStep !== config.bot.steps.START && conv.currentStep !== config.bot.steps.CONFERMATO) {
                    console.log(`🗑️ [BOT] Cleanup conversazione incompleta: ${phone} (step: ${conv.currentStep})`);
                }
                this.conversazioni.delete(phone);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            console.log(`🗑️ [BOT] Cleanup completato: ${cleaned} conversazioni rimosse`);
        }
        
        return cleaned;
    }

    // ===== TEST E DEBUG =====

    // 🆕 TEST COMPLETO DEL BOT (MIGLIORATO)
    async testBot() {
        console.log('\n🧪 [BOT] *** AVVIO TEST COMPLETO ***');
        
        try {
            // Test configurazione
            console.log('⚙️ [BOT] Test configurazione...');
            const configTest = config.validate();
            console.log(`⚙️ [BOT] Config: ${configTest.isValid ? '✅' : '❌'}`);
            if (!configTest.isValid) {
                console.log('❌ [BOT] Errori config:', configTest.errors);
            }
            
            // Test WhatsApp
            console.log('📱 [BOT] Test WhatsApp API...');
            const whatsappTest = await this.whatsapp.testConnection();
            console.log(`📱 [BOT] WhatsApp: ${whatsappTest.success ? '✅' : '❌'}`);
            if (!whatsappTest.success) {
                console.log('❌ [BOT] Errore WhatsApp:', whatsappTest.message);
            }
            
            // Test Claude e sistema intent
            console.log('🤖 [BOT] Test Claude e sistema intent...');
            const claudeTest = await this.claude.testConnection();
            console.log(`🤖 [BOT] Claude: ${claudeTest.success ? '✅' : '❌'}`);
            if (!claudeTest.success) {
                console.log('❌ [BOT] Errore Claude:', claudeTest.error);
            }
            
            // 🆕 Test sistema di intent migliorato
            console.log('🎯 [BOT] Test riconoscimento intent...');
            const intentTests = [
                { message: 'Ciao', expected: 'saluto' },
                { message: 'Che servizi offrite?', expected: 'servizi' },
                { message: 'Vorrei un appuntamento', expected: 'appuntamento' },
                { message: 'sì perfetto', expected: 'conferma' },
                { message: 'modifica email', expected: 'modifica_email' },
                { message: 'cambia data', expected: 'modifica_data' },
                { message: 'ricomincia', expected: 'ricomincia' }
            ];
            
            let intentSuccess = 0;
            intentTests.forEach(test => {
                const detected = config.bot.detectIntent(test.message);
                const success = detected === test.expected;
                console.log(`   "${test.message}" → ${detected} ${success ? '✅' : '❌'}`);
                if (success) intentSuccess++;
            });
            
            const intentScore = Math.round(intentSuccess / intentTests.length * 100);
            console.log(`🎯 [BOT] Intent recognition: ${intentScore}% (${intentSuccess}/${intentTests.length})`);
            
            // 🆕 Test flusso modifiche
            console.log('✏️ [BOT] Test flusso modifiche...');
            const testModificheResult = await this.testModificationFlow();
            console.log(`✏️ [BOT] Modifiche: ${testModificheResult.success ? '✅' : '❌'}`);
            
            // Risultato finale
            const overallSuccess = configTest.isValid && whatsappTest.success && claudeTest.success && 
                                 intentScore >= 75 && testModificheResult.success;
            
            console.log(`\n🎯 [BOT] *** RISULTATO TEST: ${overallSuccess ? '✅ TUTTO OK!' : '❌ CI SONO PROBLEMI'} ***`);
            console.log(`📊 [BOT] Config: ${configTest.isValid ? '✅' : '❌'} | WhatsApp: ${whatsappTest.success ? '✅' : '❌'} | Claude: ${claudeTest.success ? '✅' : '❌'} | Intent: ${intentScore}% | Modifiche: ${testModificheResult.success ? '✅' : '❌'}`);
            
            if (overallSuccess) {
                console.log('🚀 [BOT] Bot pronto per ricevere messaggi!\n');
            } else {
                console.log('⚠️ [BOT] Risolvi i problemi prima di usare il bot.\n');
            }
            
            return {
                success: overallSuccess,
                details: {
                    config: configTest,
                    whatsapp: whatsappTest,
                    claude: claudeTest,
                    intentScore: intentScore,
                    modifiche: testModificheResult
                }
            };
            
        } catch (error) {
            console.error('❌ [BOT] Errore durante test:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // 🆕 TEST SPECIFICO PER FLUSSO MODIFICHE
    async testModificationFlow() {
        try {
            console.log('🧪 [BOT] Test flusso modifiche...');
            
            // Simula conversazione fino al riepilogo
            const testPhone = '+391234567891';
            const conversazione = {
                messaggi: [],
                datiCliente: {
                    nome: 'Test User',
                    email: 'test@email.com',
                    data: 'lunedì',
                    ora: '15:00'
                },
                currentStep: config.bot.steps.RIEPILOGO,
                whatsappNumber: testPhone,
                contactName: 'Test Modifiche',
                startTime: new Date(),
                modificheCount: 0
            };
            
            // Test modifica email
            console.log('🧪 [BOT] Test modifica email...');
            const emailModifica = await this.claude.generateResponse(conversazione, 'modifica email');
            console.log(`✅ [BOT] Risposta modifica email: "${emailModifica.substring(0, 50)}..."`);
            
            // Verifica che il step sia cambiato correttamente
            const emailStepOk = conversazione.currentStep === config.bot.steps.EMAIL;
            console.log(`📊 [BOT] Step email corretto: ${emailStepOk ? '✅' : '❌'}`);
            
            // Test inserimento nuovo email
            const nuovoEmail = await this.claude.generateResponse(conversazione, 'nuovo@test.com');
            console.log(`✅ [BOT] Nuovo email: "${nuovoEmail.substring(0, 50)}..."`);
            
            const emailSuccess = emailStepOk && conversazione.datiCliente.email === 'nuovo@test.com';
            
            return {
                success: emailSuccess,
                details: {
                    emailStepOk: emailStepOk,
                    emailUpdated: conversazione.datiCliente.email === 'nuovo@test.com'
                }
            };
            
        } catch (error) {
            console.error('❌ [BOT] Errore test modifiche:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Simula conversazione per testing
    async simulateConversation() {
        console.log('🎭 [BOT] Simulazione conversazione completa...');
        
        const testPhone = '+391234567890';
        const steps = [
            'Ciao!',
            'Marco Rossi', 
            'marco.rossi@email.com',
            'martedì',
            '15:00',
            'sì'
        ];
        
        for (let i = 0; i < steps.length; i++) {
            console.log(`\n--- STEP ${i + 1}: "${steps[i]}" ---`);
            
            const messageData = {
                from: testPhone,
                text: steps[i],
                contactName: 'Test User'
            };
            
            await this.processMessage(messageData);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Pausa tra messaggi
        }
        
        console.log('\n🎭 [BOT] Simulazione completata!');
        return this.conversazioni.get(testPhone);
    }

    // 🆕 SIMULA CONVERSAZIONE CON MODIFICHE
    async simulateConversationWithModifications() {
        console.log('🎭 [BOT] Simulazione conversazione con modifiche...');
        
        const testPhone = '+391234567892';
        const steps = [
            'Ciao!',
            'appuntamento',
            'Mario Bianchi', 
            'mario@test.com',
            'mercoledì',
            '14:00',
            'modifica email',  // Richiesta modifica
            'mario.bianchi@nuova.com',  // Nuovo email
            'cambia ora',      // Altra modifica
            '16:30',           // Nuova ora
            'sì'               // Conferma finale
        ];
        
        for (let i = 0; i < steps.length; i++) {
            console.log(`\n--- STEP ${i + 1}: "${steps[i]}" ---`);
            
            const messageData = {
                from: testPhone,
                text: steps[i],
                contactName: 'Test Modifiche'
            };
            
            await this.processMessage(messageData);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Pausa tra messaggi
        }
        
        console.log('\n🎭 [BOT] Simulazione con modifiche completata!');
        const finalConv = this.conversazioni.get(testPhone);
        console.log(`📊 [BOT] Modifiche effettuate: ${finalConv.modificheCount}`);
        return finalConv;
    }

    // Reset stats
    resetStats() {
        this.stats = {
            messaggiRicevuti: 0,
            messaggiInviati: 0,
            appuntamentiCompletati: 0,
            intentStats: {},
            modificheEffettuate: 0,
            erroriValidazione: 0,
            ultimoRestart: new Date()
        };
        console.log('🔄 [BOT] Statistiche resettate');
    }

    // Reset conversazione specifica
    resetConversation(phoneNumber) {
        if (this.conversazioni.has(phoneNumber)) {
            this.conversazioni.delete(phoneNumber);
            console.log(`🔄 [BOT] Reset conversazione: ${phoneNumber}`);
            return true;
        }
        console.log(`⚠️ [BOT] Conversazione non trovata: ${phoneNumber}`);
        return false;
    }

    // 🆕 RESET CONVERSAZIONE CON MANTENIMENTO DATI PARZIALI
    resetConversationToStep(phoneNumber, targetStep) {
        if (this.conversazioni.has(phoneNumber)) {
            const conv = this.conversazioni.get(phoneNumber);
            conv.currentStep = targetStep;
            
            // Reset dati successivi al target step
            switch (targetStep) {
                case config.bot.steps.NOME:
                    conv.datiCliente = {};
                    break;
                case config.bot.steps.EMAIL:
                    delete conv.datiCliente.email;
                    delete conv.datiCliente.data;
                    delete conv.datiCliente.ora;
                    break;
                case config.bot.steps.DATA:
                    delete conv.datiCliente.data;
                    delete conv.datiCliente.ora;
                    break;
                case config.bot.steps.ORA:
                    delete conv.datiCliente.ora;
                    break;
            }
            
            console.log(`🔄 [BOT] Reset conversazione ${phoneNumber} a step: ${targetStep}`);
            return true;
        }
        console.log(`⚠️ [BOT] Conversazione non trovata: ${phoneNumber}`);
        return false;
    }

    // 🆕 OTTIENI REPORT CONVERSAZIONE
    getConversationReport(phoneNumber) {
        if (this.conversazioni.has(phoneNumber)) {
            const conv = this.conversazioni.get(phoneNumber);
            const analysis = this.claude.analyzeConversation(conv);
            
            return {
                basic: {
                    phone: phoneNumber,
                    contactName: conv.contactName,
                    currentStep: conv.currentStep,
                    messageCount: conv.messaggi.length,
                    duration: Math.round((new Date() - conv.startTime) / 60000),
                    modifications: conv.modificheCount || 0
                },
                data: conv.datiCliente,
                analysis: analysis,
                messages: conv.messaggi.map(msg => ({
                    role: msg.role,
                    content: msg.content.substring(0, 100),
                    intent: msg.intent,
                    timestamp: msg.timestamp
                }))
            };
        }
        
        return null;
    }
}

module.exports = WhatsAppBot;