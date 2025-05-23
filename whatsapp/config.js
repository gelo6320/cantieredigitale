// ============================================
// 📁 whatsapp/config.js - CALL-FOCUSED BOT
// ============================================

require('dotenv').config();

console.log('🔧 [WHATSAPP CONFIG] Caricamento configurazioni call-focused...');

const config = {
    // ===== CONFIGURAZIONI API =====
    whatsapp: {
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
        accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
        webhookToken: process.env.WHATSAPP_WEBHOOK_TOKEN,
        verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || process.env.WHATSAPP_WEBHOOK_TOKEN
    },
    
    claude: {
        apiKey: process.env.CLAUDE_API_KEY,
        model: 'claude-sonnet-4-20250514',
        maxTokens: parseInt(process.env.CLAUDE_MAX_TOKENS) || 80, // RIDOTTO per risposte brevi
        timeout: parseInt(process.env.CLAUDE_TIMEOUT) || 10000
    },
    
    server: {
        port: process.env.PORT || 3000,
        environment: process.env.NODE_ENV || 'development'
    },

    // ===== CONFIGURAZIONI BUSINESS =====
    business: {
        name: process.env.BUSINESS_NAME || "Costruzione Digitale",
        settore: process.env.BUSINESS_SECTOR || "Consulenza digitale",
        servizi: (process.env.BUSINESS_SERVICES || "Sviluppo web,Analytics,Marketing").split(','),
        orariApertura: process.env.BUSINESS_HOURS || "Lun-Ven 9:00-18:00",
        telefono: process.env.BUSINESS_PHONE || "+39 123 456 7890",
        email: process.env.BUSINESS_EMAIL || "info@costruzionedigitale.com",
        sito: process.env.BUSINESS_WEBSITE || "https://costruzionedigitale.com",
        indirizzo: process.env.BUSINESS_ADDRESS || "Milano, Italia"
    },

    // ===== CONFIGURAZIONE COMPORTAMENTO BOT CALL-FOCUSED =====
    bot: {
        // Personalità aggressiva per le chiamate
        personality: {
            nome: process.env.BOT_NAME || "Assistente di Costruzione Digitale",
            tono: "diretto e orientato all'azione",
            caratteristiche: [
                "Focalizzato su prenotazioni chiamate",
                "Diretto e senza giri di parole",
                "Orientato ai risultati immediati",
                "Esperto nel creare urgenza"
            ]
        },

        // Stile di comunicazione ultra-breve
        comunicazione: {
            lunghezzaRisposta: "molto brevi (massimo 1 frase + domanda)",
            domandePerVolta: 1,
            usoEmoji: "minimo, solo quando necessario",
            linguaggio: "italiano diretto e colloquiale",
            evitare: [
                "spiegazioni lunghe",
                "troppi dettagli tecnici", 
                "perdere tempo in chiacchiere",
                "non proporre la chiamata"
            ]
        },

        // OBIETTIVI RIORIENTATI ALLA CHIAMATA
        obiettivi: [
            {
                priorita: 1,
                descrizione: "PRENOTARE UNA CHIAMATA CONOSCITIVA GRATUITA",
                azione: "Spingere verso la prenotazione entro 3 messaggi MAX"
            },
            {
                priorita: 2,
                descrizione: "Raccogliere nome ed email per la chiamata",
                azione: "Ottenere contatti per organizzare la call"
            },
            {
                priorita: 3,
                descrizione: "Identificare il bisogno principale velocemente",
                azione: "Capire cosa serve per personalizzare la proposta di call"
            },
            {
                priorita: 4,
                descrizione: "Gestire obiezioni alla chiamata",
                azione: "Rispondere alle resistenze e ri-proporre"
            },
            {
                priorita: 5,
                descrizione: "Raccogliere contatto anche se dice no",
                azione: "Almeno email per future opportunità"
            }
        ],

        // TEMPLATE CALL-FOCUSED
        templates: {
            // SALUTO AGGRESSIVO
            salutoIniziale: "Ciao! 👋 Ti va una chiamata gratuita di 15 min per vedere come possiamo aiutarti?",
            
            salutoRitorno: "Bentornato! Hai pensato alla nostra chiamata gratuita?",

            // PROPOSTE CHIAMATA MULTIPLE
            proposta_chiamata_rapida: "Perfetto! Ti propongo una call gratuita di 15 min. Quando sei disponibile?",
            
            proposta_chiamata_dopo_servizi: "Organizziamo una call veloce per vedere qual è la soluzione migliore per te?",
            
            proposta_chiamata_specifica: "Per {bisogno_cliente} ti serve una strategia su misura. Call di 15 min per parlarne?",

            // RICHIESTA CONTATTI
            richiesta_contatti_per_call: "Perfetto! Per organizzare la chiamata ho bisogno di nome ed email. Puoi condividerli?",
            
            richiesta_solo_email: "Ok! Almeno la tua email così ti invio qualche info utile?",

            // DESCRIZIONE SERVIZI BREVE
            descrizioneServizi: "Facciamo: siti web, marketing digitale e automazioni AI. Ti va una call di 15 min per vedere cosa serve a te?",

            // GESTIONE OBIEZIONI
            obiezione_tempo: "Solo 15 minuti! Quando sei più libero questa settimana?",
            obiezione_costo: "È gratuita! Te lo spiego tutto in 15 min. Quando puoi?",
            obiezione_ci_penso: "Ok! Lasciami almeno la tua email così ti mando qualche info?",
            obiezione_non_interessato: "Capito. Se cambi idea sono qui!",

            // FOLLOW UP
            follow_up_dopo_info: "Ti ho dato l'info che cercavi. Ora organizziamo una call per vedere come aiutarti concretamente?",
            
            chiusura_con_contatti: "Perfetto! Ti ricontatto presto per organizzare tutto. Grazie {nome}!",

            // MESSAGGI ORARIO
            fuoriOrario: "Siamo fuori orario ma organizziamo una call per domani?",
            inOrario: "Siamo online! 🟢 Facciamo subito una call?"
        },

        // GESTIONE OBIEZIONI STRUTTURATA
        gestione_obiezioni: {
            "non ho tempo": "Solo 15 minuti! Quando sei più libero?",
            "ci penso": "Ok! Lasciami almeno la tua email così ti invio qualche info?",
            "quanto costa": "È gratis! Te lo spiego in 15 min. Quando puoi?",
            "non sono interessato": "Capito. Se cambi idea sono qui!",
            "più tardi": "Perfetto! Quando ti ricontatto? Domani?",
            "non so": "Normal! Per questo serve una call veloce. Oggi o domani?",
            "ho già": "Ottimo! Vediamo se possiamo migliorare. Call di 15 min?"
        },

        // MESSAGGI DI FALLBACK BREVI
        fallbackMessages: [
            "Scusa il problema tecnico. Ti va una call per parlare dal vivo?",
            "C'è stato un errore. Meglio una chiamata veloce?",
            "Problema tecnico. Facciamo una call di 15 min?"
        ],

        // KEYWORDS AMPLIATE PER INTERCETTARE TUTTO
        keywords: {
            saluto: ["ciao", "salve", "buongiorno", "buonasera", "hey", "hello"],
            servizi: ["servizi", "cosa fate", "cosa offrite", "che servizi", "prezzi", "costi", "aiuto"],
            contatto: ["contatto", "telefono", "email", "chiamare", "scrivere"],
            
            // INTERCETTA INTERESSE CHIAMATA
            interesse_call: ["si", "sì", "ok", "va bene", "perfetto", "interessante", "dimmi di più", "sono interessato"],
            disponibilita: ["disponibile", "libero", "posso", "quando", "orario", "domani", "oggi", "settimana"],
            
            // INTERCETTA RESISTENZE
            rifiuto_soft: ["non so", "forse", "ci penso", "più tardi", "non ora", "non ho tempo"],
            rifiuto_hard: ["no", "non interessato", "non mi interessa", "basta"],
            
            // PROBLEMI/BISOGNI
            problemi: ["problema", "non funziona", "errore", "difficoltà", "aiuto", "bloccato"],
            urgente: ["urgente", "subito", "immediato", "veloce", "presto"],
            budget: ["budget", "costo", "prezzo", "spesa", "investimento", "soldi"],
            
            // SETTORI SPECIFICI
            web: ["sito", "website", "web", "online", "internet"],
            marketing: ["marketing", "pubblicità", "ads", "google", "facebook", "social"],
            ai: ["ai", "intelligenza artificiale", "bot", "automazione", "chatbot"]
        },

        // CONFIGURAZIONE LEAD QUALIFICATION SEMPLIFICATA
        qualification: {
            campiObbligatori: ["nome", "email"], // Solo essenziali per la call
            campiOpzionali: ["telefono", "bisogno", "urgenza"],
            leadQualificatoSe: {
                haEmail: true,
                haNome: true,
                haEspresssoInteresse: true
            }
        },

        // GESTIONE CONVERSAZIONE VELOCE
        conversazione: {
            maxMessaggiInMemoria: 6, // RIDOTTO per conversazioni brevi
            timeoutInattivita: 15, // RIDOTTO - 15 minuti
            maxMessaggiSenzaCall: 4, // Dopo 4 messaggi spinge molto di più
            salvataggeregolareConversazione: true
        }
    }
};

// ===== FUNZIONI UTILITY CALL-FOCUSED =====

// Genera prompt di sistema aggressivo per le chiamate
config.bot.generateSystemPrompt = function(conversazione = {}) {
    const isBusinessHours = this.isBusinessHours();
    const messaggiScambiati = conversazione.messaggi?.length || 0;
    const pressione = messaggiScambiati >= this.conversazione.maxMessaggiSenzaCall ? "MOLTO ALTA" : "NORMALE";

    return `Sei ${this.personality.nome} per ${config.business.name}.

🎯 OBIETTIVO PRIMARIO: PRENOTARE CHIAMATA CONOSCITIVA GRATUITA DI 15 MINUTI
- Proponi la chiamata entro 3 messaggi MAX
- Se dice di sì → chiedi nome ed email SUBITO
- Se è vago → chiedi di cosa ha bisogno e ri-proponi call
- Se dice no → prova gestione obiezione, se non funziona lascia email

🏢 SERVIZI VELOCI:
${config.business.servizi.join(', ')}

⚡ STRATEGIA CONVERSAZIONE:
1° messaggio: Proposta chiamata diretta
2° messaggio: Se non risponde, chiedi di cosa ha bisogno
3° messaggio: Proponi chiamata specifica per il suo bisogno
4° messaggio: Gestisci obiezione o chiedi solo email

PRESSIONE ATTUALE: ${pressione}
MESSAGGI SCAMBIATI: ${messaggiScambiati}/${this.conversazione.maxMessaggiSenzaCall}

💬 USA QUESTE FRASI:
- "Ti va una call gratuita di 15 min?"
- "Organizziamo una chiamata veloce?"
- "Quando sei disponibile per una call?"
- "Nome ed email per la chiamata?"

🚫 NON FARE MAI:
- Spiegazioni lunghe senza proporre call
- Più di 15-20 parole per risposta
- Dimenticare di spingere verso la chiamata

📊 DATI CLIENTE RACCOLTI:
${JSON.stringify(conversazione.datiCliente || {}, null, 2)}

🔄 STATO CONVERSAZIONE: ${conversazione.stato || 'nuovo_cliente'}
⏰ ORARIO: ${isBusinessHours ? 'IN ORARIO - proponi call immediata' : 'FUORI ORARIO - proponi call per domani'}

⚡ REGOLA FONDAMENTALE: Ogni risposta deve spingere verso la chiamata!`;
};

// Controlla orari lavorativi
config.bot.isBusinessHours = function() {
    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay();
    
    return currentDay >= 1 && currentDay <= 5 && currentHour >= 9 && currentHour < 18;
};

// Processa template con placeholder
config.bot.processTemplate = function(template, data = {}) {
    let processed = template;
    
    // Sostituisci placeholders business
    processed = processed.replace(/{business\.(\w+)}/g, (match, prop) => {
        return config.business[prop] || match;
    });
    
    // Sostituisci placeholders personalizzati
    Object.entries(data).forEach(([key, value]) => {
        const regex = new RegExp(`{${key}}`, 'g');
        processed = processed.replace(regex, value);
    });
    
    return processed;
};

// Fallback message orientato alla call
config.bot.getFallbackMessage = function() {
    const messages = this.fallbackMessages;
    const randomMessage = messages[Math.floor(Math.random() * messages.length)];
    return this.processTemplate(randomMessage);
};

// Rileva intent con focus su call
config.bot.detectIntent = function(message) {
    const messageLower = message.toLowerCase();
    
    // Priorità alta per interesse chiamata
    if (this.keywords.interesse_call.some(keyword => messageLower.includes(keyword))) {
        return 'interesse_call';
    }
    
    if (this.keywords.disponibilita.some(keyword => messageLower.includes(keyword))) {
        return 'disponibilita';
    }
    
    if (this.keywords.rifiuto_hard.some(keyword => messageLower.includes(keyword))) {
        return 'rifiuto_hard';
    }
    
    if (this.keywords.rifiuto_soft.some(keyword => messageLower.includes(keyword))) {
        return 'rifiuto_soft';
    }
    
    // Altri intent standard
    for (const [intent, keywords] of Object.entries(this.keywords)) {
        if (keywords.some(keyword => messageLower.includes(keyword))) {
            return intent;
        }
    }
    
    return 'generale';
};

// Ottieni template obiezione
config.bot.getObiectionTemplate = function(message) {
    const messageLower = message.toLowerCase();
    
    for (const [obiezione, risposta] of Object.entries(this.gestione_obiezioni)) {
        if (messageLower.includes(obiezione)) {
            return risposta;
        }
    }
    
    return this.templates.proposta_chiamata_rapida;
};

// Verifica se deve aumentare pressione
config.bot.shouldIncreasePressure = function(conversazione) {
    const messaggi = conversazione.messaggi?.length || 0;
    return messaggi >= this.conversazione.maxMessaggiSenzaCall;
};

// ===== VALIDAZIONE =====
const requiredVars = [
    'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_ACCESS_TOKEN', 
    'WHATSAPP_WEBHOOK_TOKEN',
    'CLAUDE_API_KEY'
];

const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
    console.error('❌ [WHATSAPP CONFIG] ERRORE: Variabili d\'ambiente mancanti:');
    missingVars.forEach(varName => {
        console.error(`   - ${varName}`);
    });
}

config.validate = function() {
    const errors = [];
    
    if (!this.whatsapp.phoneNumberId) errors.push('WHATSAPP_PHONE_NUMBER_ID mancante');
    if (!this.whatsapp.accessToken) errors.push('WHATSAPP_ACCESS_TOKEN mancante');
    if (!this.whatsapp.webhookToken) errors.push('WHATSAPP_WEBHOOK_TOKEN mancante');
    if (!this.claude.apiKey) errors.push('CLAUDE_API_KEY mancante');
    
    if (this.whatsapp.accessToken && !this.whatsapp.accessToken.startsWith('EAA')) {
        errors.push('WHATSAPP_ACCESS_TOKEN formato non valido');
    }
    
    if (this.claude.apiKey && !this.claude.apiKey.startsWith('sk-ant-')) {
        errors.push('CLAUDE_API_KEY formato non valido');
    }
    
    return {
        isValid: errors.length === 0,
        errors: errors
    };
};

// Log configurazioni
console.log('📋 [WHATSAPP CONFIG] Configurazioni call-focused caricate:');
console.log(`   🎯 Obiettivo primario: ${config.bot.obiettivi[0].descrizione}`);
console.log(`   ⚡ Max tokens: ${config.claude.maxTokens} (risposte brevi)`);
console.log(`   📱 Max messaggi senza call: ${config.bot.conversazione.maxMessaggiSenzaCall}`);
console.log(`   📧 Campi richiesti: ${config.bot.qualification.campiObbligatori.join(', ')}`);

const validation = config.validate();
if (!validation.isValid) {
    console.error('❌ [WHATSAPP CONFIG] ERRORI:');
    validation.errors.forEach(error => console.error(`   - ${error}`));
} else {
    console.log('✅ [WHATSAPP CONFIG] Bot call-focused pronto!');
}

module.exports = config;