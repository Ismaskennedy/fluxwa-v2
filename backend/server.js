require('dotenv').config();
require('express-async-errors');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../frontend')));

// MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/whatsapp_sender')
  .then(() => console.log('✅ MongoDB conectado'))
  .catch(err => console.error('❌ MongoDB error:', err));

// Socket.io disponible globalmente
app.set('io', io);

// Rutas
app.use('/api/auth',        require('./routes/auth'));
app.use('/api/contacts',    require('./routes/contacts'));
app.use('/api/templates',   require('./routes/templates'));
app.use('/api/lines',       require('./routes/lines'));
app.use('/api/campaigns',   require('./routes/campaigns'));
app.use('/api/messages',    require('./routes/messages'));
app.use('/api/dashboard',   require('./routes/dashboard'));
app.use('/api/inbox',       require('./routes/inbox'));

// Servir frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

// Socket.io eventos
io.on('connection', (socket) => {
  console.log('🔌 Cliente conectado:', socket.id);
  socket.on('disconnect', () => console.log('🔌 Cliente desconectado:', socket.id));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Servidor en http://localhost:${PORT}`));

module.exports = { app, io };
