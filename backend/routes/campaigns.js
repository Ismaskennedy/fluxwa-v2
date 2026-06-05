const router = require('express').Router();
const { Campaign, Contact } = require('../models');
const { authMiddleware } = require('../middleware/auth');
const { runCampaign } = require('../services/whatsapp');

// Listar campañas
router.get('/', authMiddleware, async (req, res) => {
  const campaigns = await Campaign.find()
    .populate('templates', 'name')
    .populate('lines', 'name status')
    .populate('createdBy', 'name')
    .sort({ createdAt: -1 });
  res.json(campaigns);
});

// Crear campaña
router.post('/', authMiddleware, async (req, res) => {
  const { name, contactIds, templates, lines, delayMin, delayMax, scheduledAt } = req.body;

  const campaign = await Campaign.create({
    name,
    contacts: contactIds,
    templates,
    lines,
    delayMin: delayMin || 3,
    delayMax: delayMax || 8,
    scheduledAt,
    totalContacts: contactIds.length,
    createdBy: req.user.id
  });

  res.json(campaign);
});

// Iniciar campaña
router.post('/:id/start', authMiddleware, async (req, res) => {
  const campaign = await Campaign.findById(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaña no encontrada' });
  if (campaign.status === 'running') return res.status(400).json({ error: 'Ya está en ejecución' });

  const io = req.app.get('io');
  // Ejecutar en background
  runCampaign(campaign, io).catch(err => console.error('Error campaña:', err));

  res.json({ message: 'Campaña iniciada' });
});

// Pausar campaña
router.post('/:id/pause', authMiddleware, async (req, res) => {
  await Campaign.findByIdAndUpdate(req.params.id, { status: 'paused' });
  res.json({ message: 'Campaña pausada' });
});

// Reanudar campaña
router.post('/:id/resume', authMiddleware, async (req, res) => {
  const campaign = await Campaign.findById(req.params.id);
  const io = req.app.get('io');
  runCampaign(campaign, io).catch(err => console.error('Error campaña:', err));
  res.json({ message: 'Campaña reanudada' });
});

// Detalle de campaña
router.get('/:id', authMiddleware, async (req, res) => {
  const campaign = await Campaign.findById(req.params.id)
    .populate('templates')
    .populate('lines', 'name status phone');
  res.json(campaign);
});

// Eliminar campaña (solo draft)
router.delete('/:id', authMiddleware, async (req, res) => {
  const c = await Campaign.findById(req.params.id);
  if (c.status === 'running') return res.status(400).json({ error: 'No puedes eliminar una campaña en ejecución' });
  await Campaign.findByIdAndDelete(req.params.id);
  res.json({ message: 'Campaña eliminada' });
});

module.exports = router;
