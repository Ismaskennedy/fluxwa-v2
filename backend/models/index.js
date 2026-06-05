const mongoose = require('mongoose');
const { Schema } = mongoose;

// ─── USUARIO ─────────────────────────────────────────────────────────────────
const UserSchema = new Schema({
  name:     { type: String, required: true },
  email:    { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role:     { type: String, enum: ['admin','agent'], default: 'agent' },
  active:   { type: Boolean, default: true }
}, { timestamps: true });

// ─── LINEA WHATSAPP ───────────────────────────────────────────────────────────
const LineSchema = new Schema({
  name:        { type: String, required: true },
  phone:       { type: String },
  status:      { type: String, enum: ['disconnected','connecting','connected','banned'], default: 'disconnected' },
  sessionData: { type: String },
  qrCode:      { type: String },
  sentToday:   { type: Number, default: 0 },
  lastReset:   { type: Date, default: Date.now }
}, { timestamps: true });

// ─── PLANTILLA ────────────────────────────────────────────────────────────────
const TemplateSchema = new Schema({
  name:    { type: String, required: true },
  content: { type: String, required: true },  // soporta {{nombre}}, {{empresa}}, etc.
  type:    { type: String, enum: ['text','image','document'], default: 'text' },
  mediaUrl:{ type: String },
  active:  { type: Boolean, default: true }
}, { timestamps: true });

// ─── CONTACTO ─────────────────────────────────────────────────────────────────
const ContactSchema = new Schema({
  phone:    { type: String, required: true },
  name:     { type: String },
  company:  { type: String },
  email:    { type: String },
  extra:    { type: Schema.Types.Mixed },  // campos extra del CSV
  tags:     [String],
  optOut:   { type: Boolean, default: false }
}, { timestamps: true });

// ─── CAMPAÑA ──────────────────────────────────────────────────────────────────
const CampaignSchema = new Schema({
  name:        { type: String, required: true },
  status:      { type: String, enum: ['draft','running','paused','completed','failed'], default: 'draft' },
  contacts:    [{ type: Schema.Types.ObjectId, ref: 'Contact' }],
  templates:   [{ type: Schema.Types.ObjectId, ref: 'Template' }],  // rotación
  lines:       [{ type: Schema.Types.ObjectId, ref: 'Line' }],       // rotación
  delayMin:    { type: Number, default: 3 },   // segundos mínimo entre mensajes
  delayMax:    { type: Number, default: 8 },   // segundos máximo entre mensajes
  scheduledAt: { type: Date },
  startedAt:   { type: Date },
  completedAt: { type: Date },
  totalContacts:{ type: Number, default: 0 },
  sent:        { type: Number, default: 0 },
  failed:      { type: Number, default: 0 },
  createdBy:   { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// ─── MENSAJE ENVIADO ──────────────────────────────────────────────────────────
const MessageSchema = new Schema({
  campaign:   { type: Schema.Types.ObjectId, ref: 'Campaign' },
  contact:    { type: Schema.Types.ObjectId, ref: 'Contact' },
  line:       { type: Schema.Types.ObjectId, ref: 'Line' },
  template:   { type: Schema.Types.ObjectId, ref: 'Template' },
  phone:      { type: String, required: true },
  content:    { type: String },
  waMessageId:{ type: String },
  status:     { type: String, enum: ['pending','sent','delivered','read','failed'], default: 'pending' },
  errorMsg:   { type: String },
  sentAt:     { type: Date }
}, { timestamps: true });

// ─── CONVERSACIÓN (INBOX) ─────────────────────────────────────────────────────
const ConversationSchema = new Schema({
  phone:       { type: String, required: true, unique: true },
  contactName: { type: String },
  line:        { type: Schema.Types.ObjectId, ref: 'Line' },
  assignedTo:  { type: Schema.Types.ObjectId, ref: 'User', default: null },
  status:      { type: String, enum: ['open','assigned','closed'], default: 'open' },
  lastMessage: { type: String },
  lastMessageAt:{ type: Date },
  unread:      { type: Number, default: 0 }
}, { timestamps: true });

// ─── MENSAJE DE INBOX ─────────────────────────────────────────────────────────
const InboxMessageSchema = new Schema({
  conversation: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
  direction:    { type: String, enum: ['inbound','outbound'], required: true },
  content:      { type: String },
  mediaUrl:     { type: String },
  mediaType:    { type: String },
  waMessageId:  { type: String },
  sentBy:       { type: Schema.Types.ObjectId, ref: 'User' },
  status:       { type: String, enum: ['sent','delivered','read','failed'], default: 'sent' },
  timestamp:    { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = {
  User:         mongoose.model('User', UserSchema),
  Line:         mongoose.model('Line', LineSchema),
  Template:     mongoose.model('Template', TemplateSchema),
  Contact:      mongoose.model('Contact', ContactSchema),
  Campaign:     mongoose.model('Campaign', CampaignSchema),
  Message:      mongoose.model('Message', MessageSchema),
  Conversation: mongoose.model('Conversation', ConversationSchema),
  InboxMessage: mongoose.model('InboxMessage', InboxMessageSchema)
};
