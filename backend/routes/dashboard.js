const router = require('express').Router();
const { Campaign, Message, Contact, Conversation, Line } = require('../models');
const { authMiddleware } = require('../middleware/auth');

router.get('/', authMiddleware, async (req, res) => {
  const [
    totalCampaigns,
    activeCampaigns,
    totalContacts,
    totalMessages,
    openConversations,
    connectedLines,
    messageStats,
    recentCampaigns,
    dailyStats
  ] = await Promise.all([
    Campaign.countDocuments(),
    Campaign.countDocuments({ status: 'running' }),
    Contact.countDocuments({ optOut: false }),
    Message.countDocuments(),
    Conversation.countDocuments({ status: { $in: ['open', 'assigned'] } }),
    Line.countDocuments({ status: 'connected' }),
    // Stats de mensajes por estado
    Message.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]),
    // Últimas 5 campañas
    Campaign.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name status sent failed totalContacts createdAt'),
    // Mensajes por día (últimos 7 días)
    Message.aggregate([
      {
        $match: {
          createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          total: { $sum: 1 },
          sent: { $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } }
        }
      },
      { $sort: { _id: 1 } }
    ])
  ]);

  const statsMap = {};
  messageStats.forEach(s => { statsMap[s._id] = s.count; });

  res.json({
    summary: {
      totalCampaigns,
      activeCampaigns,
      totalContacts,
      totalMessages,
      openConversations,
      connectedLines,
      sentMessages: statsMap.sent || 0,
      deliveredMessages: statsMap.delivered || 0,
      readMessages: statsMap.read || 0,
      failedMessages: statsMap.failed || 0
    },
    recentCampaigns,
    dailyStats
  });
});

module.exports = router;
