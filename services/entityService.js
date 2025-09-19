const { getCollection } = require('../config/database');
const { ObjectId } = require('mongodb');

class EntityService {
  constructor() {}

  // READ operations
  async getAllDocuments(appId, collection, options = {}) {

    if (options.requireLogin && !options.appUserId) { throw new Error('Authentication required'); }

    const collectionRef = getCollection(appId, collection);
    const query = options.appUserId ? { _appUserId: options.appUserId } : {};
    const documents = await collectionRef.find(query).toArray();
    
    console.log(`Retrieved ${documents.length} documents from database '${appId}', collection '${collection}'`);
    return documents;
  }

  async getDocumentById(appId, collection, id, options = {}) {
    if (options.requireLogin && !options.appUserId) { throw new Error('Authentication required'); }
    
    const collectionRef = getCollection(appId, collection);
    const query = { _id: new ObjectId(id) };
    
    // Add appUserId to query if present
    if (options.appUserId) {
      query._appUserId = options.appUserId;
    }
    
    const document = await collectionRef.findOne(query);
    
    if (!document) {
      throw new Error(`Document with id ${id} not found`);
    }
    
    console.log(`Retrieved document ${id} from database '${appId}', collection '${collection}'`);
    return document;
  }

  // CREATE operations
  async createDocument(appId, collection, documentData, options = {}) {
    if (options.requireLogin && !options.appUserId) { throw new Error('Authentication required'); }
    
    const collectionRef = getCollection(appId, collection);
    
    // Add appUserId if present
    if (options.appUserId) {
      documentData._appUserId = options.appUserId;
    }
    
    // Add timestamp if not provided
    if (!documentData.createdAt) {
      documentData.createdAt = new Date();
    }
    if (!documentData.updatedAt) {
      documentData.updatedAt = new Date();
    }
    
    const result = await collectionRef.insertOne(documentData);
    
    console.log(`Created document ${result.insertedId} in database '${appId}', collection '${collection}'`);
    return {
      _id: result.insertedId,
      ...documentData
    };
  }

  async createManyDocuments(appId, collection, documentsData, options = {}) {
    if (options.requireLogin && !options.appUserId) { throw new Error('Authentication required'); }
    
    const collectionRef = getCollection(appId, collection);
    
    // Add timestamps and appUserId to all documents
    const documentsWithTimestamps = documentsData.map(doc => {
      const documentToInsert = {
        ...doc,
        createdAt: doc.createdAt || new Date(),
        updatedAt: doc.updatedAt || new Date()
      };
      
      // Add appUserId if present
      if (options.appUserId) {
        documentToInsert._appUserId = options.appUserId;
      }
      
      return documentToInsert;
    });
    
    const result = await collectionRef.insertMany(documentsWithTimestamps);
    
    console.log(`Created ${result.insertedIds.length} documents in database '${appId}', collection '${collection}'`);
    return {
      insertedIds: Object.values(result.insertedIds),
      insertedCount: result.insertedCount
    };
  }

  // UPDATE operations
  async updateDocument(appId, collection, id, updateData, options = {}) {
    if (options.requireLogin && !options.appUserId) { throw new Error('Authentication required'); }
    
    const collectionRef = getCollection(appId, collection);
    
    // Build query with appUserId if present
    const query = { _id: new ObjectId(id) };
    if (options.appUserId) {
      query._appUserId = options.appUserId;
    }
    
    // Add updated timestamp
    updateData.updatedAt = new Date();

    // if _id is included in updateData, remove it so it doesn't error (_id is immutable)
    if (updateData._id) {
      delete updateData._id;
    }
    
    try {
      // Try findOneAndUpdate first (MongoDB 4.2+)
      const result = await collectionRef.findOneAndUpdate(
        query,
        { $set: updateData },
        { returnDocument: 'after' }
      );
      
      if (result.value) {
        console.log(`Updated document ${id} in database '${appId}', collection '${collection}'`);
        return result.value;
      }
    } catch (error) {
      console.warn(`findOneAndUpdate failed for document ${id}, trying alternative method:`, error.message);
    }
    
    // Fallback: use updateOne + findOne for older MongoDB versions
    const updateResult = await collectionRef.updateOne(
      query,
      { $set: updateData }
    );
    
    if (updateResult.matchedCount === 0) {
      throw new Error(`Document with id ${id} not found`);
    }
    
    if (updateResult.modifiedCount === 0) {
      console.warn(`Document ${id} was found but not modified (no changes detected)`);
    }
    
    // Fetch the updated document
    const updatedDoc = await collectionRef.findOne(query);
    if (!updatedDoc) {
      throw new Error(`Document with id ${id} not found after update`);
    }
    
    console.log(`Updated document ${id} in database '${appId}', collection '${collection}'`);
    return updatedDoc;
  }

  async updateManyDocuments(appId, collection, filter, updateData, options = {}) {
    if (options.requireLogin && !options.appUserId) { throw new Error('Authentication required'); }
    
    const collectionRef = getCollection(appId, collection);
    
    // Add appUserId to filter if present
    const scopedFilter = { ...filter };
    if (options.appUserId) {
      scopedFilter._appUserId = options.appUserId;
    }
    
    // Add updated timestamp
    updateData.updatedAt = new Date();

    // if _id is included in updateData, remove it so it doesn't error (_id is immutable)
    if (updateData._id) {
      delete updateData._id;
    }
    
    const result = await collectionRef.updateMany(
      scopedFilter,
      { $set: updateData }
    );
    
    console.log(`Updated ${result.modifiedCount} documents in database '${appId}', collection '${collection}'`);
    return {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount
    };
  }

  // DELETE operations
  async deleteDocument(appId, collection, id, options = {}) {
    if (options.requireLogin && !options.appUserId) { throw new Error('Authentication required'); }
    
    const collectionRef = getCollection(appId, collection);
    
    // Build query with appUserId if present
    const query = { _id: new ObjectId(id) };
    if (options.appUserId) {
      query._appUserId = options.appUserId;
    }
    
    const result = await collectionRef.findOneAndDelete(query);
    
    if (!result.value) {
      throw new Error(`Document with id ${id} not found`);
    }
    
    console.log(`Deleted document ${id} from database '${appId}', collection '${collection}'`);
    return result.value;
  }

  async deleteManyDocuments(appId, collection, filter, options = {}) {
    if (options.requireLogin && !options.appUserId) { throw new Error('Authentication required'); }
    
    const collectionRef = getCollection(appId, collection);
    
    // Add appUserId to filter if present
    const scopedFilter = { ...filter };
    if (options.appUserId) {
      scopedFilter._appUserId = options.appUserId;
    }
    
    const result = await collectionRef.deleteMany(scopedFilter);
    
    console.log(`Deleted ${result.deletedCount} documents from database '${appId}', collection '${collection}'`);
    return {
      deletedCount: result.deletedCount
    };
  }

  // Bulk operations with individual error handling
  async bulkCreateDocuments(appId, collection, documentsData, options = {}) {
    const results = [];
    
    for (const doc of documentsData) {
      try {
        const result = await this.createDocument(appId, collection, doc, options);
        results.push({ success: true, data: result });
      } catch (error) {
        results.push({ success: false, error: error.message, data: doc });
      }
    }
    
    return results;
  }

  async bulkUpdateDocuments(appId, collection, updates, options = {}) {
    const results = [];
    
    for (const update of updates) {
      try {
        const { id, ...updateData } = update;
        const result = await this.updateDocument(appId, collection, id, updateData, options);
        results.push({ success: true, data: result });
      } catch (error) {
        results.push({ success: false, error: error.message, data: update });
      }
    }
    
    return results;
  }

  async bulkDeleteDocuments(appId, collection, ids, options = {}) {
    const results = [];
    
    for (const id of ids) {
      try {
        const result = await this.deleteDocument(appId, collection, id, options);
        results.push({ success: true, data: result });
      } catch (error) {
        results.push({ success: false, error: error.message, id });
      }
    }
    
    return results;
  }
}

module.exports = new EntityService();