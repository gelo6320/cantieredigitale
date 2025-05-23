// ============================================
// 📁 whatsapp/claude.js - CON SISTEMA INTENT
// ============================================
const axios = require('axios');
const config = require('./config');

class ClaudeService {
    constructor() {
        this.apiKey = config.claude.apiKey;
        this.model = config.claude.model;
        this.baseURL = 'https://api.anthropic.com/v1/messages';
        this.maxTokens = config.claude.maxTokens;
        this.timeout = config.claude.timeout;
    }

    async generateResponse(conversazione, messaggioUtente) {
        try {
            console.log(`🤖 [CLAUDE] Generazione risposta per: "${messaggioUtente}"`);
            
            // ===== SISTEMA INTENT =====
            
            // 1. Rileva intent del messaggio
            const intent = config.bot.detectIntent(messaggioUtente);
            console.log(`🎯 [CLAUDE] Intent rilevato: ${intent}`);
            
            // 2. Estrai dati dal messaggio se necessario
            config.bot.extractData(conversazione, messaggioUtente);
            
            // 3. Aggiorna step basato su intent
            config.bot.updateStepByIntent(conversazione, messaggioUtente, intent);
            
            // 4. Ottieni risposta basata su intent e step
            let risposta = config.bot.getResponseByIntent(conversazione, messaggioUtente, intent);
            
            // ===== GESTIONE APPUNTAMENTO COMPLETO =====
            
            // Se step è CONFERMATO e abbiamo tutti i dati, salva
            if (conversazione.currentStep === config.bot.steps.CONFERMATO && 
                config.bot.isAppointmentComplete(conversazione)) {
                
                console.log('🗓️ [CLAUDE] Tentativo salvataggio appuntamento...');
                const saveResult = await this.saveAppointment(conversazione);
                
                if (saveResult.success) {
                    console.log('✅ [CLAUDE] Appuntamento salvato con successo');
                    // Usa messaggio di conferma personalizzato
                    risposta = config.bot.processTemplate(
                        config.bot.messages.appuntamento_confermato, 
                        conversazione.datiCliente
                    );
                } else {
                    console.error('❌ [CLAUDE] Errore salvataggio:', saveResult.error);
                    risposta = "🎉 Appuntamento confermato! (Salvataggio in corso...) Ti ricontatteremo presto!";
                }
            }
            
            // ===== RIEPILOGO AUTOMATICO =====
            
            // Se abbiamo tutti i dati ma siamo ancora nell'ORA step, mostra riepilogo
            if (conversazione.currentStep === config.bot.steps.ORA && 
                config.bot.isAppointmentComplete(conversazione)) {
                
                conversazione.currentStep = config.bot.steps.RIEPILOGO;
                risposta = config.bot.processTemplate(
                    config.bot.messages.riepilogo, 
                    conversazione.datiCliente
                );
            }
            
            // ===== USO CLAUDE PER RISPOSTE COMPLESSE =====
            
            // Solo per conversazioni generali o quando serve più intelligenza
            if (intent === 'generale' && conversazione.currentStep === config.bot.steps.CONVERSAZIONE) {
                console.log('🤖 [CLAUDE] Usando Claude API per risposta intelligente...');
                
                const claudeResponse = await this.getClaudeResponse(conversazione, messaggioUtente);
                if (claudeResponse) {
                    risposta = claudeResponse;
                }
            }
            
            console.log(`📤 [CLAUDE] Risposta finale: "${risposta}"`);
            console.log(`📊 [CLAUDE] Step: ${conversazione.currentStep}`);
            console.log(`📊 [CLAUDE] Dati raccolti:`, conversazione.datiCliente);
            
            return risposta;

        } catch (error) {
            console.error('❌ [CLAUDE] Errore:', error.message);
            return config.bot.getFallbackMessage();
        }
    }

    async getClaudeResponse(conversazione, messaggioUtente) {
        try {
            // Genera prompt di sistema
            const systemPrompt = config.bot.generateSystemPrompt(conversazione);
            
            // Prepara messaggi per Claude
            const messaggi = this.prepareMessages(conversazione);

            const requestPayload = {
                model: this.model,
                max_tokens: this.maxTokens,
                system: systemPrompt,
                messages: messaggi
            };

            console.log(`📤 [CLAUDE] Chiamata Claude API per risposta intelligente...`);

            const response = await axios.post(this.baseURL, requestPayload, {
                headers: {
                    'x-api-key': this.apiKey,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json'
                },
                timeout: this.timeout
            });

            const claudeResponse = response.data.content[0].text;
            console.log(`✅ [CLAUDE] Risposta Claude ricevuta: "${claudeResponse.substring(0, 100)}..."`);
            
            return claudeResponse;

        } catch (error) {
            console.error('❌ [CLAUDE] Errore chiamata Claude API:', error.message);
            
            if (error.response) {
                console.error('📊 [CLAUDE] Status:', error.response.status);
                console.error('📊 [CLAUDE] Error:', error.response.data);
            }
            
            return null; // Fallback ai messaggi predefiniti
        }
    }

    async saveAppointment(conversazione) {
        try {
            const dati = conversazione.datiCliente;
            
            console.log('🗓️ [CLAUDE] Salvataggio appuntamento...');
            console.log(`   👤 Nome: ${dati.nome}`);
            console.log(`   📧 Email: ${dati.email}`);
            console.log(`   📅 Data: ${dati.data}`);
            console.log(`   🕐 Ora: ${dati.ora}`);
            console.log(`   📱 Telefono: ${conversazione.whatsappNumber}`);
            
            // Schema MongoDB semplificato
            const mongoose = require('mongoose');
            
            const AppointmentSchema = new mongoose.Schema({
                customerName: String,
                customerEmail: String,
                phoneNumber: String,
                appointmentDate: String,
                appointmentTime: String,
                status: { type: String, default: 'confirmed' },
                source: { type: String, default: 'whatsapp_bot' },
                businessName: { type: String, default: config.business.name },
                createdAt: { type: Date, default: Date.now }
            });
            
            let Appointment;
            try {
                Appointment = mongoose.model('Appointment');
            } catch (e) {
                Appointment = mongoose.model('Appointment', AppointmentSchema);
            }
            
            const newAppointment = new Appointment({
                customerName: dati.nome,
                customerEmail: dati.email,
                phoneNumber: conversazione.whatsappNumber,
                appointmentDate: dati.data,
                appointmentTime: dati.ora,
                status: 'confirmed',
                source: 'whatsapp_bot',
                businessName: config.business.name
            });
            
            await newAppointment.save();
            
            console.log('✅ [CLAUDE] Appuntamento salvato:', newAppointment._id);
            
            return {
                success: true,
                appointmentId: newAppointment._id
            };
            
        } catch (error) {
            console.error('❌ [CLAUDE] Errore salvataggio:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    prepareMessages(conversazione) {
        const messaggi = [];
        
        // Aggiungi ultimi 6 messaggi per contesto
        const recentMessages = conversazione.messaggi.slice(-6);
        
        recentMessages.forEach(msg => {
            if (msg.role === 'user' || msg.role === 'assistant') {
                messaggi.push({
                    role: msg.role,
                    content: msg.content
                });
            }
        });

        // Se non ci sono messaggi, inizia con saluto
        if (messaggi.length === 0) {
            messaggi.push({
                role: 'user',
                content: 'Ciao'
            });
        }

        // Assicurati che il primo sia dell'utente
        if (messaggi[0].role !== 'user') {
            messaggi.unshift({
                role: 'user',
                content: 'Ciao'
            });
        }

        console.log(`📋 [CLAUDE] Messaggi preparati: ${messaggi.length}`);
        return messaggi;
    }

    async testConnection() {
        try {
            console.log('🧪 [CLAUDE] Test connessione e sistema intent...');
            
            // Test configurazione
            if (!this.apiKey) {
                throw new Error('CLAUDE_API_KEY mancante');
            }
            
            // Test conversazione completa
            const testConversazione = {
                messaggi: [],
                datiCliente: {},
                currentStep: config.bot.steps.START,
                whatsappNumber: '+391234567890'
            };

            // Test diversi intent
            console.log('🧪 [CLAUDE] Test intent saluto...');
            const salutoResponse = await this.generateResponse(testConversazione, 'Ciao');
            console.log(`✅ [CLAUDE] Saluto: "${salutoResponse}"`);
            
            // Simula raccolta dati
            testConversazione.currentStep = config.bot.steps.NOME;
            const nomeResponse = await this.generateResponse(testConversazione, 'Marco');
            console.log(`✅ [CLAUDE] Nome: "${nomeResponse}"`);
            
            // Test intent servizi
            const testConv2 = { ...testConversazione, currentStep: config.bot.steps.CONVERSAZIONE };
            const serviziResponse = await this.generateResponse(testConv2, 'Che servizi offrite?');
            console.log(`✅ [CLAUDE] Servizi: "${serviziResponse.substring(0, 100)}..."`);
            
            console.log('✅ [CLAUDE] Test completo superato!');
            
            return { 
                success: true, 
                message: 'Sistema intent funzionante',
                tests: {
                    saluto: salutoResponse,
                    nome: nomeResponse,
                    servizi: serviziResponse.substring(0, 50) + '...'
                }
            };

        } catch (error) {
            console.error('❌ [CLAUDE] Test fallito:', error.message);
            return { 
                success: false, 
                error: error.message 
            };
        }
    }

    // ===== UTILITY METHODS =====

    // Analizza completezza conversazione
    analyzeConversation(conversazione) {
        const dati = conversazione.datiCliente || {};
        const step = conversazione.currentStep || config.bot.steps.START;
        const messaggi = conversazione.messaggi?.length || 0;
        
        const completeness = {
            nome: !!dati.nome,
            email: !!dati.email,
            data: !!dati.data,
            ora: !!dati.ora
        };
        
        const completenessPercentage = Object.values(completeness).filter(Boolean).length / 4 * 100;
        
        return {
            step: step,
            completeness: completeness,
            completenessPercentage: Math.round(completenessPercentage),
            isComplete: config.bot.isAppointmentComplete(conversazione),
            messageCount: messaggi,
            data: dati
        };
    }

    // Reset conversazione mantenendo WhatsApp number
    resetConversation(conversazione) {
        const whatsappNumber = conversazione.whatsappNumber;
        
        conversazione.messaggi = [];
        conversazione.datiCliente = {};
        conversazione.currentStep = config.bot.steps.START;
        conversazione.ultimoMessaggio = new Date();
        conversazione.whatsappNumber = whatsappNumber; // Mantieni numero
        
        console.log('🔄 [CLAUDE] Conversazione resettata');
        return conversazione;
    }

    // Ottieni statistiche intent
    getIntentStats(conversazioni) {
        const stats = {};
        
        for (const [intent, keywords] of Object.entries(config.bot.keywords)) {
            stats[intent] = 0;
        }
        
        // Analizza messaggi per calcolare intent più comuni
        conversazioni.forEach(conv => {
            conv.messaggi?.forEach(msg => {
                if (msg.role === 'user') {
                    const intent = config.bot.detectIntent(msg.content);
                    stats[intent] = (stats[intent] || 0) + 1;
                }
            });
        });
        
        return stats;
    }
}

module.exports = ClaudeService;