// klaviyo.js - Klaviyo API Integration
const axios = require('axios');
const config = require('./config');

class KlaviyoAPI {
  constructor() {
    this.baseUrl = config.klaviyo.baseUrl;
    this.headers = {
      'Authorization': `Klaviyo-API-Key ${config.klaviyo.privateKey}`,
      'revision': config.klaviyo.revision,
      'Content-Type': 'application/json'
    };
  }

  // Generic GET request with pagination support
  async get(endpoint, params = {}) {
    try {
      const response = await axios.get(`${this.baseUrl}${endpoint}`, {
        headers: this.headers,
        params: params
      });
      return response.data;
    } catch (error) {
      console.error('Klaviyo API Error:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get all lists [citation:3]
  async getLists() {
    const data = await this.get('lists/', { 
      'page[size]': 100 
    });
    return data.data || [];
  }

  // Get all campaigns with optional filters [citation:2][citation:3]
  async getCampaigns(channel = 'email', status = null) {
    let filter = `equals(messages.channel,"${channel}")`;
    if (status) {
      filter += `,equals(status,"${status}")`;
    }
    
    const data = await this.get('campaigns/', {
      filter: filter,
      'page[size]': 100,
      sort: '-created_at'
    });
    return data.data || [];
  }

  // Get campaign details by ID [citation:2]
  async getCampaign(campaignId) {
    const data = await this.get(`campaigns/${campaignId}/`, {
      include: 'messages,tags'
    });
    return data.data;
  }

  // Get campaign messages [citation:2]
  async getCampaignMessages(campaignId) {
    const data = await this.get(`campaigns/${campaignId}/messages/`);
    return data.data || [];
  }

  // Get profiles (subscribers) with optional filters [citation:3]
  async getProfiles(pageSize = 20, filter = null) {
    const params = { 'page[size]': pageSize };
    if (filter) {
      params.filter = filter;
    }
    const data = await this.get('profiles/', params);
    return data.data || [];
  }

  // Get segments [citation:3]
  async getSegments() {
    const data = await this.get('segments/', { 'page[size]': 100 });
    return data.data || [];
  }

  // Get flows [citation:3]
  async getFlows() {
    const data = await this.get('flows/', { 'page[size]': 100 });
    return data.data || [];
  }

  // Get metrics (analytics data) [citation:3]
  async getMetrics() {
    const data = await this.get('metrics/', { 'page[size]': 100 });
    return data.data || [];
  }

  // Create a profile [citation:3]
  async createProfile(email, firstName, lastName, phoneNumber = null, customProperties = {}) {
    const payload = {
      data: {
        type: 'profile',
        attributes: {
          email: email,
          first_name: firstName,
          last_name: lastName,
          phone_number: phoneNumber,
          properties: customProperties
        }
      }
    };
    
    try {
      const response = await axios.post(`${this.baseUrl}profiles/`, payload, {
        headers: this.headers
      });
      return response.data;
    } catch (error) {
      console.error('Error creating profile:', error.response?.data || error.message);
      throw error;
    }
  }

  // Add profile to list [citation:3]
  async addProfileToList(listId, profileId) {
    const payload = {
      data: [
        {
          type: 'profile',
          id: profileId
        }
      ]
    };
    
    try {
      const response = await axios.post(
        `${this.baseUrl}lists/${listId}/relationships/profiles/`,
        payload,
        { headers: this.headers }
      );
      return response.data;
    } catch (error) {
      console.error('Error adding profile to list:', error.response?.data || error.message);
      throw error;
    }
  }

  // Track an event [citation:3]
  async trackEvent(email, eventName, properties = {}) {
    const payload = {
      data: {
        type: 'event',
        attributes: {
          metric: {
            data: {
              type: 'metric',
              attributes: {
                name: eventName
              }
            }
          },
          profile: {
            data: {
              type: 'profile',
              attributes: {
                email: email
              }
            }
          },
          properties: properties,
          time: new Date().toISOString()
        }
      }
    };
    
    try {
      const response = await axios.post(`${this.baseUrl}events/`, payload, {
        headers: this.headers
      });
      return response.data;
    } catch (error) {
      console.error('Error tracking event:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get campaign analytics summary
  async getCampaignAnalytics(campaignId) {
    try {
      const campaign = await this.getCampaign(campaignId);
      const stats = campaign.attributes?.stats || {};
      
      return {
        name: campaign.attributes?.name || 'Unknown',
        status: campaign.attributes?.status || 'Unknown',
        sendCount: stats.send_count || 0,
        openRate: stats.open_rate || 0,
        clickRate: stats.click_rate || 0,
        bounceRate: stats.bounce_rate || 0,
        spamRate: stats.spam_rate || 0,
        revenue: stats.revenue || 0,
        sendDate: campaign.attributes?.created_at || null
      };
    } catch (error) {
      console.error('Error getting campaign analytics:', error.message);
      return null;
    }
  }
}

module.exports = new KlaviyoAPI();
