// ============================================
// 📁 whatsapp/claude.js  
// ============================================
const axios = require('axios');
const config = require('./config');

class ClaudeService {
    constructor() {
        this.apiKey = config.claude.apiKey;
        this.model = config.claude.model;
        this.baseURL = 'https://api.anthropic.com/v1/messages';
    }

    async generateResponse(conversazione, messaggioUtente) {
        try {
            const systemPrompt = this.buildSystemPrompt(conversazione);
            const messaggi = this.prepareMessages(conversazione, systemPrompt);

            const response = await axios.post(this.baseURL, {
                model: this.model,
                max_tokens: 300,
                messages: messaggi
            }, {
                headers: {
                    'x-api-key': this.apiKey,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json'
                },
                timeout: 10000
            });

            return response.data.content[0].text;
        } catch (error) {
            console.error('Errore Claude API:', error.response?.data || error.message);
            return this.getFallbackResponse();
        }
    }

    buildSystemPrompt(conversazione) {
        return `Sei un assistente virtuale per ${config.business.name}, specializzata in ${config.business.settore}.

INFORMAZIONI AZIENDA:
- Servizi: ${config.business.servizi.join(', ')}
- Orari: ${config.business.orariApertura}

OBIETTIVI:
1. Saluta cordialmente i nuovi clienti
2. Scopri le loro esigenze ponendo domande specifiche
3. Qualifica i lead raccogliendo: nome, email, tipo di progetto, budget, tempistiche
4. Fornisci informazioni sui nostri servizi quando rilevante
5. Proponi un appuntamento o una call se il lead è qualificato

COMPORTAMENTO:
- Tono professionale ma amichevole
- Risposte brevi e dirette (max 2-3 frasi)
- Fai UNA domanda alla volta
- Non essere troppo insistente
- Se fuori orario, spiega quando risponderemo

DATI CLIENTE RACCOLTI:
${JSON.stringify(conversazione.datiCliente, null, 2)}

STATO CONVERSAZIONE: ${conversazione.stato}`;
    }

    prepareMessages(conversazione, systemPrompt) {
        return [
            { role: 'system', content: systemPrompt },
            ...conversazione.messaggi.slice(-10)
        ];
    }

    getFallbackResponse() {
        const risposteFallback = [
            "Mi dispiace, c'è stato un problema tecnico. Riprova tra poco!",
            "Sto avendo difficoltà tecniche. Puoi ripetere la domanda?",
            "Scusami per l'inconveniente. Prova a riformulare la domanda."
        ];
        return risposteFallback[Math.floor(Math.random() * risposteFallback.length)];
    }
}

module.exports = ClaudeService;