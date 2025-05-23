// ============================================
// 📁 whatsapp/config.js
// ============================================
const config = {
    whatsapp: {
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
        accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
        webhookToken: process.env.WHATSAPP_WEBHOOK_TOKEN
    },
    claude: {
        apiKey: process.env.CLAUDE_API_KEY,
        model: 'claude-sonnet-4-20250514'
    },
    business: {
        name: process.env.BUSINESS_NAME || "Costruzione Digitale",
        settore: process.env.BUSINESS_SECTOR || "Consulenza digitale",
        servizi: (process.env.BUSINESS_SERVICES || "Sviluppo web,Analytics,Marketing").split(','),
        orariApertura: process.env.BUSINESS_HOURS || "Lun-Ven 9:00-18:00"
    }
};

module.exports = config;