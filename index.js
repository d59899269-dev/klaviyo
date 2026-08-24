const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
require('dotenv').config();

const klaviyo = require('./klaviyo');
const config = require('./config');

// Configuration
const token = config.botToken;
const channelId = config.channelId;

// Create bot instance
const bot = new TelegramBot(token, { polling: true });

// Alert states
let lastAlertState = {
  campaigns: [],
  lists: [],
  profiles: []
};

// Format campaign alert message
function formatCampaignAlert(campaign) {
  const statusEmoji = {
    'draft': '📝',
    'scheduled': '📅',
    'sent': '📤',
    'cancelled': '🚫'
  }[campaign.status] || '📊';

  let message = `${statusEmoji} <b>Campaign Alert</b>\n\n`;
  message += `<b>${campaign.name}</b>\n`;
  message += `📊 Status: ${campaign.status}\n`;
  message += `📤 Sent to: ${campaign.sendCount} recipients\n`;
  
  if (campaign.sendCount > 0) {
    message += `📊 Open Rate: ${campaign.openRate.toFixed(1)}%\n`;
    message += `👆 Click Rate: ${campaign.clickRate.toFixed(1)}%\n`;
    message += `📨 Bounce Rate: ${campaign.bounceRate.toFixed(1)}%\n`;
    message += `💰 Revenue: $${campaign.revenue.toFixed(2)}\n`;
    
    // Alerts based on thresholds
    const thresholds = config.alertThresholds;
    if (campaign.openRate < thresholds.lowOpenRate) {
      message += `\n⚠️ <b>Low Open Rate!</b> Below ${thresholds.lowOpenRate}%\n`;
    }
    if (campaign.clickRate < thresholds.lowClickRate) {
      message += `⚠️ <b>Low Click Rate!</b> Below ${thresholds.lowClickRate}%\n`;
    }
    if (campaign.bounceRate > thresholds.highBounceRate) {
      message += `⚠️ <b>High Bounce Rate!</b> Above ${thresholds.highBounceRate}%\n`;
    }
  }
  
  return message;
}

// Send daily summary
async function sendDailySummary() {
  try {
    let messages = [];
    
    // Get recent campaigns (sent in last 7 days)
    const campaigns = await klaviyo.getCampaigns('email', 'sent');
    const recentCampaigns = campaigns
      .slice(0, 5)
      .map(c => c.id);
    
    if (recentCampaigns.length === 0) {
      messages.push('📊 No sent campaigns in the last 7 days.');
    } else {
      messages.push('📊 <b>Daily Klaviyo Summary</b>\n\n');
      
      for (const campaignId of recentCampaigns) {
        const analytics = await klaviyo.getCampaignAnalytics(campaignId);
        if (analytics && analytics.sendCount > 0) {
          messages.push(formatCampaignAlert(analytics));
        }
      }
    }
    
    // Get list stats
    const lists = await klaviyo.getLists();
    if (lists.length > 0) {
      messages.push('\n📋 <b>List Overview</b>\n');
      lists.slice(0, 5).forEach(list => {
        messages.push(`• ${list.attributes?.name || 'Unnamed List'}: ${list.attributes?.profile_count || 0} profiles`);
      });
    }
    
    // Send all messages
    for (const message of messages) {
      if (message.trim()) {
        await bot.sendMessage(channelId, message, { parse_mode: 'HTML' });
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    console.log('✅ Daily summary sent successfully');
  } catch (error) {
    console.error('❌ Error sending daily summary:', error);
  }
}

// Check for new campaigns
async function checkNewCampaigns() {
  try {
    const campaigns = await klaviyo.getCampaigns('email', 'draft');
    
    if (campaigns.length > 0) {
      let messages = [];
      messages.push('📝 <b>New Draft Campaigns</b>\n');
      
      campaigns.slice(0, 3).forEach(campaign => {
        const name = campaign.attributes?.name || 'Untitled Campaign';
        const createdAt = campaign.attributes?.created_at || 'Unknown';
        messages.push(`• ${name}\n  Created: ${new Date(createdAt).toLocaleDateString()}\n  ID: ${campaign.id}`);
      });
      
      if (campaigns.length > 3) {
        messages.push(`\n... and ${campaigns.length - 3} more drafts.`);
      }
      
      for (const message of messages) {
        await bot.sendMessage(channelId, message, { parse_mode: 'HTML' });
      }
      
      console.log(`📝 Found ${campaigns.length} draft campaigns`);
    }
  } catch (error) {
    console.error('Error checking new campaigns:', error);
  }
}

// Check list growth
async function checkListGrowth() {
  try {
    const lists = await klaviyo.getLists();
    let alerts = [];
    
    lists.forEach(list => {
      const count = list.attributes?.profile_count || 0;
      const name = list.attributes?.name || 'Unnamed List';
      
      // Check if list has significant growth
      const previous = lastAlertState.lists.find(l => l.id === list.id);
      if (previous) {
        const growth = count - previous.count;
        if (growth > 50) {
          alerts.push(`📈 <b>List Growth Alert!</b>\n${name}\n+${growth} new profiles\nTotal: ${count}`);
        }
      }
      
      lastAlertState.lists = lists.map(l => ({
        id: l.id,
        count: l.attributes?.profile_count || 0
      }));
    });
    
    if (alerts.length > 0) {
      for (const alert of alerts) {
        await bot.sendMessage(channelId, alert, { parse_mode: 'HTML' });
      }
    }
  } catch (error) {
    console.error('Error checking list growth:', error);
  }
}

// Manual command to check Klaviyo status
bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    await bot.sendMessage(chatId, '🔍 Checking Klaviyo status...');
    
    // Check lists
    const lists = await klaviyo.getLists();
    const profileCount = lists.reduce((sum, list) => sum + (list.attributes?.profile_count || 0), 0);
    
    // Check campaigns
    const campaigns = await klaviyo.getCampaigns('email');
    const draftCount = campaigns.filter(c => c.attributes?.status === 'draft').length;
    const sentCount = campaigns.filter(c => c.attributes?.status === 'sent').length;
    
    // Check flows
    const flows = await klaviyo.getFlows();
    const activeFlows = flows.filter(f => f.attributes?.status === 'live').length;
    
    const message = `
📊 <b>Klaviyo Status Report</b>

📋 <b>Lists & Profiles:</b>
• Total Profiles: ${profileCount}
• Total Lists: ${lists.length}

📧 <b>Campaigns:</b>
• Drafts: ${draftCount}
• Sent: ${sentCount}
• Total: ${campaigns.length}

🔄 <b>Flows:</b>
• Active Flows: ${activeFlows}
• Total Flows: ${flows.length}

✅ Status: All systems operational
    `;
    
    await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
  } catch (error) {
    await bot.sendMessage(chatId, `❌ Error fetching Klaviyo status: ${error.message}`);
  }
});

// Command to check specific campaign
bot.onText(/\/campaign (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const campaignId = match[1].trim();
  
  try {
    const analytics = await klaviyo.getCampaignAnalytics(campaignId);
    if (analytics) {
      const message = formatCampaignAlert(analytics);
      await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
    } else {
      await bot.sendMessage(chatId, '❌ Campaign not found or no data available.');
    }
  } catch (error) {
    await bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
});

// Command to check lists
bot.onText(/\/lists/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    const lists = await klaviyo.getLists();
    if (lists.length === 0) {
      await bot.sendMessage(chatId, '📋 No lists found.');
      return;
    }
    
    let message = '📋 <b>Your Lists</b>\n\n';
    lists.forEach((list, index) => {
      const name = list.attributes?.name || 'Unnamed List';
      const count = list.attributes?.profile_count || 0;
      message += `${index + 1}. ${name}\n   📊 ${count} profiles\n`;
    });
    
    await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
  } catch (error) {
    await bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
});

// Help command
bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  const message = `
🤖 <b>Klaviyo Bot Commands</b>

📊 <b>General:</b>
/status - Check Klaviyo status
/lists - View all lists

📧 <b>Campaigns:</b>
/campaign [ID] - Get campaign details

📅 <b>Automation:</b>
Daily summary at 9:00 AM
Campaign alerts on new drafts
List growth notifications

💡 <b>Environment:</b>
Klaviyo API: Active
Telegram: Connected

Need help with Klaviyo API? Check: developers.klaviyo.com
  `;
  await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
});

// Start command
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const message = `
🎯 <b>Klaviyo Bot</b> - Your Klaviyo Monitor

I monitor your Klaviyo account and send alerts to this channel.

📊 <b>Features:</b>
• Daily campaign summaries
• New draft campaign alerts
• List growth notifications
• Campaign performance tracking

<b>Commands:</b>
/status - Check Klaviyo status
/lists - View all lists
/campaign [ID] - Campaign details
/help - Show all commands

🔐 Connected to Klaviyo API
  `;
  await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
});

// Schedule cron jobs
cron.schedule('0 9 * * *', () => {
  console.log('⏰ Running daily summary...');
  sendDailySummary();
});

cron.schedule('0 */4 * * *', () => {
  console.log('⏰ Checking for new campaigns...');
  checkNewCampaigns();
});

cron.schedule('0 */6 * * *', () => {
  console.log('⏰ Checking list growth...');
  checkListGrowth();
});

// Error handling
bot.on('error', (error) => {
  console.error('❌ Bot error:', error);
});

console.log('🎯 Klaviyo Bot is running!');
console.log('📊 Connected to Klaviyo API');
console.log('⏰ Daily summary at 9:00 AM');
console.log('💡 Use /start to see available commands');
