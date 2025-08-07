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
}

module.exports = new SupabaseService();