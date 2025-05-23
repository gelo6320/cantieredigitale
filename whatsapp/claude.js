// ============================================
// 📁 whatsapp/claude.js - VERSIONE CORRETTA
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
        
        // Verifica configurazione
        this.validateConfig();
    }

    validateConfig() {
        if (!this.apiKey) {
            console.error('❌ [CLAUDE SERVICE] ERRORE: CLAUDE_API_KEY non configurata');
            console.error('💡 Aggiungi CLAUDE_API_KEY=sk-ant-... al file .env');
            return false;
        }

        if (!this.apiKey.startsWith('sk-ant-')) {
            console.error('❌ [CLAUDE SERVICE] ERRORE: CLAUDE_API_KEY formato non valido');
            console.error('💡 La chiave deve iniziare con sk-ant-');
            return false;
        }

        console.log('✅ [CLAUDE SERVICE] Configurazione valida');
        console.log(`   🤖 Modello: ${this.model}`);
        console.log(`   🔑 API Key: ${this.apiKey.substring(0, 15)}...`);
        console.log(`   🎭 Bot Persona: ${config.bot.personality.nome}`);
        console.log(`   ⚙️ Max Tokens: ${this.maxTokens}`);
        return true;
    }

    async generateResponse(conversazione, messaggioUtente) {
        try {
            console.log(`🤖 [CLAUDE SERVICE] Generazione risposta per: "${messaggioUtente}"`);
            
            // Verifica configurazione prima di procedere
            if (!this.validateConfig()) {
                return config.bot.getFallbackMessage();
            }

            // Genera il prompt di sistema usando la configurazione
            const systemPrompt = config.bot.generateSystemPrompt(conversazione);
            
            // Prepara i messaggi 
            const messaggi = this.prepareMessages(conversazione);

            // Rileva intent del messaggio
            const intent = config.bot.detectIntent(messaggioUtente);
            console.log(`🎯 [CLAUDE SERVICE] Intent rilevato: ${intent}`);

            console.log(`📤 [CLAUDE SERVICE] Invio richiesta a Claude API...`);
            console.log(`📝 [CLAUDE SERVICE] System prompt generato dinamicamente`);
            console.log(`📊 [CLAUDE SERVICE] Messaggi utente: ${messaggi.length}`);

            // FORMATO CORRETTO API CLAUDE
            const requestPayload = {
                model: this.model,
                max_tokens: this.maxTokens,
                system: systemPrompt,
                messages: messaggi
            };

            const response = await axios.post(this.baseURL, requestPayload, {
                headers: {
                    'x-api-key': this.apiKey,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json'
                },
                timeout: this.timeout
            });

            console.log(`✅ [CLAUDE SERVICE] Risposta ricevuta da Claude API`);
            console.log(`📊 [CLAUDE SERVICE] Response status: ${response.status}`);
            
            // ===== FIX: ESTRAI LA RISPOSTA DAL RESPONSE =====
            let responseText = response.data.content[0].text;
            console.log(`📝 [CLAUDE SERVICE] Risposta Claude estratta: "${responseText.substring(0, 100)}..."`);
            
            const dati = conversazione.datiCliente;
        
            // Controlla se ha tutti i dati per salvare
            const hasTuttiDatiAppuntamento = dati.appuntamentoConfermato && 
                                            dati.nome && 
                                            dati.telefono && 
                                            dati.dataAppuntamento && 
                                            dati.oraAppuntamento;
            
            // Solo se ha TUTTI i dati, salva l'appuntamento
            if (hasTuttiDatiAppuntamento && !dati.appuntamentoSalvato) {
                console.log('🗓️ [CLAUDE SERVICE] Tentativo salvataggio appuntamento - tutti i dati presenti');
                
                const dataAppuntamento = this.parseAppointmentDate(dati.dataAppuntamento, dati.oraAppuntamento);
                
                const appointmentData = {
                    nome: dati.nome,
                    telefono: dati.telefono,
                    email: dati.email || '',
                    data: dataAppuntamento,
                    ora: dati.oraAppuntamento,
                    dettagli: `Prenotazione via WhatsApp - ${messaggioUtente}`
                };
                
                const saveResult = await this.saveAppointment(conversazione, appointmentData);
                
                if (saveResult.success) {
                    responseText = config.bot.processTemplate(
                        config.bot.templates.appuntamento_salvato, 
                        {
                            data_ora: `${dati.dataAppuntamento} alle ${dati.oraAppuntamento}`,
                            telefono: dati.telefono
                        }
                    );
                    
                    dati.appuntamentoSalvato = true;
                    console.log('✅ [CLAUDE SERVICE] Appuntamento salvato con successo');
                } else {
                    console.error('❌ [CLAUDE SERVICE] Errore salvamento appuntamento:', saveResult.error);
                    // Non modificare la risposta, lascia quella generata da Claude
                }
            } else if (dati.nome && dati.email && !hasTuttiDatiAppuntamento) {
                // Se ha nome ed email ma non tutti i dati dell'appuntamento
                console.log('⚠️ [CLAUDE SERVICE] Dati parziali - richiede completamento appuntamento');
                
                // Sostituisci la risposta con una richiesta per i dati mancanti
                const datiMancanti = [];
                if (!dati.telefono) datiMancanti.push('numero di telefono');
                if (!dati.dataAppuntamento) datiMancanti.push('data preferita');
                if (!dati.oraAppuntamento) datiMancanti.push('orario preferito');
                
                responseText = `Perfetto ${dati.nome}! 👍\n\nPer confermare la chiamata mi serve:\n${datiMancanti.map(d => `• ${d}`).join('\n')}\n\nPuoi condividermeli?`;
            }
            
            // ===== POST-PROCESSING DELLA RISPOSTA =====
            
            // Processa template se necessario
            responseText = config.bot.processTemplate(responseText, {
                intent: intent,
                business_name: config.business.name,
                orarioStatus: config.bot.isBusinessHours() ? 
                    config.bot.templates.inOrario : 
                    config.bot.templates.fuoriOrario
            });

            console.log(`📤 [CLAUDE SERVICE] Risposta processata: "${responseText.substring(0, 100)}..."`);
            
            // ===== AGGIORNA DATI CONVERSAZIONE =====
            this.updateConversationData(conversazione, messaggioUtente, responseText, intent);
            
            return responseText;

        } catch (error) {
            console.error('❌ [CLAUDE SERVICE] Errore Claude API:', error.message);
            
            // Log dettagliato degli errori
            if (error.response) {
                console.error('📊 [CLAUDE SERVICE] Status:', error.response.status);
                console.error('📊 [CLAUDE SERVICE] Data:', JSON.stringify(error.response.data, null, 2));
                
                // Errori specifici
                if (error.response.status === 401) {
                    console.error('🔑 [CLAUDE SERVICE] Errore autenticazione - verifica CLAUDE_API_KEY');
                } else if (error.response.status === 429) {
                    console.error('⏱️ [CLAUDE SERVICE] Rate limit raggiunto - riprova più tardi');
                } else if (error.response.status === 400) {
                    console.error('📝 [CLAUDE SERVICE] Richiesta non valida');
                }
            }
            
            return config.bot.getFallbackMessage();
        }
    }

    parseAppointmentDate(giornoStr, oraStr) {
        const oggi = new Date();
        let dataAppuntamento = new Date(oggi);
        
        // Mappa dei giorni
        const giorni = {
            'lunedì': 1, 'martedì': 2, 'mercoledì': 3, 'giovedì': 4, 'venerdì': 5, 'sabato': 6, 'domenica': 0
        };
        
        if (giornoStr === 'domani') {
            dataAppuntamento.setDate(oggi.getDate() + 1);
        } else if (giornoStr === 'dopodomani') {
            dataAppuntamento.setDate(oggi.getDate() + 2);
        } else if (giorni[giornoStr.toLowerCase()] !== undefined) {
            const giornoTarget = giorni[giornoStr.toLowerCase()];
            const giornoOggi = oggi.getDay();
            let giorniDaAggiungere = (giornoTarget - giornoOggi + 7) % 7;
            if (giorniDaAggiungere === 0) giorniDaAggiungere = 7; // Prossima settimana
            dataAppuntamento.setDate(oggi.getDate() + giorniDaAggiungere);
        }
        
        // Imposta l'ora
        if (oraStr) {
            const [ora, minuti] = oraStr.split(':');
            dataAppuntamento.setHours(parseInt(ora), parseInt(minuti || '0'), 0, 0);
        }
        
        return dataAppuntamento;
    }

    prepareMessages(conversazione) {
        // Prepara messaggi usando la configurazione
        const messaggi = [];
        const maxMessaggi = config.bot.conversazione.maxMessaggiInMemoria;

        // Aggiungi gli ultimi N messaggi per mantenere il contesto
        const recentMessages = conversazione.messaggi.slice(-maxMessaggi);
        
        recentMessages.forEach(msg => {
            if (msg.role === 'user' || msg.role === 'assistant') {
                messaggi.push({
                    role: msg.role,
                    content: msg.content
                });
            }
        });

        // Se non ci sono messaggi, aggiungi messaggio di benvenuto
        if (messaggi.length === 0) {
            messaggi.push({
                role: 'user',
                content: 'Ciao'
            });
        }

        // Assicurati che il primo messaggio sia dell'utente
        if (messaggi[0].role !== 'user') {
            messaggi.unshift({
                role: 'user',
                content: 'Ciao'
            });
        }

        console.log(`📋 [CLAUDE SERVICE] Messaggi preparati: ${messaggi.length} (max: ${maxMessaggi})`);
        
        return messaggi;
    }

    // ===== AGGIORNA DATI CONVERSAZIONE =====
    updateConversationData(conversazione, messaggioUtente, risposta, intent) {
        try {
            // Inizializza datiCliente se non esiste
            if (!conversazione.datiCliente) {
                conversazione.datiCliente = {};
            }

            // Estrai informazioni in base all'intent e al contenuto
            this.extractUserData(conversazione, messaggioUtente, intent);
            
            // Aggiorna stato conversazione
            this.updateConversationState(conversazione, intent);
            
            console.log(`📊 [CLAUDE SERVICE] Dati conversazione aggiornati:`, conversazione.datiCliente);
            
        } catch (error) {
            console.error('❌ [CLAUDE SERVICE] Errore aggiornamento dati conversazione:', error.message);
        }
    }

    async saveAppointment(conversazione, appointmentData) {
        try {
            console.log('🗓️ [CLAUDE SERVICE] Salvataggio appuntamento:', appointmentData);
            
            const mongoose = require('mongoose');
            
            // Schema per l'appuntamento (se non esiste già)
            const AppointmentSchema = new mongoose.Schema({
                sessionId: String,
                phoneNumber: String,
                customerName: String,
                customerEmail: String,
                appointmentDate: Date,
                appointmentTime: String,
                status: { type: String, default: 'confirmed' },
                source: { type: String, default: 'whatsapp_bot' },
                notes: String,
                createdAt: { type: Date, default: Date.now }
            });
            
            // Crea il modello se non esiste
            let Appointment;
            try {
                Appointment = mongoose.model('Appointment');
            } catch (e) {
                Appointment = mongoose.model('Appointment', AppointmentSchema);
            }
            
            // Crea il nuovo appuntamento
            const newAppointment = new Appointment({
                sessionId: conversazione.sessionId || 'whatsapp_session',
                phoneNumber: appointmentData.telefono,
                customerName: appointmentData.nome,
                customerEmail: appointmentData.email,
                appointmentDate: appointmentData.data,
                appointmentTime: appointmentData.ora,
                status: 'confirmed',
                source: 'whatsapp_bot',
                notes: `Appuntamento prenotato via WhatsApp Bot - ${appointmentData.dettagli || ''}`
            });
            
            await newAppointment.save();
            
            console.log('✅ [CLAUDE SERVICE] Appuntamento salvato con successo:', newAppointment._id);
            
            return {
                success: true,
                appointmentId: newAppointment._id,
                message: 'Appuntamento salvato con successo'
            };
            
        } catch (error) {
            console.error('❌ [CLAUDE SERVICE] Errore salvataggio appuntamento:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ===== ESTRAZIONE AUTOMATICA DATI UTENTE =====
    extractUserData(conversazione, messaggio, intent) {
        const messaggioLower = messaggio.toLowerCase();
        
        // ===== FIX: ESTRAZIONE TELEFONO DA WHATSAPP =====
        // Se non ha telefono e stiamo su WhatsApp, usa il numero WhatsApp
        if (!conversazione.datiCliente.telefono && conversazione.whatsappNumber) {
            conversazione.datiCliente.telefono = conversazione.whatsappNumber;
            console.log(`📱 [CLAUDE SERVICE] Telefono estratto da WhatsApp: ${conversazione.whatsappNumber}`);
        }
        
        // Estrai email
        const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
        const emailMatch = messaggio.match(emailRegex);
        if (emailMatch && !conversazione.datiCliente.email) {
            conversazione.datiCliente.email = emailMatch[0];
            console.log(`📧 [CLAUDE SERVICE] Email estratta: ${emailMatch[0]}`);
        }
    
        // ===== ESTRAZIONE NOME MIGLIORATA =====
        if (!conversazione.datiCliente.nome) {
            // Prima riga del messaggio se contiene solo lettere
            const lines = messaggio.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            if (lines.length > 0) {
                const firstLine = lines[0];
                // Se la prima riga è solo lettere e spazi (probabile nome)
                if (/^[A-Za-zÀ-ÿ\s]+$/.test(firstLine) && firstLine.length > 1) {
                    conversazione.datiCliente.nome = firstLine;
                    console.log(`👤 [CLAUDE SERVICE] Nome estratto dalla prima riga: ${firstLine}`);
                }
            }
            
            // Metodo esistente come fallback
            const nomeRegex = /(mi chiamo|sono)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i;
            const nomeMatch = messaggio.match(nomeRegex);
            if (nomeMatch && !conversazione.datiCliente.nome) {
                conversazione.datiCliente.nome = nomeMatch[2];
                console.log(`👤 [CLAUDE SERVICE] Nome estratto con regex: ${nomeMatch[2]}`);
            }
        }
    
        // ===== ESTRAZIONE DATA E ORA =====
        if (intent === 'conferma_appuntamento' || intent === 'data_orario' || 
            messaggioLower.includes('disponibile') || messaggioLower.includes('chiamata')) {
            
            // Estrai data
            const dataRegex = /(lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica|domani|dopodomani)/i;
            const dataMatch = messaggio.match(dataRegex);
            if (dataMatch && !conversazione.datiCliente.dataAppuntamento) {
                conversazione.datiCliente.dataAppuntamento = dataMatch[0];
                console.log(`📅 [CLAUDE SERVICE] Data appuntamento estratta: ${dataMatch[0]}`);
            }
            
            // Estrai ora
            const oraRegex = /(?:alle\s+)?(\d{1,2}):?(\d{2})?\s*(?:h|:00)?/i;
            const oraMatch = messaggio.match(oraRegex);
            if (oraMatch && !conversazione.datiCliente.oraAppuntamento) {
                const ora = oraMatch[1];
                const minuti = oraMatch[2] || '00';
                conversazione.datiCliente.oraAppuntamento = `${ora}:${minuti}`;
                console.log(`🕐 [CLAUDE SERVICE] Ora appuntamento estratta: ${ora}:${minuti}`);
            }
            
            // Conferma appuntamento
            const confermaRegex = /(confermo|va bene|perfetto|sì|ok|sono disponibile)/i;
            if (confermaRegex.test(messaggio) && 
                conversazione.datiCliente.dataAppuntamento && 
                conversazione.datiCliente.oraAppuntamento) {
                conversazione.datiCliente.appuntamentoConfermato = true;
                console.log('✅ [CLAUDE SERVICE] Appuntamento confermato dal cliente');
            }
        }

        // Estrai nome (euristica semplice)
        if (intent === 'generale' && !conversazione.datiCliente.nome) {
            // Se il messaggio contiene "mi chiamo" o "sono"
            const nomeRegex = /(mi chiamo|sono)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i;
            const nomeMatch = messaggio.match(nomeRegex);
            if (nomeMatch) {
                conversazione.datiCliente.nome = nomeMatch[2];
                console.log(`👤 [CLAUDE SERVICE] Nome estratto: ${nomeMatch[2]}`);
            }
        }

        // Estrai budget (se menzionato)
        const budgetRegex = /(\d+(?:\.\d{3})*)\s?(?:euro|€)/i;
        const budgetMatch = messaggio.match(budgetRegex);
        if (budgetMatch && intent === 'budget') {
            conversazione.datiCliente.budget = parseInt(budgetMatch[1].replace('.', ''));
            console.log(`💰 [CLAUDE SERVICE] Budget estratto: ${conversazione.datiCliente.budget}€`);
        }

        // Estrai servizio di interesse
        config.business.servizi.forEach(servizio => {
            if (messaggioLower.includes(servizio.toLowerCase()) && !conversazione.datiCliente.servizioInteresse) {
                conversazione.datiCliente.servizioInteresse = servizio;
                console.log(`🎯 [CLAUDE SERVICE] Servizio di interesse: ${servizio}`);
            }
        });

        console.log(`📊 [CLAUDE SERVICE] Stato dati conversazione:`);
        console.log(`   👤 Nome: ${conversazione.datiCliente.nome || 'MANCANTE'}`);
        console.log(`   📧 Email: ${conversazione.datiCliente.email || 'MANCANTE'}`);  
        console.log(`   📱 Telefono: ${conversazione.datiCliente.telefono || 'MANCANTE'}`);
        console.log(`   📅 Data: ${conversazione.datiCliente.dataAppuntamento || 'MANCANTE'}`);
        console.log(`   🕐 Ora: ${conversazione.datiCliente.oraAppuntamento || 'MANCANTE'}`);
        console.log(`   ✅ Confermato: ${conversazione.datiCliente.appuntamentoConfermato || false}`);
        console.log(`   💾 Salvato: ${conversazione.datiCliente.appuntamentoSalvato || false}`);
        
        const completezza = [
            conversazione.datiCliente.nome,
            conversazione.datiCliente.telefono, 
            conversazione.datiCliente.dataAppuntamento,
            conversazione.datiCliente.oraAppuntamento,
            conversazione.datiCliente.appuntamentoConfermato
        ].filter(Boolean).length;
        
        console.log(`📈 [CLAUDE SERVICE] Completezza dati: ${completezza}/5 (${Math.round(completezza/5*100)}%)`);
    }

    // ===== AGGIORNA STATO CONVERSAZIONE =====
    updateConversationState(conversazione, intent) {
        const dati = conversazione.datiCliente;
        
        // Determina nuovo stato in base ai dati raccolti
        if (dati.email && dati.nome && dati.servizioInteresse) {
            conversazione.stato = 'lead_qualificato';
        } else if (dati.email || dati.nome) {
            conversazione.stato = 'informazioni_parziali';
        } else if (intent === 'saluto') {
            conversazione.stato = 'primo_contatto';
        } else {
            conversazione.stato = 'in_conversazione';
        }
        
        console.log(`🔄 [CLAUDE SERVICE] Stato conversazione: ${conversazione.stato}`);
    }

    // ===== METODO TEST SEMPLIFICATO =====
    async testConnection() {
        try {
            console.log('🧪 [CLAUDE SERVICE] Test connessione API...');
            
            // Crea una conversazione di test
            const testConversazione = {
                messaggi: [],
                datiCliente: {},
                stato: 'test',
                ultimoMessaggio: new Date()
            };

            const response = await this.generateResponse(testConversazione, 'Test di connessione');
            
            console.log('✅ [CLAUDE SERVICE] Test connessione riuscito');
            console.log(`📤 [CLAUDE SERVICE] Risposta test: "${response.substring(0, 100)}..."`);
            
            return { 
                success: true, 
                message: 'Connessione Claude API funzionante',
                sampleResponse: response.substring(0, 100) + '...'
            };

        } catch (error) {
            console.error('❌ [CLAUDE SERVICE] Test connessione fallito:', error.message);
            return { 
                success: false, 
                message: 'Connessione Claude API non funzionante',
                error: error.message 
            };
        }
    }

    // ===== METODI UTILITY =====
    
    // Ottieni configurazione corrente del bot
    getBotConfig() {
        return {
            personality: config.bot.personality,
            business: config.business,
            isBusinessHours: config.bot.isBusinessHours(),
            maxTokens: this.maxTokens,
            model: this.model
        };
    }

    // Reset conversazione (per testing)
    resetConversation(conversazione) {
        conversazione.messaggi = [];
        conversazione.datiCliente = {};
        conversazione.stato = 'nuovo_cliente';
        conversazione.ultimoMessaggio = new Date();
        
        console.log('🔄 [CLAUDE SERVICE] Conversazione resettata');
        return conversazione;
    }

    // Verifica se il lead è qualificato
    isLeadQualified(conversazione) {
        const dati = conversazione.datiCliente;
        const configQual = config.bot.qualification;
        
        const hasCampiObbligatori = configQual.campiObbligatori.every(campo => 
            dati[campo] && dati[campo].trim().length > 0
        );
        
        const budgetSufficiente = !dati.budget || dati.budget >= configQual.budgetMinimo;
        
        return hasCampiObbligatori && budgetSufficiente;
    }
}

module.exports = ClaudeService;