const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { authMiddleware, SECRET } = require('../middleware/auth');

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email, active: true });
  if (!user || !(await bcrypt.compare(password, user.password)))
    return res.status(401).json({ error: 'Credenciales inválidas' });

  const token = jwt.sign({ id: user._id, role: user.role, name: user.name }, SECRET, { expiresIn: '24h' });
  res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
});

// Crear usuario (solo admin o primer usuario)
router.post('/register', async (req, res) => {
  const count = await User.countDocuments();
  const { name, email, password, role } = req.body;
  const hash = await bcrypt.hash(password, 10);
  const user = await User.create({ name, email, password: hash, role: count === 0 ? 'admin' : (role || 'agent') });
  res.json({ id: user._id, name: user.name, email: user.email, role: user.role });
});

// Listar usuarios
router.get('/users', authMiddleware, async (req, res) => {
  const users = await User.find({}, '-password');
  res.json(users);
});

// Perfil actual
router.get('/me', authMiddleware, async (req, res) => {
  const user = await User.findById(req.user.id, '-password');
  res.json(user);
});

module.exports = router;
