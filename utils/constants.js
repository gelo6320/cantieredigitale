// Costanti per stati dei lead
const LEAD_STATUSES = {
    NEW: 'new',
    CONTACTED: 'contacted',
    QUALIFIED: 'qualified',
    OPPORTUNITY: 'opportunity',
    PROPOSAL: 'proposal',
    CONVERTED: 'converted',
    LOST: 'lost'
  };
  
  // Costanti per tipi di form
  const FORM_TYPES = {
    FORM: 'form',
    BOOKING: 'booking',
    FACEBOOK: 'facebook',
    CONTACT: 'contact'
  };
  
  // Costanti per stati dei progetti
  const PROJECT_STATUSES = {
    PLANNING: 'pianificazione',
    IN_PROGRESS: 'in corso',
    PAUSED: 'in pausa',
    COMPLETED: 'completato',
    CANCELLED: 'cancellato'
  };
  
  // Costanti per stati delle prenotazioni
  const BOOKING_STATUSES = {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    CANCELLED: 'cancelled',
    COMPLETED: 'completed',
    QUALIFIED: 'qualified',
    OPPORTUNITY: 'opportunity',
    PROPOSAL: 'proposal',
    CUSTOMER: 'customer',
    LOST: 'lost'
  };
  
  // Costanti per stati delle conversazioni chat
  const CHAT_STATUSES = {
    ACTIVE: 'active',
    COMPLETED: 'completed',
    ABANDONED: 'abandoned',
    BLOCKED: 'blocked',
    ARCHIVED: 'archived'
  };
  
  // Costanti per ruoli degli utenti
  const USER_ROLES = {
    USER: 'user',
    ADMIN: 'admin'
  };
  
  // Costanti per tipi di eventi del calendario
  const CALENDAR_EVENT_TYPES = {
    APPOINTMENT: 'appointment',
    REMINDER: 'reminder'
  };
  
  // Costanti per consenso cookie
  const COOKIE_CONSENT_TYPES = {
    ESSENTIAL: 'essential',
    ANALYTICS: 'analytics',
    MARKETING: 'marketing'
  };
  
  // Costanti per Facebook
  const FACEBOOK_EVENT_NAMES = {
    LEAD: 'Lead',
    PURCHASE: 'Purchase',
    PAGE_VIEW: 'PageView',
    COMPLETE_REGISTRATION: 'CompleteRegistration',
    CONTACT: 'Contact'
  };
  
  // Costanti per WhatsApp
  const WHATSAPP_MESSAGE_ROLES = {
    USER: 'user',
    ASSISTANT: 'assistant',
    SYSTEM: 'system'
  };
  
  const WHATSAPP_CONVERSATION_RESULTS = {
    APPOINTMENT_BOOKED: 'appointment_booked',
    LEAD_QUALIFIED: 'lead_qualified',
    NOT_INTERESTED: 'not_interested',
    INCOMPLETE: 'incomplete',
    ERROR: 'error'
  };
  
  // Costanti per priorità
  const PRIORITY_LEVELS = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    URGENT: 'urgent'
  };
  
  // Costanti per i timeframe delle statistiche
  const STATS_TIMEFRAMES = {
    DAILY: '24h',
    WEEKLY: '7d',
    MONTHLY: '30d',
    ALL_TIME: 'all'
  };
  
  // Costanti per tipi di eventi di tracciamento
  const TRACKING_EVENT_TYPES = {
    FORM_INTERACTION: 'form_interaction',
    CLICK: 'click',
    VIDEO: 'video',
    SCROLL: 'scroll',
    PAGE_VISIBILITY: 'page_visibility',
    TIME_ON_PAGE: 'time_on_page',
    SESSION_END: 'session_end',
    CONVERSION: 'conversion',
    PAGEVIEW: 'pageview',
    SYSTEM: 'system',
    USER: 'user',
    INTERACTION: 'interaction',
    MEDIA: 'media',
    ERROR: 'error',
    NAVIGATION: 'navigation',
    USER_INACTIVE: 'user_inactive',
    USER_ACTIVE: 'user_active'
  };
  
  // Costanti per identificatori utente
  const USER_IDENTIFIER_TYPES = {
    USER_ID: 'userId',
    FINGERPRINT: 'fingerprint',
    SESSION_ID: 'sessionId'
  };
  
  // Costanti per valori predefiniti
  const DEFAULT_VALUES = {
    CURRENCY: 'EUR',
    TIMEZONE: 'Europe/Rome',
    PAGINATION_LIMIT: 20,
    MAX_RETRIES: 3,
    TIMEOUT_MS: 10000,
    SESSION_DURATION_HOURS: 24
  };
  
  // Costanti per validazione
  const VALIDATION_LIMITS = {
    MIN_PASSWORD_LENGTH: 8,
    MAX_TEXT_LENGTH: 5000,
    MAX_NAME_LENGTH: 100,
    MAX_EMAIL_LENGTH: 255,
    MAX_PHONE_LENGTH: 20
  };
  
  // Costanti per URLs e patterns
  const URL_PATTERNS = {
    EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    PHONE_REGEX: /^[\+]?[1-9][\d]{0,15}$/,
    URL_REGEX: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/
  };
  
  // Costanti per messaggi di errore
  const ERROR_MESSAGES = {
    UNAUTHORIZED: 'Non autorizzato',
    FORBIDDEN: 'Accesso negato',
    NOT_FOUND: 'Risorsa non trovata',
    INVALID_INPUT: 'Input non valido',
    DATABASE_ERROR: 'Errore del database',
    NETWORK_ERROR: 'Errore di rete',
    VALIDATION_ERROR: 'Errore di validazione',
    SERVER_ERROR: 'Errore interno del server'
  };
  
  // Costanti per messaggi di successo
  const SUCCESS_MESSAGES = {
    CREATED: 'Creato con successo',
    UPDATED: 'Aggiornato con successo',
    DELETED: 'Eliminato con successo',
    SENT: 'Inviato con successo',
    SAVED: 'Salvato con successo'
  };
  
  module.exports = {
    LEAD_STATUSES,
    FORM_TYPES,
    PROJECT_STATUSES,
    BOOKING_STATUSES,
    CHAT_STATUSES,
    USER_ROLES,
    CALENDAR_EVENT_TYPES,
    COOKIE_CONSENT_TYPES,
    FACEBOOK_EVENT_NAMES,
    WHATSAPP_MESSAGE_ROLES,
    WHATSAPP_CONVERSATION_RESULTS,
    PRIORITY_LEVELS,
    STATS_TIMEFRAMES,
    TRACKING_EVENT_TYPES,
    USER_IDENTIFIER_TYPES,
    DEFAULT_VALUES,
    VALIDATION_LIMITS,
    URL_PATTERNS,
    ERROR_MESSAGES,
    SUCCESS_MESSAGES
  };