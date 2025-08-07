class UserService {
  
  async getUserDetails(userId, email, appConfig = {}) {
    // Use the config from Supabase instead of hard-coded data
    return appConfig;
  }
}

module.exports = new UserService();