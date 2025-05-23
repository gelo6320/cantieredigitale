// ============================================
// 📁 whatsapp/claude.js - VERSIONE SEMPLIFICATA CON CONFIG CENTRALIZZATO
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

            // ===== USA CONFIGURAZIONE CENTRALIZZATA =====
            
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
                system: systemPrompt,  // Generato dalla configurazione
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
            
            let responseText = response.data.content[0].text;
            
            // ===== POST-PROCESSING DELLA RISPOSTA =====
            
            // Processa template se necessario
            responseText = config.bot.processTemplate(responseText, {
                intent: intent,
                business_name: config.business.name,
                orarioStatus: config.bot.isBusinessHours() ? 
                    config.bot.templates.inOrario : 
                    config.bot.templates.fuoriOrario
            });

            console.log(`📤 [CLAUDE SERVICE] Risposta generata: "${responseText.substring(0, 100)}..."`);
            
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

    // ===== NUOVA FUNZIONE: AGGIORNA DATI CONVERSAZIONE =====
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

    // ===== ESTRAZIONE AUTOMATICA DATI UTENTE =====
    extractUserData(conversazione, messaggio, intent) {
        const messaggioLower = messaggio.toLowerCase();
        
        // Estrai email
        const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
        const emailMatch = messaggio.match(emailRegex);
        if (emailMatch && !conversazione.datiCliente.email) {
            conversazione.datiCliente.email = emailMatch[0];
            console.log(`📧 [CLAUDE SERVICE] Email estratta: ${emailMatch[0]}`);
        }

        // Estrai telefono
        const phoneRegex = /(\+39|0039)?\s?3\d{2}[\s\-]?\d{3}[\s\-]?\d{4}/;
        const phoneMatch = messaggio.match(phoneRegex);
        if (phoneMatch && !conversazione.datiCliente.telefono) {
            conversazione.datiCliente.telefono = phoneMatch[0];
            console.log(`📱 [CLAUDE SERVICE] Telefono estratto: ${phoneMatch[0]}`);
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