const { MongoClient } = require("mongodb");

const client = new MongoClient(process.env.MONGODB_URI);

// Initialize MongoDB connection at startup for better performance
async function initializeMongoConnection() {
  try {
    await client.connect();
    console.log("Connected to MongoDB successfully");
  } catch (error) {
    console.error("Failed to connect to MongoDB at startup:", error);
    console.log("Connection will be attempted on first request");
  }
}

// Check if MongoDB client is connected
function isConnected() {
  return client.topology && client.topology.isConnected();
}

// Get database instance for a specific project
function getDatabase(projectId) {
  if (!isConnected()) {
    throw new Error('Database connection not available');
  }
  return client.db(projectId);
}

// Get collection instance for a specific project and collection
function getCollection(projectId, collectionName) {
  const db = getDatabase(projectId);
  return db.collection(collectionName.toLowerCase());
}

// Connect to MongoDB when server starts (non-blocking)
initializeMongoConnection();

module.exports = {
  client,
  isConnected,
  getDatabase,
  getCollection,
  initializeMongoConnection
};