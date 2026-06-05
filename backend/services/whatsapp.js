const { create, Client } = require('@open-wa/wa-automate');
const { Line, Conversation, InboxMessage, Message } = require('../models');

// Map de clientes activos: lineId => Client
const clients = new Map();

/**
 * Inicializa una línea de WhatsApp
 */
async function initLine(lineId, io) {
  const line = await Line.findById(lineId);
  if (!line) throw new Error('Línea no encontrada');

  await Line.findByIdAndUpdate(lineId, { status: 'connecting', qrCode: null });

  const options = {
    sessionId: `line_${lineId}`,
    headless: true,
    qrTimeout: 60,
    authTimeout: 60,
    blockCrashLogs: true,
    disableSpins: true,
    logConsole: false,
    popup: false,
    multiDevice: true,
    sessionDataPath: `./sessions/`,
    // Callback de QR
    qrCallback: async (qrCode) => {
      await Line.findByIdAndUpdate(lineId, { qrCode, status: 'connecting' });
      if (io) io.emit('qr_code', { lineId, qrCode });
    }
  };

  try {
    const client = await create(options);
    clients.set(lineId.toString(), client);

    const info = await client.getMe();
    await Line.findByIdAndUpdate(lineId, {
      status: 'connected',
      phone: info.wid?.user || '',
      qrCode: null
    });

    if (io) io.emit('line_status', { lineId, status: 'connected' });

    // Escuchar mensajes entrantes
    client.onMessage(async (msg) => {
      await handleIncomingMessage(msg, lineId, io);
    });

    // Escuchar cambios de estado de mensajes
    client.onAck(async (ack) => {
      await handleAck(ack);
    });

    return client;
  } catch (err) {
    await Line.findByIdAndUpdate(lineId, { status: 'disconnected' });
    if (io) io.emit('line_status', { lineId, status: 'disconnected' });
    throw err;
  }
}

/**
 * Desconectar una línea
 */
async function disconnectLine(lineId) {
  const client = clients.get(lineId.toString());
  if (client) {
    await client.kill();
    clients.delete(lineId.toString());
  }
  await Line.findByIdAndUpdate(lineId, { status: 'disconnected' });
}

/**
 * Manejar mensajes entrantes
 */
async function handleIncomingMessage(msg, lineId, io) {
  if (msg.isGroupMsg || msg.type === 'e2e_notification') return;

  const phone = msg.from.replace('@c.us', '');

  // Buscar o crear conversación
  let conversation = await Conversation.findOne({ phone });
  if (!conversation) {
    conversation = await Conversation.create({
      phone,
      contactName: msg.sender?.pushname || phone,
      line: lineId,
      status: 'open',
      lastMessage: msg.body || '[media]',
      lastMessageAt: new Date(),
      unread: 1
    });
  } else {
    await Conversation.findByIdAndUpdate(conversation._id, {
      lastMessage: msg.body || '[media]',
      lastMessageAt: new Date(),
      $inc: { unread: 1 }
    });
  }

  // Guardar mensaje
  const inboxMsg = await InboxMessage.create({
    conversation: conversation._id,
    direction: 'inbound',
    content: msg.body,
    mediaUrl: msg.type !== 'chat' ? msg.body : null,
    mediaType: msg.type !== 'chat' ? msg.type : null,
    waMessageId: msg.id,
    timestamp: new Date(msg.timestamp * 1000)
  });

  // Emitir por socket
  if (io) {
    io.emit('new_message', {
      conversation: conversation._id,
      message: inboxMsg,
      phone,
      contactName: msg.sender?.pushname
    });
  }
}

/**
 * Manejar confirmaciones de lectura
 */
async function handleAck(ack) {
  const statusMap = { 1: 'sent', 2: 'delivered', 3: 'read', 4: 'read', -1: 'failed' };
  const status = statusMap[ack.ack];
  if (!status) return;

  await Message.findOneAndUpdate(
    { waMessageId: ack.id },
    { status }
  );
}

/**
 * Enviar mensaje de texto
 */
async function sendText(lineId, phone, text) {
  const client = clients.get(lineId.toString());
  if (!client) throw new Error(`Línea ${lineId} no está conectada`);

  const chatId = phone.includes('@c.us') ? phone : `${phone}@c.us`;
  const msgId = await client.sendText(chatId, text);
  return msgId;
}

/**
 * Reemplazar variables en plantilla
 */
function renderTemplate(template, contact) {
  let content = template.content;
  const vars = {
    nombre:   contact.name || '',
    empresa:  contact.company || '',
    email:    contact.email || '',
    telefono: contact.phone || '',
    ...contact.extra
  };
  Object.entries(vars).forEach(([key, val]) => {
    content = content.replace(new RegExp(`{{${key}}}`, 'gi'), val || '');
  });
  return content;
}

/**
 * Envío masivo con delay aleatorio y rotación de plantillas/líneas
 */
async function runCampaign(campaign, io) {
  const { Campaign, Contact, Message: Msg, Line: LineModel } = require('../models');

  await Campaign.findByIdAndUpdate(campaign._id, {
    status: 'running',
    startedAt: new Date()
  });

  const contacts = await Contact.find({ _id: { $in: campaign.contacts }, optOut: false });
  const templates = campaign.templates;
  const lines = campaign.lines;

  let sent = 0, failed = 0;

  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i];

    // Verificar si la campaña fue pausada
    const current = await Campaign.findById(campaign._id);
    if (current.status === 'paused' || current.status === 'failed') {
      break;
    }

    // Rotación round-robin de plantilla y línea
    const template = await require('../models').Template.findById(
      templates[i % templates.length]
    );
    const lineId = lines[i % lines.length].toString();
    const line = await LineModel.findById(lineId);

    const content = renderTemplate(template, contact);

    // Crear registro pendiente
    const msgRecord = await Msg.create({
      campaign: campaign._id,
      contact: contact._id,
      line: lineId,
      template: template._id,
      phone: contact.phone,
      content,
      status: 'pending'
    });

    try {
      const waId = await sendText(lineId, contact.phone, content);
      await Msg.findByIdAndUpdate(msgRecord._id, {
        status: 'sent',
        waMessageId: waId,
        sentAt: new Date()
      });
      sent++;
      await Campaign.findByIdAndUpdate(campaign._id, { $inc: { sent: 1 } });
    } catch (err) {
      await Msg.findByIdAndUpdate(msgRecord._id, {
        status: 'failed',
        errorMsg: err.message
      });
      failed++;
      await Campaign.findByIdAndUpdate(campaign._id, { $inc: { failed: 1 } });
    }

    if (io) {
      io.emit('campaign_progress', {
        campaignId: campaign._id,
        sent,
        failed,
        total: contacts.length,
        percent: Math.round(((sent + failed) / contacts.length) * 100)
      });
    }

    // Delay aleatorio entre mensajes
    if (i < contacts.length - 1) {
      const delay = (campaign.delayMin + Math.random() * (campaign.delayMax - campaign.delayMin)) * 1000;
      await sleep(delay);
    }
  }

  await Campaign.findByIdAndUpdate(campaign._id, {
    status: 'completed',
    completedAt: new Date()
  });

  if (io) io.emit('campaign_completed', { campaignId: campaign._id, sent, failed });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Enviar mensaje desde el inbox (agente → cliente)
 */
async function sendInboxMessage(conversationId, content, userId, io) {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) throw new Error('Conversación no encontrada');
  if (conversation.assignedTo?.toString() !== userId.toString()) {
    throw new Error('Esta conversación no está asignada a ti');
  }

  const lineId = conversation.line.toString();
  const waId = await sendText(lineId, conversation.phone, content);

  const msg = await InboxMessage.create({
    conversation: conversationId,
    direction: 'outbound',
    content,
    waMessageId: waId,
    sentBy: userId,
    status: 'sent',
    timestamp: new Date()
  });

  await Conversation.findByIdAndUpdate(conversationId, {
    lastMessage: content,
    lastMessageAt: new Date()
  });

  if (io) io.emit('new_message', { conversation: conversationId, message: msg });

  return msg;
}

module.exports = {
  initLine,
  disconnectLine,
  sendText,
  sendInboxMessage,
  runCampaign,
  renderTemplate,
  clients
};
