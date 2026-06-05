const router = require('express').Router();
const { Line } = require('../models');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { initLine, disconnectLine } = require('../services/whatsapp');

// Listar líneas
router.get('/', authMiddleware, async (req, res) => {
  const lines = await Line.find({}, '-sessionData');
  res.json(lines);
});

// Crear línea
router.post('/', authMiddleware, adminOnly, async (req, res) => {
  const line = await Line.create(req.body);
  res.json(line);
});

// Conectar línea (lanza OpenWA)
router.post('/:id/connect', authMiddleware, adminOnly, async (req, res) => {
  const io = req.app.get('io');
  // Lanzar en background
  initLine(req.params.id, io).catch(err => console.error('Error init line:', err));
  res.json({ message: 'Conectando línea, espera el QR...' });
});

// Desconectar línea
router.post('/:id/disconnect', authMiddleware, adminOnly, async (req, res) => {
  await disconnectLine(req.params.id);
  res.json({ message: 'Línea desconectada' });
});

// Eliminar línea
router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  await disconnectLine(req.params.id).catch(() => {});
  await Line.findByIdAndDelete(req.params.id);
  res.json({ message: 'Línea eliminada' });
});

module.exports = router;
