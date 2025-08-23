const { createClient } = require('@supabase/supabase-js');

class SupabaseService {
  constructor() {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      throw new Error('Missing Supabase environment variables');
    }
    
    this.client = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );
  }

  async getAppConfig(appId) {
    try {
      const { data, error } = await this.client
        .from('apps')
        .select('config')
        .eq('id', appId)
        .single();

      if (error) {
        console.error('Error fetching app config:', error);
        throw error;
      }

      return data?.config || {};
    } catch (error) {
      console.error('Error in getAppConfig:', error);
      throw error;
    }
  }

  async getStripeAccount(appId) {
    try {
      const { data, error } = await this.client
        .from('stripe_accounts')
        .select('*')
        .eq('app_id', appId)
        .single();

      if (error) {
        console.error('Error fetching stripe account:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error in getStripeAccount:', error);
      throw error;
    }
  }

  async getStripeCustomerId(userId, appId) {
    try {
      const { data, error } = await this.client
        .from('app_user_subscriptions')
        .select('stripe_customer_id')
        .eq('app_user_id', userId)
        .eq('app_id', appId)
        // where stripe_customer_id is not null
        .not('stripe_customer_id', 'is', null)
        // get the first one
        .limit(1)
        .single();

      if (error) {
        console.error('Error fetching stripe customer:', error);
        throw error;
      }

      return data?.stripe_customer_id;
    } catch (error) {
      console.error('Error in getStripeCustomerId:', error);
      throw error;
    }
  }

  async getAppByStripeAccount(stripeAccountId) {
    try {
      const { data, error } = await this.client
        .from('stripe_accounts')
        .select('app_id')
        .eq('stripe_user_id', stripeAccountId)
        .single();

      if (error) {
        console.error('Error fetching app by stripe account:', error);
        throw error;
      }

      return { id: data?.app_id };
    } catch (error) {
      console.error('Error in getAppByStripeAccount:', error);
      throw error;
    }
  }

  async getAppUser(appId, appUserId) {
    try {
      console.log('searching by appId', appId, 'and appUserId', appUserId);
      const { data, error } = await this.client
        .from('app_users')
        .select('*')
        .eq('app_id', appId)
        .eq('id', appUserId)
        .single();

      if (error) {
        console.error('Error fetching app user:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error in getAppUser:', error);
      throw error;
    }
  }
}

module.exports = new SupabaseService();