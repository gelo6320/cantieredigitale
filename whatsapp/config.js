// ============================================
// 📁 whatsapp/config.js - CONFIGURAZIONE AI-ENHANCED
// ============================================

require('dotenv').config();

const config = {
    // ===== API =====
    whatsapp: {
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
        accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
        webhookToken: process.env.WHATSAPP_WEBHOOK_TOKEN,
        verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || process.env.WHATSAPP_WEBHOOK_TOKEN
    },

    database: {
        mongoUrl: process.env.MONGODB_URI_BOOKING || process.env.MONGODB_URI || 'mongodb://localhost:27017/appointments'
    },
    
    claude: {
        apiKey: process.env.CLAUDE_API_KEY,
        model: 'claude-sonnet-4-20250514',
        maxTokens: 300,
        timeout: 15000
    },
    
    server: {
        port: process.env.PORT || 3000,
        environment: process.env.NODE_ENV || 'development'
    },

    // ===== BUSINESS INFO DETTAGLIATA =====
    business: {
        name: "Costruzione Digitale",
        settore: "Marketing specializzato per imprese edili",
        fondatore: "Oleg Bolonniy",
        metodo: "Metodo chiavi in mano per scalare il fatturato in 30 giorni",
        
        servizi: {
            principale: "Sistema completo di marketing digitale per imprese edili",
            pilastri: [
                "Analisi approfondita del mercato locale e della concorrenza",
                "Campagne pubblicitarie ottimizzate per clienti di alto profilo", 
                "Sistema di conversione automatizzato che trasforma contatti in contratti"
            ],
            vantaggi: [
                "Abbattimento dei costi pubblicitari con targeting avanzato",
                "Triplicazione del valore clienti tramite analisi dati",
                "Zero competenze tecniche richieste",
                "Sistema facile e automatizzato",
                "Completamente scalabile e tracciabile"
            ]
        },
        
        risultati: {
            tempi: "Primi contatti qualificati in 7-10 giorni",
            crescita: "Aumento fatturato 20-40% entro 30 giorni",
            garanzia: "30 giorni soddisfatti o rimborsati"
        },
        
        copertura: "Tutta Italia, dal Nord al Sud",
        
        telefono: process.env.BUSINESS_PHONE || "+39 123 456 7890",
        email: process.env.BUSINESS_EMAIL || "info@costruzionedigitale.it",
        sito: "https://www.costruzionedigitale.com"
    },

    // ===== BOT AI CONFIGURATION =====
    bot: {
        name: "Sofia",
        personality: "assistente esperta e professionale, diretta ma cordiale",
        
        // STEP DEL PROCESSO (mantenuti per tracciamento)
        steps: {
            START: 'start',
            INTERESSE: 'interesse', 
            NOME: 'nome',
            COGNOME: 'cognome',
            EMAIL: 'email',
            DATA: 'data',
            ORA: 'ora',
            RIEPILOGO: 'riepilogo',
            CONFERMATO: 'confermato'
        },

        // PAROLE CHIAVE PER INTENT DETECTION
        keywords: {
            saluto: ["ciao", "salve", "buongiorno", "buonasera", "hey", "pronto"],
            appuntamento: ["appuntamento", "incontro", "consulenza", "prenotare", "fissare", "call", "telefonata"],
            servizi: ["servizi", "cosa fate", "marketing", "prezzi", "web", "sito", "pubblicità", "social", "lead"],
            prezzi: ["prezzo", "costo", "quanto", "tariffa", "investimento", "budget"],
            risultati: ["risultati", "garanzie", "funziona", "tempo", "quando", "efficace"],
            conferma: ["sì", "si", "ok", "va bene", "perfetto", "confermo", "conferma", "esatto"],
            rifiuto: ["no", "non", "annulla", "cancella", "non interessato"],
            ricomincia: ["ricomincia", "riparti", "da capo", "riprendi"],
            dubbi: ["ma", "però", "dubbio", "sicuro", "davvero", "veramente"]
        },

        // SYSTEM PROMPT PER CLAUDE
        systemPrompt: `Sei Sofia, assistente virtuale di Costruzione Digitale, agenzia di marketing specializzata per imprese edili.

INFORMAZIONI AZIENDA:
- Fondatore: Oleg Bolonniy
- Metodo: "Chiavi in mano" per scalare fatturato imprese edili in 30 giorni
- Servizi: Sistema completo marketing digitale (analisi mercato, campagne ottimizzate, conversione automatizzata)
- Risultati: Primi contatti in 7-10 giorni, +20-40% fatturato in 30 giorni
- Garanzia: 30 giorni soddisfatti o rimborsati
- Copertura: Tutta Italia
- Vantaggi: Zero competenze richieste, tutto automatizzato, costi ridotti, risultati tracciabili

TUO OBIETTIVO: Fissare appuntamenti di consulenza gratuita con imprenditori edili.

PERSONALITÀ: Professionale ma cordiale, diretta, competente. Usa emoji con parsimonia.

REGOLE:
1. Mantieni conversazioni naturali ma orientate all'obiettivo
2. Rispondi sempre a domande sui servizi con informazioni specifiche
3. Segui gli step di raccolta dati quando necessario
4. Non inventare informazioni non fornite
5. Se non sai qualcosa, proponi la consulenza per approfondire
6. Usa un linguaggio da imprenditore a imprenditore, professionale ma accessibile

STEP PROCESSO (da seguire quando il cliente è interessato):
1. START → Presentazione e verifica interesse
2. INTERESSE → Raccolta nome
3. NOME/COGNOME → Raccolta nome completo  
4. EMAIL → Raccolta email
5. DATA → Raccolta data preferita
6. ORA → Raccolta ora preferita
7. RIEPILOGO → Conferma finale
8. CONFERMATO → Appuntamento fissato`
    }
};

// ===== FUNZIONI AI-ENHANCED =====

// Rileva intent dal messaggio (semplificato - ora Claude gestisce la logica principale)
config.bot.detectIntent = function(message) {
    const messageLower = message.toLowerCase();
    
    for (const [intent, keywords] of Object.entries(this.keywords)) {
        if (keywords.some(keyword => messageLower.includes(keyword))) {
            return intent;
        }
    }
    
    return 'generale';
};

// Estrae dati dal messaggio (mantenuto per backup, ma Claude può sovrascrivere)
config.bot.extractData = function(conversazione, messaggio) {
    const step = conversazione.currentStep;
    const dati = conversazione.datiCliente;
    
    switch (step) {
        case this.steps.NOME:
            if (messaggio.length >= 1) {
                const nomeCompleto = messaggio.trim();
                const parole = nomeCompleto.split(/\s+/);
                
                if (parole.length >= 2) {
                    dati.nome = nomeCompleto;
                    dati.nomeCompleto = true;
                    console.log(`👤 Nome completo estratto: ${dati.nome}`);
                } else if (parole.length === 1) {
                    dati.nome = nomeCompleto;
                    dati.nomeCompleto = false;
                    console.log(`👤 Solo nome estratto: ${dati.nome}`);
                }
            }
            break;
            
        case this.steps.EMAIL:
            const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
            const emailMatch = messaggio.match(emailRegex);
            if (emailMatch) {
                dati.email = emailMatch[0];
                console.log(`📧 Email estratta: ${dati.email}`);
            }
            break;

        case this.steps.COGNOME:
            if (messaggio.length >= 1) {
                dati.cognome = messaggio.trim();
                console.log(`👤 Cognome estratto: ${dati.cognome}`);
            }
            break;
            
        case this.steps.DATA:
            if (messaggio.length >= 1) {
                const rawDate = messaggio.trim();
                dati.data = this.normalizeDate(rawDate);
                console.log(`📅 Data estratta: ${rawDate} → ${dati.data}`);
            }
            break;
            
        case this.steps.ORA:
            if (messaggio.length >= 1) {
                const rawTime = messaggio.trim();
                dati.ora = this.normalizeTime(rawTime);
                console.log(`🕐 Ora estratta: ${rawTime} → ${dati.ora}`);
            }
            break;
    }
};

// Normalizza data (mantenuto)
config.bot.normalizeDate = function(dateText) {
    const oggi = new Date();
    const dateTextLower = dateText.toLowerCase().trim();
    
    if (dateTextLower.includes('oggi')) {
        return oggi.toISOString().split('T')[0];
    }
    if (dateTextLower.includes('domani')) {
        const domani = new Date(oggi);
        domani.setDate(oggi.getDate() + 1);
        return domani.toISOString().split('T')[0];
    }
    
    const giorni = {
        'lunedì': 1, 'martedì': 2, 'mercoledì': 3, 'giovedì': 4, 
        'venerdì': 5, 'sabato': 6, 'domenica': 0
    };
    
    for (const [giorno, numeroGiorno] of Object.entries(giorni)) {
        if (dateTextLower.includes(giorno)) {
            const prossimoGiorno = new Date(oggi);
            const diff = (numeroGiorno + 7 - oggi.getDay()) % 7;
            prossimoGiorno.setDate(oggi.getDate() + (diff === 0 ? 7 : diff));
            return prossimoGiorno.toISOString().split('T')[0];
        }
    }
    
    return dateText;
};

// Normalizza ora (mantenuto)
config.bot.normalizeTime = function(timeText) {
    const timeTextLower = timeText.toLowerCase().trim();
    
    const numberMatch = timeTextLower.match(/(\d{1,2})/);
    if (numberMatch) {
        let hour = parseInt(numberMatch[1]);
        
        if (timeTextLower.includes('mattina') || timeTextLower.includes('mattino')) {
            return `${hour.toString().padStart(2, '0')}:00`;
        }
        if (timeTextLower.includes('pomeriggio') || timeTextLower.includes('sera')) {
            if (hour < 12) hour += 12;
            return `${hour.toString().padStart(2, '0')}:00`;
        }
        return `${hour.toString().padStart(2, '0')}:00`;
    }
    
    const timeMap = {
        'mattina': '09:00',
        'mattino': '09:00', 
        'pomeriggio': '14:00',
        'sera': '18:00',
        'pranzo': '12:00'
    };
    
    for (const [key, value] of Object.entries(timeMap)) {
        if (timeTextLower === key) {
            return value;
        }
    }
    
    if (/^\d{1,2}:\d{2}$/.test(timeTextLower)) {
        return timeTextLower;
    }
    
    return timeText;
};

// Verifica se dati appuntamento sono completi
config.bot.isComplete = function(conversazione) {
    const dati = conversazione.datiCliente;
    return dati.nome && dati.email && dati.data && dati.ora;
};

// Validazione configurazione
config.validate = function() {
    const required = ['WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_WEBHOOK_TOKEN', 'CLAUDE_API_KEY'];
    const errors = required.filter(varName => !process.env[varName]);
    
    return {
        isValid: errors.length === 0,
        errors: errors
    };
};

module.exports = config;