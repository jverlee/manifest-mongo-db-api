const { Store } = require('express-session');

class SupabaseSessionStore extends Store {
  constructor(options = {}) {
    super(options);
    this.client = options.client;
    this.tableName = options.tableName || 'app_user_sessions';
    this.ttl = options.ttl || 86400; // 24 hours in seconds
  }

  async get(sid, callback) {
    try {
      const { data, error } = await this.client
        .from(this.tableName)
        .select('session_data, expires_at')
        .eq('session_id', sid)
        .single();

      if (error) {
        if (error.code === 'PGRST116') { // Not found
          return callback(null, null);
        }
        return callback(error);
      }

      // Check if session has expired
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        await this.destroy(sid, () => {}); // Clean up expired session
        return callback(null, null);
      }

      const session = JSON.parse(data.session_data);
      callback(null, session);
    } catch (error) {
      callback(error);
    }
  }

  async set(sid, session, callback) {
    try {
      const expiresAt = new Date(Date.now() + (this.ttl * 1000)).toISOString();
      const sessionData = JSON.stringify(session);

      const { error } = await this.client
        .from(this.tableName)
        .upsert({
          session_id: sid,
          session_data: sessionData,
          expires_at: expiresAt,
          updated_at: new Date().toISOString()
        });

      if (error) {
        return callback(error);
      }

      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  async destroy(sid, callback) {
    try {
      const { error } = await this.client
        .from(this.tableName)
        .delete()
        .eq('session_id', sid);

      if (error) {
        return callback(error);
      }

      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  async touch(sid, session, callback) {
    try {
      const expiresAt = new Date(Date.now() + (this.ttl * 1000)).toISOString();

      const { error } = await this.client
        .from(this.tableName)
        .update({
          expires_at: expiresAt,
          updated_at: new Date().toISOString()
        })
        .eq('session_id', sid);

      if (error) {
        return callback(error);
      }

      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  async clear(callback) {
    try {
      const { error } = await this.client
        .from(this.tableName)
        .delete()
        .neq('session_id', ''); // Delete all sessions

      if (error) {
        return callback(error);
      }

      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  async length(callback) {
    try {
      const { count, error } = await this.client
        .from(this.tableName)
        .select('session_id', { count: 'exact' });

      if (error) {
        return callback(error);
      }

      callback(null, count);
    } catch (error) {
      callback(error);
    }
  }

  // Clean up expired sessions
  async cleanupExpiredSessions() {
    try {
      const { error } = await this.client
        .from(this.tableName)
        .delete()
        .lt('expires_at', new Date().toISOString());

      if (error) {
        console.error('Error cleaning up expired sessions:', error);
      }
    } catch (error) {
      console.error('Error cleaning up expired sessions:', error);
    }
  }
}

module.exports = SupabaseSessionStore;