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

  async getProjectConfig(appId) {
    try {
      const { data, error } = await this.client
        .from('projects')
        .select('config')
        .eq('id', appId)
        .single();

      if (error) {
        console.error('Error fetching project config:', error);
        throw error;
      }

      return data?.config || {};
    } catch (error) {
      console.error('Error in getProjectConfig:', error);
      throw error;
    }
  }

  async getStripeAccount(projectId) {
    try {
      const { data, error } = await this.client
        .from('stripe_accounts')
        .select('*')
        .eq('project_id', projectId)
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

  async getStripeCustomer(userId, appId) {
    try {
      const { data, error } = await this.client
        .from('stripe_customers')
        .select('*')
        .eq('user_id', userId)
        .eq('project_id', appId)
        .single();

      if (error) {
        console.error('Error fetching stripe customer:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error in getStripeCustomer:', error);
      throw error;
    }
  }
}

module.exports = new SupabaseService();