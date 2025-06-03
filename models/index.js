const AdminSchema = require('./admin');
const ClientSchema = require('./client');
const VisitSchema = require('./visit');
const BookingSchema = require('./booking');
const { FacebookEventSchema, FacebookLeadSchema, FacebookAudienceSchema } = require('./facebook');
const { 
  StatisticsSchema, 
  DailyStatisticsSchema, 
  WeeklyStatisticsSchema, 
  MonthlyStatisticsSchema, 
  TotalStatisticsSchema 
} = require('./statistics');
const { ChatMessageSchema, ChatConversationSchema } = require('./chat');
const ProjectSchema = require('./project');
const SiteSchema = require('./site');
const { UserPathSchema, InteractionSchema } = require('./userPath');
const { CookieConsentSchema, FormDataSchema, CalendarEventSchema } = require('./misc');

module.exports = {
  AdminSchema,
  ClientSchema,
  VisitSchema,
  BookingSchema,
  FacebookEventSchema,
  FacebookLeadSchema,
  FacebookAudienceSchema,
  StatisticsSchema,
  DailyStatisticsSchema,
  WeeklyStatisticsSchema,
  MonthlyStatisticsSchema,
  TotalStatisticsSchema,
  ChatMessageSchema,
  ChatConversationSchema,
  ProjectSchema,
  SiteSchema,
  UserPathSchema,
  InteractionSchema,
  CookieConsentSchema,
  FormDataSchema,
  CalendarEventSchema
};