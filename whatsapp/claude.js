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
        this.maxTokens = config.claude.maxTokens || 300;
        this.timeout = config.claude.timeout || 10000;
        
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
        return true;
    }

    async generateResponse(conversazione, messaggioUtente) {
        try {
            console.log(`🤖 [CLAUDE SERVICE] Generazione risposta per messaggio: "${messaggioUtente}"`);
            
            // Verifica configurazione prima di procedere
            if (!this.validateConfig()) {
                return this.getFallbackResponse('Configurazione non valida');
            }

            const systemPrompt = this.buildSystemPrompt(conversazione);
            const messaggi = this.prepareMessages(conversazione, systemPrompt);

            console.log(`📤 [CLAUDE SERVICE] Invio richiesta a Claude API...`);

            const response = await axios.post(this.baseURL, {
                model: this.model,
                max_tokens: this.maxTokens,
                messages: messaggi
            }, {
                headers: {
                    'x-api-key': this.apiKey,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json'
                },
                timeout: this.timeout
            });

            console.log(`✅ [CLAUDE SERVICE] Risposta ricevuta da Claude API`);
            
            const responseText = response.data.content[0].text;
            console.log(`📤 [CLAUDE SERVICE] Risposta generata: "${responseText}"`);
            
            return responseText;

        } catch (error) {
            console.error('❌ [CLAUDE SERVICE] Errore Claude API:', error.message);
            
            // Log dettagliato degli errori
            if (error.response) {
                console.error('📊 [CLAUDE SERVICE] Status:', error.response.status);
                console.error('📊 [CLAUDE SERVICE] Data:', error.response.data);
                
                // Errori specifici
                if (error.response.status === 401) {
                    console.error('🔑 [CLAUDE SERVICE] Errore autenticazione - verifica CLAUDE_API_KEY');
                } else if (error.response.status === 429) {
                    console.error('⏱️ [CLAUDE SERVICE] Rate limit raggiunto - riprova più tardi');
                } else if (error.response.status === 400) {
                    console.error('📝 [CLAUDE SERVICE] Richiesta non valida - verifica formato messaggio');
                }
            } else if (error.code === 'ECONNABORTED') {
                console.error('⏰ [CLAUDE SERVICE] Timeout - richiesta troppo lenta');
            } else {
                console.error('🌐 [CLAUDE SERVICE] Errore di rete:', error.message);
            }
            
            return this.getFallbackResponse(error.message);
        }
    }

    buildSystemPrompt(conversazione) {
        const isBusinessHours = this.isBusinessHours();
        const statusMessaggio = isBusinessHours ? 
            "Siamo attualmente disponibili per assistenza immediata." :
            `Siamo fuori orario (${config.business.orariApertura}). Ti risponderemo al più presto durante l'orario lavorativo.`;

        return `Sei un assistente virtuale professionale per ${config.business.name}, specializzata in ${config.business.settore}.

🏢 INFORMAZIONI AZIENDA:
- Nome: ${config.business.name}
- Settore: ${config.business.settore}
- Servizi: ${config.business.servizi.join(', ')}
- Orari: ${config.business.orariApertura}
- Stato: ${statusMessaggio}

🎯 OBIETTIVI PRINCIPALI:
1. Saluta cordialmente i nuovi clienti
2. Scopri le loro esigenze ponendo domande specifiche e pertinenti
3. Qualifica i lead raccogliendo informazioni chiave:
   - Nome completo
   - Email di contatto
   - Tipo di progetto o servizio richiesto
   - Budget approssimativo
   - Tempistiche previste
4. Fornisci informazioni sui nostri servizi quando rilevante
5. Proponi un appuntamento o una call se il lead è qualificato

💬 STILE DI COMUNICAZIONE:
- Tono professionale ma amichevole e caldo
- Risposte brevi e dirette (massimo 2-3 frasi)
- Fai UNA domanda specifica alla volta
- Non essere troppo insistente o aggressivo
- Personalizza le risposte in base al contesto
- Usa emoji con moderazione per risultare più umano

📊 DATI CLIENTE RACCOLTI:
${JSON.stringify(conversazione.datiCliente, null, 2)}

🔄 STATO CONVERSAZIONE ATTUALE: ${conversazione.stato}

⏰ ORARIO: ${isBusinessHours ? 'IN ORARIO' : 'FUORI ORARIO'}`;
    }

    prepareMessages(conversazione, systemPrompt) {
        // Prepara i messaggi per Claude, limitando la cronologia
        const messaggi = [
            { role: 'system', content: systemPrompt }
        ];

        // Aggiungi gli ultimi 10 messaggi per mantenere il contesto
        const recentMessages = conversazione.messaggi.slice(-10);
        messaggi.push(...recentMessages.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content
        })));

        return messaggi;
    }

    isBusinessHours() {
        const now = new Date();
        const currentHour = now.getHours();
        const currentDay = now.getDay(); // 0 = domenica, 1 = lunedì, ecc.
        
        // Lun-Ven (1-5), 9:00-18:00
        return currentDay >= 1 && currentDay <= 5 && currentHour >= 9 && currentHour < 18;
    }

    getFallbackResponse(errorDetails = '') {
        const fallbackResponses = [
            "Mi dispiace, sto avendo delle difficoltà tecniche momentanee. Potresti ripetere la tua richiesta?",
            "Scusami per l'inconveniente tecnico. Riprova tra qualche istante o contattaci direttamente.",
            "C'è stato un piccolo problema dal mio lato. Puoi riformulare la domanda?",
            "Mi dispiace, c'è stato un errore temporaneo. Riprova tra poco o scrivici via email."
        ];
        
        const response = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
        
        // Log per debug
        console.log(`🔄 [CLAUDE SERVICE] Utilizzando risposta fallback: "${response}"`);
        if (errorDetails) {
            console.log(`🔍 [CLAUDE SERVICE] Dettagli errore: ${errorDetails}`);
        }
        
        return response;
    }

    // Metodo per testare la connessione
    async testConnection() {
        try {
            console.log('🧪 [CLAUDE SERVICE] Test connessione API...');
            
            const response = await axios.post(this.baseURL, {
                model: this.model,
                max_tokens: 10,
                messages: [{ role: 'user', content: 'Test di connessione' }]
            }, {
                headers: {
                    'x-api-key': this.apiKey,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json'
                },
                timeout: 5000
            });

            console.log('✅ [CLAUDE SERVICE] Test connessione riuscito');
            return { success: true, message: 'Connessione Claude API funzionante' };

        } catch (error) {
            console.error('❌ [CLAUDE SERVICE] Test connessione fallito:', error.message);
            return { 
                success: false, 
                message: 'Connessione Claude API non funzionante',
                error: error.response?.data || error.message 
            };
        }
    }
}

module.exports = ClaudeService;