// config.js - Configuration Management
require('dotenv').config();

module.exports = {
  botToken: process.env.BOT_TOKEN,
  channelId: process.env.CHANNEL_ID,
  klaviyo: {
    privateKey: process.env.KLAVIYO_PRIVATE_KEY,
    revision: process.env.KLAVIYO_REVISION || '2024-10-15',
    baseUrl: 'https://a.klaviyo.com/api/'
  },
  checkInterval: process.env.CHECK_INTERVAL || '*/30 * * * *',
  alertThresholds: {
    lowOpenRate: 15,
    lowClickRate: 5,
    highBounceRate: 10,
    minProfiles: 10
  }
};
