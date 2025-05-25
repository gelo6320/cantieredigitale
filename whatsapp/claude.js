// ============================================
// 📁 whatsapp/claude.js - SERVIZIO AI-ENHANCED
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
    async setupDatabase() {
        try {
            const bookingDBUrl = process.env.MONGODB_URI_BOOKING || config.database.mongoUrl;
            
            console.log(`🔗 [DATABASE] Connessione dedicata al database booking: ${bookingDBUrl}`);
            
            this.bookingConnection = mongoose.createConnection(bookingDBUrl, {
                useNewUrlParser: true,
                useUnifiedTopology: true
            });
            
            await this.bookingConnection.asPromise();
            console.log('✅ [DATABASE] Connesso al database booking');
    
            let BookingModel;
            try {
                BookingModel = mongoose.model('Booking');
                this.Booking = this.bookingConnection.model('Booking', BookingModel.schema);
                console.log('✅ [DATABASE] Schema Booking registrato sulla connessione booking');
            } catch (error) {
                console.error('❌ [DATABASE] Modello Booking non trovato nella connessione principale');
                throw new Error('Server principale non avviato o modello Booking non definito');
            }
            
        } catch (error) {
            console.error('❌ [DATABASE] Errore setup:', error.message);
            throw error;
        }
    }

    async generateResponse(conversazione, messaggioUtente) {
        try {
            // Assicurati che il database sia pronto
            if (!this.Booking) {
                await this.setupDatabase();
            }
            
            console.log(`🤖 [CLAUDE] Generazione risposta AI per: "${messaggioUtente}"`);
            
            // Costruisci il prompt contestuale
            const prompt = this.buildContextualPrompt(conversazione, messaggioUtente);
            
            // Chiama l'API di Claude
            const claudeResponse = await this.callClaudeAPI(prompt);
            
            // Processa la risposta e aggiorna lo stato della conversazione
            const processedResponse = this.processClaudeResponse(claudeResponse, conversazione, messaggioUtente);
            
            console.log(`📤 [CLAUDE] Risposta AI: "${processedResponse.message}"`);
            console.log(`📊 [CLAUDE] Nuovo step: ${conversazione.currentStep}`);
            
            return processedResponse.message;

        } catch (error) {
            console.error('❌ [CLAUDE] Errore AI:', error.message);
            return this.getFallbackResponse(conversazione);
        }
    }

    buildContextualPrompt(conversazione, messaggioUtente) {
        const dati = conversazione.datiCliente;
        const step = conversazione.currentStep;
        const storicoMessaggi = conversazione.messaggi.slice(-6); // Ultimi 6 messaggi per contesto
        
        let storicoString = "";
        if (storicoMessaggi.length > 0) {
            storicoString = "\nStorico conversazione recente:\n" + 
                storicoMessaggi.map(msg => `${msg.role === 'user' ? 'Cliente' : 'Sofia'}: ${msg.content}`).join('\n');
        }

        const prompt = `${config.bot.systemPrompt}

STATO CONVERSAZIONE:
- Step attuale: ${step}
- Dati raccolti: ${JSON.stringify(dati, null, 2)}
- Dati mancanti: ${this.getMissingData(dati)}

${storicoString}

MESSAGGIO CLIENTE: "${messaggioUtente}"

ISTRUZIONI SPECIFICHE:
1. Se è il primo messaggio (step START), presenta l'azienda e verifica l'interesse
2. Se il cliente chiede informazioni sui servizi, rispondi in modo dettagliato usando le info aziendali
3. Se il cliente è interessato ma mancano dati, chiedi il prossimo dato necessario
4. Se tutti i dati sono raccolti, proponi il riepilogo per conferma
5. Mantieni un tono professionale ma cordiale
6. Risposte massimo 2-3 frasi per mantenere la conversazione fluida

IMPORTANTE: Alla fine della tua risposta, includi su una riga separata:
NEXT_STEP: [nuovo_step]
EXTRACTED_DATA: {json_con_eventuali_dati_estratti}

Rispondi ora come Sofia:`;

        return prompt;
    }

    getMissingData(dati) {
        const required = ['nome', 'email', 'data', 'ora'];
        const missing = required.filter(field => !dati[field]);
        return missing.length > 0 ? missing.join(', ') : 'nessuno';
    }

    async callClaudeAPI(prompt) {
        try {
            const response = await axios.post(this.baseURL, {
                model: this.model,
                max_tokens: config.claude.maxTokens,
                messages: [{
                    role: 'user',
                    content: prompt
                }]
            }, {
                headers: {
                    'x-api-key': this.apiKey,
                    'Content-Type': 'application/json',
                    'anthropic-version': '2023-06-01'
                },
                timeout: config.claude.timeout
            });

            return response.data.content[0].text;

        } catch (error) {
            console.error('❌ [CLAUDE] Errore API Claude:', error.message);
            
            if (error.response?.data) {
                console.error('📊 [CLAUDE] Dettagli errore:', error.response.data);
            }
            
            throw new Error(`Claude API error: ${error.message}`);
        }
    }

    processClaudeResponse(claudeResponse, conversazione, messaggioUtente) {
        // Estrai la risposta principale e i metadata
        const lines = claudeResponse.split('\n');
        let message = '';
        let nextStep = null;
        let extractedData = {};

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            if (line.startsWith('NEXT_STEP:')) {
                nextStep = line.replace('NEXT_STEP:', '').trim();
            } else if (line.startsWith('EXTRACTED_DATA:')) {
                try {
                    const dataStr = line.replace('EXTRACTED_DATA:', '').trim();
                    if (dataStr && dataStr !== '{}') {
                        extractedData = JSON.parse(dataStr);
                    }
                } catch (e) {
                    console.warn('⚠️ [CLAUDE] Errore parsing extracted data:', e.message);
                }
            } else if (!line.startsWith('NEXT_STEP:') && !line.startsWith('EXTRACTED_DATA:')) {
                message += line + '\n';
            }
        }

        message = message.trim();

        // Aggiorna lo step se specificato
        if (nextStep && config.bot.steps[nextStep.toUpperCase()]) {
            conversazione.currentStep = config.bot.steps[nextStep.toUpperCase()];
        }

        // Aggiorna i dati estratti
        Object.assign(conversazione.datiCliente, extractedData);

        // Fallback: usa anche l'estrazione tradizionale come backup
        config.bot.extractData(conversazione, messaggioUtente);

        // Normalizza i dati quando necessario
        this.normalizeExtractedData(conversazione);

        // Logica speciale per completamento step
        this.handleStepCompletion(conversazione);

        return { message, nextStep, extractedData };
    }

    normalizeExtractedData(conversazione) {
        const dati = conversazione.datiCliente;
        
        // Normalizza nome completo
        if (dati.nome && !dati.nomeCompleto) {
            const parole = dati.nome.trim().split(/\s+/);
            dati.nomeCompleto = parole.length >= 2;
        }
        
        // Normalizza date e orari se presenti
        if (dati.data && conversazione.currentStep === config.bot.steps.DATA) {
            dati.data = config.bot.normalizeDate(dati.data);
        }
        
        if (dati.ora && conversazione.currentStep === config.bot.steps.ORA) {
            dati.ora = config.bot.normalizeTime(dati.ora);
        }
    }

    handleStepCompletion(conversazione) {
        const dati = conversazione.datiCliente;
        const step = conversazione.currentStep;

        // Auto-avanzamento degli step quando i dati sono completi
        switch (step) {
            case config.bot.steps.NOME:
                if (dati.nome && dati.nomeCompleto) {
                    conversazione.currentStep = config.bot.steps.EMAIL;
                } else if (dati.nome && !dati.nomeCompleto) {
                    conversazione.currentStep = config.bot.steps.COGNOME;
                }
                break;

            case config.bot.steps.COGNOME:
                if (dati.cognome) {
                    dati.nome = `${dati.nome} ${dati.cognome}`;
                    dati.nomeCompleto = true;
                    conversazione.currentStep = config.bot.steps.EMAIL;
                }
                break;

            case config.bot.steps.EMAIL:
                if (dati.email) {
                    conversazione.currentStep = config.bot.steps.DATA;
                }
                break;

            case config.bot.steps.DATA:
                if (dati.data) {
                    conversazione.currentStep = config.bot.steps.ORA;
                }
                break;

            case config.bot.steps.ORA:
                if (dati.ora) {
                    conversazione.currentStep = config.bot.steps.RIEPILOGO;
                }
                break;

            case config.bot.steps.RIEPILOGO:
                // La conferma viene gestita nel prossimo messaggio
                break;
        }

        // Salva appuntamento se confermato
        if (step === config.bot.steps.RIEPILOGO && this.isConfirmationMessage(conversazione.messaggi[conversazione.messaggi.length - 1]?.content)) {
            conversazione.currentStep = config.bot.steps.CONFERMATO;
            this.saveAppointment(conversazione);
        } else if (step === config.bot.steps.CONFERMATO && this.isConfirmationMessage(conversazione.messaggi[conversazione.messaggi.length - 1]?.content) && !conversazione.appointmentSaved) {
            // Salva appuntamento anche se già nello step CONFERMATO ma non ancora salvato
            this.saveAppointment(conversazione);
            conversazione.appointmentSaved = true;
        }
    }

    isConfirmationMessage(message) {
        if (!message) return false;
        const confirmWords = ['sì', 'si', 'ok', 'va bene', 'perfetto', 'confermo', 'conferma', 'esatto', 'giusto'];
        const messageLower = message.toLowerCase();
        return confirmWords.some(word => messageLower.includes(word));
    }

    getFallbackResponse(conversazione) {
        const step = conversazione.currentStep;
        
        // Risposte di fallback semplici in base allo step
        switch (step) {
            case config.bot.steps.START:
                return "Ciao! Sono Sofia di Costruzione Digitale. Aiutiamo imprese edili a trovare nuovi clienti online. Ti interessa una consulenza gratuita? 🏗️";
            
            case config.bot.steps.NOME:
                return "Come ti chiami? 📝";
                
            case config.bot.steps.EMAIL:
                return "Perfetto! Ora la tua email? 📧";
                
            case config.bot.steps.DATA:
                return "Che giorno va bene per la consulenza?";
                
            case config.bot.steps.ORA:
                return "E a che ora preferisci? 🕐";
                
            default:
                return "Mi dispiace, c'è stato un problemino. Puoi ripetere? 😅";
        }
    }

    async saveAppointment(conversazione) {
        try {
            const dati = conversazione.datiCliente;
            
            console.log('🗓️ [CLAUDE] Salvataggio appuntamento...');
            
            const now = new Date();
            
            const booking = new this.Booking({
                name: dati.nome,
                email: dati.email,
                phone: conversazione.whatsappNumber,
                message: `Consulenza marketing imprese edili - Appuntamento fissato tramite WhatsApp Bot Sofia`,
                bookingDate: dati.data,
                bookingTime: dati.ora,
                bookingTimestamp: now,
                status: 'confirmed',
                value: 0, // Consultazione gratuita
                service: 'Consulenza Marketing Digitale - Metodo Chiavi in Mano',
                source: 'WhatsApp Bot Sofia - Costruzione Digitale',
                viewed: false
            });
            
            const savedBooking = await booking.save();
            
            console.log(`✅ [CLAUDE] Appuntamento salvato: ${savedBooking._id}`);
            console.log(`   👤 Nome: ${dati.nome}`);
            console.log(`   📧 Email: ${dati.email}`);
            console.log(`   📅 Data: ${dati.data}`);
            console.log(`   🕐 Ora: ${dati.ora}`);
            console.log(`   📱 Telefono: ${conversazione.whatsappNumber}`);
            console.log(`   🏢 Servizio: Consulenza Marketing Digitale`);
            
            return { success: true, id: savedBooking._id };
            
        } catch (error) {
            console.error('❌ [CLAUDE] Errore salvataggio:', error.message);
            console.error('❌ [CLAUDE] Stack:', error.stack);
            return { success: false, error: error.message };
        }
    }

    async testConnection() {
        try {
            console.log('🧪 [CLAUDE] Test connessione API...');
            
            if (!this.apiKey) {
                throw new Error('CLAUDE_API_KEY mancante');
            }

            // Test semplice dell'API
            const testResponse = await this.callClaudeAPI('Rispondi solo "OK" se ricevi questo messaggio.');
            
            if (testResponse && testResponse.includes('OK')) {
                console.log('✅ [CLAUDE] API Claude funzionante');
                return { success: true, message: 'Claude API connessa e funzionante' };
            } else {
                throw new Error('Risposta API non valida');
            }

        } catch (error) {
            console.error('❌ [CLAUDE] Test fallito:', error.message);
            return { success: false, error: error.message };
        }
    }
}

module.exports = ClaudeService;