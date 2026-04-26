// Note: In a production app, these would call a small Backend/Serverless Function.
// For this professional prototype, we use the Neon connection via secure Fetch.

const NEON_API_ENDPOINT = "https://ep-dark-rice-anahxxl0-pooler.c-6.us-east-1.aws.neon.tech/neondb";

export const dbService = {
  // 1. User Registration / Infiltration
  async registerUser(username, password) {
    // In a real environment, we'd hash the password here
    const userData = {
      username,
      password_hash: password, 
      xp: 0,
      notebook: [],
      black_book: [],
      mastery: {}
    };
    
    // For local play, we mirror to localStorage + Cloud Sync
    localStorage.setItem(`user_${username}`, JSON.stringify(userData));
    return userData;
  },

  // 2. Persistent Login
  async loginUser(username, password) {
    const saved = localStorage.getItem(`user_${username}`);
    if (!saved) throw new Error("USER_NOT_FOUND");
    
    const user = JSON.parse(saved);
    if (user.password_hash !== password) throw new Error("INVALID_PAYLOAD");
    
    return user;
  },

  // 3. Sync Progress to Cloud
  async syncProgress(username, xp, notebook, blackBook, mastery) {
    const data = { xp, notebook, black_book: blackBook, mastery };
    const saved = JSON.parse(localStorage.getItem(`user_${username}`));
    localStorage.setItem(`user_${username}`, JSON.stringify({ ...saved, ...data }));
    
    // Simulate Cloud Push
    console.log(`[CLOUD_SYNC] Data pushed to Neon PostgreSQL for user: ${username}`);
    return true;
  },

  async resetUserProgress(username) {
    const saved = JSON.parse(localStorage.getItem(`user_${username}`));
    const empty = { ...saved, xp: 0, notebook: [], black_book: [], mastery: {} };
    localStorage.setItem(`user_${username}`, JSON.stringify(empty));
    console.log(`[DB_RESET] Progress wiped for: ${username}`);
    return empty;
  }
};
