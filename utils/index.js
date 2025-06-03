const connectionManager = require('./connectionManager');
const { getUserConnection, getUserConfig, Admin } = require('./userHelpers');
const {
  getEventCategory,
  getRealLeadsForCampaign,
  generateUserId,
  isValidEmail,
  cleanPhoneNumber,
  normalizePhoneNumber,
  generateUniqueId,
  formatDateItalian,
  daysBetween,
  capitalize,
  truncateText,
  parseUtmParams,
  sanitizeHtml,
  deepMerge,
  debounce,
  retryWithBackoff
} = require('./helpers');

const constants = require('./constants');

module.exports = {
  // Connection Manager
  connectionManager,
  
  // User helpers
  getUserConnection,
  getUserConfig,
  Admin,
  
  // General helpers
  getEventCategory,
  getRealLeadsForCampaign,
  generateUserId,
  isValidEmail,
  cleanPhoneNumber,
  normalizePhoneNumber,
  generateUniqueId,
  formatDateItalian,
  daysBetween,
  capitalize,
  truncateText,
  parseUtmParams,
  sanitizeHtml,
  deepMerge,
  debounce,
  retryWithBackoff,
  
  // Constants
  ...constants
};