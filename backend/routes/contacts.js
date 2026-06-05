const router = require('express').Router();
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const { Contact } = require('../models');
const { authMiddleware } = require('../middleware/auth');

const upload = multer({ dest: 'uploads/' });

// Listar contactos
router.get('/', authMiddleware, async (req, res) => {
  const { page = 1, limit = 50, search } = req.query;
  const query = search
    ? { $or: [{ phone: new RegExp(search, 'i') }, { name: new RegExp(search, 'i') }] }
    : {};
  const contacts = await Contact.find(query)
    .limit(Number(limit))
    .skip((Number(page) - 1) * Number(limit))
    .sort({ createdAt: -1 });
  const total = await Contact.countDocuments(query);
  res.json({ contacts, total, page: Number(page), pages: Math.ceil(total / limit) });
});

// Crear contacto manual
router.post('/', authMiddleware, async (req, res) => {
  const contact = await Contact.create(req.body);
  res.json(contact);
});

// Subir CSV
router.post('/upload-csv', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se subió archivo' });

  const results = [];
  const errors = [];

  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on('data', (row) => {
      // Normalizar: buscar campo teléfono con distintos nombres
      const phone = (row.telefono || row.phone || row.tel || row.celular || row.movil || '').toString().trim();
      if (!phone) { errors.push({ row, error: 'Sin teléfono' }); return; }

      // Limpiar número: solo dígitos, agregar 52 si es MX de 10 dígitos
      let cleanPhone = phone.replace(/\D/g, '');
      if (cleanPhone.length === 10) cleanPhone = '52' + cleanPhone;

      results.push({
        phone: cleanPhone,
        name: row.nombre || row.name || '',
        company: row.empresa || row.company || '',
        email: row.email || row.correo || '',
        extra: row
      });
    })
    .on('end', async () => {
      // Insertar en MongoDB (upsert por teléfono)
      let inserted = 0, updated = 0;
      for (const c of results) {
        const existing = await Contact.findOne({ phone: c.phone });
        if (existing) {
          await Contact.findByIdAndUpdate(existing._id, c);
          updated++;
        } else {
          await Contact.create(c);
          inserted++;
        }
      }
      fs.unlinkSync(req.file.path);
      res.json({ inserted, updated, errors: errors.length, errorDetails: errors.slice(0, 10) });
    })
    .on('error', (err) => {
      res.status(500).json({ error: err.message });
    });
});

// Eliminar contacto
router.delete('/:id', authMiddleware, async (req, res) => {
  await Contact.findByIdAndDelete(req.params.id);
  res.json({ message: 'Contacto eliminado' });
});

// Opt-out
router.post('/:id/optout', authMiddleware, async (req, res) => {
  await Contact.findByIdAndUpdate(req.params.id, { optOut: true });
  res.json({ message: 'Contacto marcado como opt-out' });
});

module.exports = router;
