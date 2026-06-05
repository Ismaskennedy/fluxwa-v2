const router = require('express').Router();
const { Template } = require('../models');
const { authMiddleware } = require('../middleware/auth');

router.get('/', authMiddleware, async (req, res) => {
  const templates = await Template.find({ active: true });
  res.json(templates);
});

router.post('/', authMiddleware, async (req, res) => {
  const t = await Template.create(req.body);
  res.json(t);
});

router.put('/:id', authMiddleware, async (req, res) => {
  const t = await Template.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(t);
});

router.delete('/:id', authMiddleware, async (req, res) => {
  await Template.findByIdAndUpdate(req.params.id, { active: false });
  res.json({ message: 'Plantilla eliminada' });
});

module.exports = router;
