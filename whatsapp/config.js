// ============================================
// 📁 whatsapp/config.js - CONFIGURAZIONE COMPLETA BOT
// ============================================

// IMPORTANTE: Assicurati che dotenv sia caricato
require('dotenv').config();

console.log('🔧 [WHATSAPP CONFIG] Caricamento configurazioni complete...');

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
        maxTokens: parseInt(process.env.CLAUDE_MAX_TOKENS) || 300,
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

    // ===== CONFIGURAZIONE COMPORTAMENTO BOT =====
    bot: {
        // Personalità e tono
        personality: {
            nome: process.env.BOT_NAME || "Assistente di Costruzione Digitale",
            tono: process.env.BOT_TONE || "professionale ma amichevole e caldo",
            caratteristiche: [
                "Esperto in tecnologie digitali",
                "Orientato alle soluzioni",
                "Paziente e disponibile",
                "Focalizzato sui risultati del cliente"
            ]
        },

        // Stile di comunicazione
        comunicazione: {
            lunghezzaRisposta: "brevi e dirette (massimo 2-3 frasi)",
            domandePerVolta: 1,
            usoEmoji: "con moderazione per risultare più umano",
            linguaggio: "italiano naturale e colloquiale",
            evitare: [
                "essere troppo insistente o aggressivo",
                "fare troppe domande insieme",
                "usare gergo tecnico eccessivo",
                "rispondere in modo robotico"
            ]
        },

        // Obiettivi principali (ordinati per priorità)
        obiettivi: [
            {
                priorita: 1,
                descrizione: "Salutare cordialmente i nuovi clienti",
                azione: "Accoglienza calorosa e presentazione servizi"
            },
            {
                priorita: 2,
                descrizione: "Scoprire le esigenze del cliente",
                azione: "Porre domande specifiche e pertinenti"
            },
            {
                priorita: 3,
                descrizione: "Qualificare il lead raccogliendo informazioni",
                campiRichiesti: [
                    "Nome completo",
                    "Email di contatto", 
                    "Tipo di progetto o servizio richiesto",
                    "Budget approssimativo",
                    "Tempistiche previste",
                    "Esperienza precedente con servizi digitali"
                ]
            },
            {
                priorita: 4,
                descrizione: "Fornire informazioni sui servizi",
                azione: "Descrivere servizi pertinenti alle esigenze espresse"
            },
            {
                priorita: 5,
                descrizione: "Proporre appuntamento o call",
                azione: "Se il lead è qualificato, proporre prossimi passi"
            }
        ],

        // Template di risposta per situazioni comuni
        templates: {
            salutoIniziale: [
                "Ciao! 👋 Benvenuto in {business.name}!",
                "Sono qui per aiutarti con le tue esigenze digitali.",
                "{orarioStatus}",
                "Come posso aiutarti oggi?"
            ].join('\n\n'),

            salutoRitorno: [
                "Ciao! Bentornato! 👋", 
                "È sempre un piacere sentirti.",
                "Come posso esserti utile oggi?"
            ].join('\n\n'),

            richiestaInformazioni: [
                "Per aiutarti al meglio, avrei bisogno di qualche informazione.",
                "{domandaSpecifica}"
            ].join('\n\n'),

            descrizioneServizi: [
                "Ottima domanda! {business.name} offre questi servizi principali:",
                "",
                "🌐 **Sviluppo web** - Siti web personalizzati, e-commerce, applicazioni web",
                "📊 **Analytics e tracking** - Monitoraggio performance, analisi dati, reportistica", 
                "🤖 **Automazioni AI** - Chatbot, automazioni di processo, integrazione AI",
                "📱 **Marketing digitale** - SEO, campagne pubblicitarie, strategie digital",
                "",
                "Quale di questi ambiti ti interessa di più per il tuo progetto?"
            ].join('\n'),

            proposta_appuntamento: [
                "Perfetto! Hai fornito tutte le informazioni necessarie. 📅",
                "",
                "Ti propongo di organizzare una call gratuita di 30 minuti con il nostro team per:",
                "• Analizzare nel dettaglio le tue esigenze",
                "• Mostrarti esempi di progetti simili",
                "• Fornirti un preventivo personalizzato",
                "",
                "Quando saresti disponibile per una chiamata?"
            ].join('\n'),

            fuoriOrario: [
                "Attualmente siamo fuori orario ({business.orariApertura}).",
                "Ti risponderemo al più presto durante l'orario lavorativo.",
                "Nel frattempo, raccogli le tue informazioni così possiamo prepararci meglio!"
            ].join('\n'),

            inOrario: [
                "Siamo attualmente disponibili per assistenza immediata.",
                "Il nostro team è online e pronto ad aiutarti!"
            ].join('\n')
        },

        // Messaggi di fallback per errori
        fallbackMessages: [
            "Mi dispiace, sto avendo delle difficoltà tecniche momentanee. Potresti ripetere la tua richiesta?",
            "Scusami per l'inconveniente tecnico. Riprova tra qualche istante o contattaci direttamente.",
            "C'è stato un piccolo problema dal mio lato. Puoi riformulare la domanda?",
            "Mi dispiace, c'è stato un errore temporaneo. Riprova tra poco o scrivici via email a {business.email}."
        ],

        // Configurazione gestione conversazione
        conversazione: {
            maxMessaggiInMemoria: 10,
            timeoutInattivita: 30, // minuti
            salvataggeregolareConversazione: true,
            analisiSentiment: false // per future implementazioni
        },

        // Parole chiave per riconoscimento intent
        keywords: {
            saluto: ["ciao", "salve", "buongiorno", "buonasera", "hey", "hello"],
            servizi: ["servizi", "cosa fate", "cosa offrite", "che servizi", "prezzi", "costi"],
            contatto: ["contatto", "telefono", "email", "chiamare", "scrivere"],
            appuntamento: ["appuntamento", "call", "chiamata", "incontro", "meeting", "disponibilità"],
            problemi: ["aiuto", "problema", "non funziona", "errore", "difficoltà"],
            urgente: ["urgente", "subito", "immediato", "veloce", "presto"],
            budget: ["budget", "costo", "prezzo", "spesa", "investimento", "quota"]
        },

        // Configurazione lead qualification
        qualification: {
            campiObbligatori: ["nome", "email"],
            campiOpzionali: ["telefono", "azienda", "budget", "tempistiche"],
            budgetMinimo: 500, // €
            leadQualificatoSe: {
                haEmail: true,
                haProgetto: true,
                budgetSufficiente: true
            }
        }
    }
};

// ===== FUNZIONI UTILITY PER IL BOT =====

// Genera il prompt di sistema dinamicamente
config.bot.generateSystemPrompt = function(conversazione = {}) {
    const isBusinessHours = this.isBusinessHours();
    const statusMessaggio = isBusinessHours ? 
        this.templates.inOrario.replace(/{business\.(\w+)}/g, (match, prop) => config.business[prop]) :
        this.templates.fuoriOrario.replace(/{business\.(\w+)}/g, (match, prop) => config.business[prop]);

    return `Sei ${this.personality.nome} per ${config.business.name}, specializzata in ${config.business.settore}.

🏢 INFORMAZIONI AZIENDA:
- Nome: ${config.business.name}
- Settore: ${config.business.settore}
- Servizi: ${config.business.servizi.join(', ')}
- Orari: ${config.business.orariApertura}
- Telefono: ${config.business.telefono}
- Email: ${config.business.email}
- Sito: ${config.business.sito}
- Stato: ${statusMessaggio}

🎯 OBIETTIVI PRINCIPALI:
${this.obiettivi.map((obj, index) => `${index + 1}. ${obj.descrizione}`).join('\n')}

Campi da raccogliere per qualificare il lead:
${this.obiettivi.find(obj => obj.campiRichiesti)?.campiRichiesti.map(campo => `- ${campo}`).join('\n') || ''}

💬 STILE DI COMUNICAZIONE:
- Tono: ${this.comunicazione.tono}
- Risposte: ${this.comunicazione.lunghezzaRisposta}
- Domande: ${this.comunicazione.domandePerVolta} domanda specifica alla volta
- Emoji: ${this.comunicazione.usoEmoji}
- Linguaggio: ${this.comunicazione.linguaggio}

❌ EVITA:
${this.comunicazione.evitare.map(item => `- ${item}`).join('\n')}

🧠 PERSONALITÀ:
${this.personality.caratteristiche.map(car => `- ${car}`).join('\n')}

📊 DATI CLIENTE RACCOLTI:
${JSON.stringify(conversazione.datiCliente || {}, null, 2)}

🔄 STATO CONVERSAZIONE ATTUALE: ${conversazione.stato || 'nuovo_cliente'}

⏰ ORARIO: ${isBusinessHours ? 'IN ORARIO' : 'FUORI ORARIO'}

🎨 USA QUESTI TEMPLATE QUANDO APPROPRIATO:
- Per nuovi clienti: "${this.templates.salutoIniziale}"
- Per descrivere servizi: usa la struttura del template descrizioneServizi
- Per proporre appuntamenti: usa la struttura del template proposta_appuntamento

IMPORTANTE: Personalizza sempre i template con i dati specifici del cliente e della conversazione.`;
};

// Controlla se siamo in orario lavorativo
config.bot.isBusinessHours = function() {
    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay(); // 0 = domenica, 1 = lunedì, ecc.
    
    // Lun-Ven (1-5), 9:00-18:00 (modificabile)
    const giornoLavorativo = currentDay >= 1 && currentDay <= 5;
    const orarioLavorativo = currentHour >= 9 && currentHour < 18;
    
    return giornoLavorativo && orarioLavorativo;
};

// Sostituisce placeholders nei template
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
    
    // Sostituisci stato orario
    processed = processed.replace(/{orarioStatus}/g, 
        this.isBusinessHours() ? this.templates.inOrario : this.templates.fuoriOrario
    );
    
    return processed;
};

// Ottieni messaggio fallback casuale
config.bot.getFallbackMessage = function() {
    const messages = this.fallbackMessages;
    const randomMessage = messages[Math.floor(Math.random() * messages.length)];
    return this.processTemplate(randomMessage);
};

// Rileva intent dalla parola chiave
config.bot.detectIntent = function(message) {
    const messageLower = message.toLowerCase();
    
    for (const [intent, keywords] of Object.entries(this.keywords)) {
        if (keywords.some(keyword => messageLower.includes(keyword))) {
            return intent;
        }
    }
    
    return 'generale';
};

// ===== VALIDAZIONE CONFIGURAZIONE =====

// Verifica che le variabili siano caricate
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
    console.error('💡 Verifica che il file .env sia nella root del progetto');
    console.error('💡 Riavvia il server dopo aver configurato le variabili');
}

// Funzione di validazione
config.validate = function() {
    const errors = [];
    
    if (!this.whatsapp.phoneNumberId) {
        errors.push('WHATSAPP_PHONE_NUMBER_ID mancante');
    }
    
    if (!this.whatsapp.accessToken) {
        errors.push('WHATSAPP_ACCESS_TOKEN mancante');
    }
    
    if (!this.whatsapp.webhookToken) {
        errors.push('WHATSAPP_WEBHOOK_TOKEN mancante');
    }
    
    if (!this.claude.apiKey) {
        errors.push('CLAUDE_API_KEY mancante');
    }
    
    // Verifica formato token WhatsApp
    if (this.whatsapp.accessToken && !this.whatsapp.accessToken.startsWith('EAA')) {
        errors.push('WHATSAPP_ACCESS_TOKEN formato non valido (dovrebbe iniziare con EAA)');
    }
    
    // Verifica formato Claude API Key
    if (this.claude.apiKey && !this.claude.apiKey.startsWith('sk-ant-')) {
        errors.push('CLAUDE_API_KEY formato non valido (dovrebbe iniziare con sk-ant-)');
    }
    
    return {
        isValid: errors.length === 0,
        errors: errors
    };
};

// Log delle configurazioni (senza esporre token completi)
console.log('📋 [WHATSAPP CONFIG] Configurazioni caricate:');
console.log(`   📱 WhatsApp Phone ID: ${config.whatsapp.phoneNumberId ? '✅ OK' : '❌ MANCANTE'}`);
console.log(`   🔑 WhatsApp Token: ${config.whatsapp.accessToken ? '✅ OK' : '❌ MANCANTE'}`);
console.log(`   🔐 Webhook Token: ${config.whatsapp.webhookToken ? '✅ OK' : '❌ MANCANTE'}`);
console.log(`   🤖 Claude API Key: ${config.claude.apiKey ? '✅ OK' : '❌ MANCANTE'}`);
console.log(`   🏢 Business Name: ${config.business.name}`);
console.log(`   🎭 Bot Name: ${config.bot.personality.nome}`);
console.log(`   📊 Claude Model: ${config.claude.model}`);
console.log(`   ⏰ Business Hours: ${config.business.orariApertura}`);

// Validazione automatica
const validation = config.validate();
if (!validation.isValid) {
    console.error('❌ [WHATSAPP CONFIG] ERRORI DI CONFIGURAZIONE:');
    validation.errors.forEach(error => {
        console.error(`   - ${error}`);
    });
} else {
    console.log('✅ [WHATSAPP CONFIG] Tutte le configurazioni sono valide');
}

module.exports = config;