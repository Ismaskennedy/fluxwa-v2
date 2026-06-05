const router = require('express').Router();
const { Message, Campaign } = require('../models');
const { authMiddleware } = require('../middleware/auth');

// Mensajes por campaña
router.get('/campaign/:id', authMiddleware, async (req, res) => {
  const { page = 1, limit = 50, status } = req.query;
  const query = { campaign: req.params.id };
  if (status) query.status = status;

  const messages = await Message.find(query)
    .populate('contact', 'name phone company')
    .populate('template', 'name')
    .populate('line', 'name')
    .limit(Number(limit))
    .skip((Number(page) - 1) * Number(limit))
    .sort({ createdAt: -1 });

  const total = await Message.countDocuments(query);
  const stats = await Message.aggregate([
    { $match: { campaign: require('mongoose').Types.ObjectId.createFromHexString(req.params.id) } },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);

  res.json({ messages, total, stats });
});

// Exportar reporte CSV
router.get('/campaign/:id/export', authMiddleware, async (req, res) => {
  const messages = await Message.find({ campaign: req.params.id })
    .populate('contact', 'name phone company')
    .populate('template', 'name')
    .populate('line', 'name');

  const rows = messages.map(m => [
    m.contact?.phone || m.phone,
    m.contact?.name || '',
    m.contact?.company || '',
    m.template?.name || '',
    m.line?.name || '',
    m.status,
    m.sentAt ? new Date(m.sentAt).toLocaleString('es-MX') : '',
    m.errorMsg || ''
  ]);

  const header = ['Teléfono','Nombre','Empresa','Plantilla','Línea','Estado','Enviado','Error'];
  const csv = [header, ...rows].map(r => r.join(',')).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="reporte_${req.params.id}.csv"`);
  res.send(csv);
});

module.exports = router;
