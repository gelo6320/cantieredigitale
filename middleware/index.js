const { isAuthenticated, protectCrmRoutes, checkApiAuth } = require('./auth');
const { checkCookieConsent, generateUserId } = require('./cookies');
const { facebookTrackingMiddleware } = require('./facebook');

module.exports = {
  isAuthenticated,
  protectCrmRoutes,
  checkApiAuth,
  checkCookieConsent,
  generateUserId,
  facebookTrackingMiddleware
};