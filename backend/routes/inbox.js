const router = require('express').Router();
const { Conversation, InboxMessage, User } = require('../models');
const { authMiddleware } = require('../middleware/auth');
const { sendInboxMessage } = require('../services/whatsapp');

// Listar conversaciones
router.get('/conversations', authMiddleware, async (req, res) => {
  const { status, assignedTo, page = 1, limit = 30 } = req.query;
  const query = {};
  if (status) query.status = status;
  if (assignedTo === 'me') query.assignedTo = req.user.id;
  if (assignedTo === 'unassigned') query.assignedTo = null;

  const conversations = await Conversation.find(query)
    .populate('assignedTo', 'name')
    .populate('line', 'name')
    .sort({ lastMessageAt: -1 })
    .limit(Number(limit))
    .skip((Number(page) - 1) * Number(limit));

  const total = await Conversation.countDocuments(query);
  res.json({ conversations, total });
});

// Tomar conversación (asignarla al agente actual)
router.post('/conversations/:id/take', authMiddleware, async (req, res) => {
  const conv = await Conversation.findById(req.params.id);
  if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' });
  if (conv.assignedTo && conv.assignedTo.toString() !== req.user.id) {
    return res.status(400).json({ error: 'Esta conversación ya está asignada a otro agente' });
  }
  const updated = await Conversation.findByIdAndUpdate(
    req.params.id,
    { assignedTo: req.user.id, status: 'assigned' },
    { new: true }
  ).populate('assignedTo', 'name');

  const io = req.app.get('io');
  if (io) io.emit('conversation_assigned', { conversationId: req.params.id, agent: req.user });

  res.json(updated);
});

// Liberar conversación
router.post('/conversations/:id/release', authMiddleware, async (req, res) => {
  const conv = await Conversation.findById(req.params.id);
  if (conv.assignedTo?.toString() !== req.user.id)
    return res.status(403).json({ error: 'No puedes liberar una conversación que no es tuya' });

  await Conversation.findByIdAndUpdate(req.params.id, { assignedTo: null, status: 'open' });
  res.json({ message: 'Conversación liberada' });
});

// Cerrar conversación
router.post('/conversations/:id/close', authMiddleware, async (req, res) => {
  await Conversation.findByIdAndUpdate(req.params.id, { status: 'closed' });
  res.json({ message: 'Conversación cerrada' });
});

// Mensajes de una conversación
router.get('/conversations/:id/messages', authMiddleware, async (req, res) => {
  // Marcar como leídos
  await Conversation.findByIdAndUpdate(req.params.id, { unread: 0 });

  const messages = await InboxMessage.find({ conversation: req.params.id })
    .populate('sentBy', 'name')
    .sort({ timestamp: 1 });
  res.json(messages);
});

// Enviar mensaje desde inbox
router.post('/conversations/:id/send', authMiddleware, async (req, res) => {
  const { content } = req.body;
  const io = req.app.get('io');
  const msg = await sendInboxMessage(req.params.id, content, req.user.id, io);
  res.json(msg);
});

module.exports = router;
