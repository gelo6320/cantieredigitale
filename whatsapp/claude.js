// ============================================
// 📁 whatsapp/claude.js - VERSIONE SEMPLIFICATA
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
            
            // ===== LOGICA SEMPLIFICATA =====
            
            // 1. Estrai dati dal messaggio
            config.bot.extractData(conversazione, messaggioUtente);
            
            // 2. Aggiorna step
            config.bot.updateStep(conversazione, messaggioUtente);
            
            // 3. Se appuntamento completo e confermato, salva
            if (conversazione.currentStep === config.bot.steps.CONFERMATO && 
                config.bot.isAppointmentComplete(conversazione)) {
                
                const saveResult = await this.saveAppointment(conversazione);
                if (saveResult.success) {
                    console.log('✅ [CLAUDE] Appuntamento salvato con successo');
                } else {
                    console.error('❌ [CLAUDE] Errore salvataggio:', saveResult.error);
                }
            }
            
            // 4. Ottieni messaggio da inviare
            const risposta = config.bot.getNextMessage(conversazione, messaggioUtente);
            
            console.log(`📤 [CLAUDE] Risposta: "${risposta}"`);
            console.log(`📊 [CLAUDE] Step: ${conversazione.currentStep}`);
            console.log(`📊 [CLAUDE] Dati: ${JSON.stringify(conversazione.datiCliente, null, 2)}`);
            
            return risposta;

        } catch (error) {
            console.error('❌ [CLAUDE] Errore:', error.message);
            return config.bot.getFallbackMessage();
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
                source: 'whatsapp_bot'
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
        
        // Aggiungi ultimi 4 messaggi per contesto
        const recentMessages = conversazione.messaggi.slice(-4);
        
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

        return messaggi;
    }

    async testConnection() {
        try {
            console.log('🧪 [CLAUDE] Test connessione...');
            
            const testConversazione = {
                messaggi: [],
                datiCliente: {},
                currentStep: config.bot.steps.START,
                whatsappNumber: '+391234567890'
            };

            const response = await this.generateResponse(testConversazione, 'Ciao');
            
            console.log('✅ [CLAUDE] Test OK');
            console.log(`📤 [CLAUDE] Risposta test: "${response}"`);
            
            return { 
                success: true, 
                message: 'Bot funzionante',
                response: response
            };

        } catch (error) {
            console.error('❌ [CLAUDE] Test fallito:', error.message);
            return { 
                success: false, 
                error: error.message 
            };
        }
    }
}

module.exports = ClaudeService;