// ============================================
// 📁 whatsapp/claude.js - LOGICA SEMPLIFICATA
// ============================================
const axios = require('axios');
const mongoose = require('mongoose');
const config = require('./config');

class ClaudeService {
    constructor() {
        this.apiKey = config.claude.apiKey;
        this.model = config.claude.model;
        this.baseURL = 'https://api.anthropic.com/v1/messages';
        this.setupDatabase();
    }

    // Setup database - usa schema esistente dal server principale
    setupDatabase() {
        // Il database è già connesso nel server principale
        console.log('✅ [DATABASE] Uso connessione esistente');
        
        // Usa SEMPRE il modello Booking esistente dal server principale
        this.Booking = mongoose.model('Booking');
        console.log('✅ [DATABASE] Schema Booking esistente utilizzato');
    }

    async generateResponse(conversazione, messaggioUtente) {
        try {
            console.log(`🤖 [CLAUDE] Generazione risposta per: "${messaggioUtente}"`);
            
            // 1. Rileva intent
            const intent = config.bot.detectIntent(messaggioUtente);
            console.log(`🎯 [CLAUDE] Intent: ${intent}`);
            
            // 2. Estrai dati se necessario
            config.bot.extractData(conversazione, messaggioUtente);
            
            // 3. Ottieni risposta
            const risposta = this.getResponse(conversazione, intent);
            
            console.log(`📤 [CLAUDE] Risposta: "${risposta}"`);
            return risposta;

        } catch (error) {
            console.error('❌ [CLAUDE] Errore:', error.message);
            return config.bot.messages.errore;
        }
    }

    getResponse(conversazione, intent) {
        const step = conversazione.currentStep;
        const dati = conversazione.datiCliente;
        
        // STEP START - Prima interazione
        if (step === config.bot.steps.START) {
            if (intent === 'saluto' || intent === 'appuntamento') {
                conversazione.currentStep = config.bot.steps.NOME;
                return config.bot.messages.saluto;
            }
            if (intent === 'servizi') {
                return config.bot.messages.servizi;
            }
            return config.bot.messages.saluto;
        }

        // STEP NOME - Raccolta nome
        if (step === config.bot.steps.NOME) {
            if (intent === 'ricomincia') {
                conversazione.datiCliente = {};
                return config.bot.messages.chiedi_nome;
            }
            if (dati.nome) {
                conversazione.currentStep = config.bot.steps.EMAIL;
                return config.bot.processTemplate(config.bot.messages.chiedi_email, dati);
            }
            return config.bot.messages.chiedi_nome;
        }

        // STEP EMAIL - Raccolta email  
        if (step === config.bot.steps.EMAIL) {
            if (intent === 'ricomincia') {
                conversazione.currentStep = config.bot.steps.NOME;
                conversazione.datiCliente = {};
                return config.bot.messages.chiedi_nome;
            }
            if (dati.email) {
                conversazione.currentStep = config.bot.steps.DATA;
                return config.bot.messages.chiedi_data;
            }
            return config.bot.processTemplate(config.bot.messages.chiedi_email, dati);
        }

        // STEP DATA - Raccolta data
        if (step === config.bot.steps.DATA) {
            if (intent === 'ricomincia') {
                conversazione.currentStep = config.bot.steps.NOME;
                conversazione.datiCliente = {};
                return config.bot.messages.chiedi_nome;
            }
            if (dati.data) {
                conversazione.currentStep = config.bot.steps.ORA;
                return config.bot.messages.chiedi_ora;
            }
            return config.bot.messages.chiedi_data;
        }

        // STEP ORA - Raccolta ora
        if (step === config.bot.steps.ORA) {
            if (intent === 'ricomincia') {
                conversazione.currentStep = config.bot.steps.NOME;
                conversazione.datiCliente = {};
                return config.bot.messages.chiedi_nome;
            }
            if (dati.ora) {
                // PASSAGGIO AUTOMATICO A RIEPILOGO
                conversazione.currentStep = config.bot.steps.RIEPILOGO;
                return config.bot.processTemplate(config.bot.messages.riepilogo, dati);
            }
            return config.bot.messages.chiedi_ora;
        }

        // STEP RIEPILOGO - Conferma finale
        if (step === config.bot.steps.RIEPILOGO) {
            if (intent === 'conferma') {
                conversazione.currentStep = config.bot.steps.CONFERMATO;
                this.saveAppointment(conversazione);
                return config.bot.processTemplate(config.bot.messages.confermato, dati);
            }
            if (intent === 'rifiuto') {
                return config.bot.messages.rifiuto_finale;
            }
            if (intent === 'ricomincia') {
                conversazione.currentStep = config.bot.steps.NOME;
                conversazione.datiCliente = {};
                return config.bot.messages.chiedi_nome;
            }
            // Se non è una conferma, ripeti il riepilogo
            return config.bot.processTemplate(config.bot.messages.riepilogo, dati);
        }

        // STEP CONFERMATO - Fine conversazione
        if (step === config.bot.steps.CONFERMATO) {
            return "Grazie! Ti ricontatteremo presto per la consulenza. 🏗️";
        }

        // Fallback
        return config.bot.messages.errore;
    }

    async saveAppointment(conversazione) {
        try {
            const dati = conversazione.datiCliente;
            
            console.log('🗓️ [CLAUDE] Salvataggio appuntamento...');
            
            // Crea data timestamp per bookingTimestamp
            const now = new Date();
            
            // Usa lo schema BookingSchema esistente
            const booking = new this.Booking({
                name: dati.nome,
                email: dati.email,
                phone: conversazione.whatsappNumber,
                message: `Appuntamento fissato tramite WhatsApp Bot per consulenza marketing`,
                bookingDate: dati.data,
                bookingTime: dati.ora,
                bookingTimestamp: now,
                status: 'confirmed',
                value: 0, // Consultazione gratuita
                service: 'Consulenza Marketing per Imprese Edili',
                source: 'WhatsApp Bot - Costruzione Digitale',
                viewed: false
            });
            
            const savedBooking = await booking.save();
            
            console.log(`✅ [CLAUDE] Appuntamento salvato: ${savedBooking._id}`);
            console.log(`   👤 Nome: ${dati.nome}`);
            console.log(`   📧 Email: ${dati.email}`);
            console.log(`   📅 Data: ${dati.data}`);
            console.log(`   🕐 Ora: ${dati.ora}`);
            console.log(`   📱 Telefono: ${conversazione.whatsappNumber}`);
            console.log(`   🏢 Servizio: Consulenza Marketing per Imprese Edili`);
            
            return { success: true, id: savedBooking._id };
            
        } catch (error) {
            console.error('❌ [CLAUDE] Errore salvataggio:', error.message);
            console.error('❌ [CLAUDE] Stack:', error.stack);
            return { success: false, error: error.message };
        }
    }

    async testConnection() {
        try {
            console.log('🧪 [CLAUDE] Test connessione...');
            
            if (!this.apiKey) {
                throw new Error('CLAUDE_API_KEY mancante');
            }
            
            console.log('✅ [CLAUDE] Configurazione OK');
            return { success: true, message: 'Claude configurato correttamente' };

        } catch (error) {
            console.error('❌ [CLAUDE] Test fallito:', error.message);
            return { success: false, error: error.message };
        }
    }
}

module.exports = ClaudeService;