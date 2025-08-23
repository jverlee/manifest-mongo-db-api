const supabaseService = require('../services/supabaseService');

class SupabaseUtils {
  async getBackendFunctionUrl(appId, functionName) {
    try {
      const { data, error } = await supabaseService.client
        .from('app_backend_functions')
        .select('url')
        .eq('app_id', appId)
        .eq('function_name', functionName)
        .single();

      if (error) {
        console.error('Error fetching backend function:', error);
        throw error;
      }

      if (!data || !data.url) {
        throw new Error(`Backend function '${functionName}' not found for app '${appId}'`);
      }

      return data.url;
    } catch (error) {
      console.error('Error in getBackendFunctionUrl:', error);
      throw error;
    }
  }
}

module.exports = new SupabaseUtils();