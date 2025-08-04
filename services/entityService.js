const { getCollection } = require('../config/database');
const { ObjectId } = require('mongodb');

class EntityService {
  constructor() {}

  // READ operations
  async getAllDocuments(projectId, collection) {
    const collectionRef = getCollection(projectId, collection);
    const documents = await collectionRef.find({}).toArray();
    
    console.log(`Retrieved ${documents.length} documents from database '${projectId}', collection '${collection}'`);
    return documents;
  }

  async getDocumentById(projectId, collection, id) {
    const collectionRef = getCollection(projectId, collection);
    const document = await collectionRef.findOne({ _id: new ObjectId(id) });
    
    if (!document) {
      throw new Error(`Document with id ${id} not found`);
    }
    
    console.log(`Retrieved document ${id} from database '${projectId}', collection '${collection}'`);
    return document;
  }

  // CREATE operations
  async createDocument(projectId, collection, documentData) {
    const collectionRef = getCollection(projectId, collection);
    
    // Add timestamp if not provided
    if (!documentData.createdAt) {
      documentData.createdAt = new Date();
    }
    if (!documentData.updatedAt) {
      documentData.updatedAt = new Date();
    }
    
    const result = await collectionRef.insertOne(documentData);
    
    console.log(`Created document ${result.insertedId} in database '${projectId}', collection '${collection}'`);
    return {
      _id: result.insertedId,
      ...documentData
    };
  }

  async createManyDocuments(projectId, collection, documentsData) {
    const collectionRef = getCollection(projectId, collection);
    
    // Add timestamps to all documents
    const documentsWithTimestamps = documentsData.map(doc => ({
      ...doc,
      createdAt: doc.createdAt || new Date(),
      updatedAt: doc.updatedAt || new Date()
    }));
    
    const result = await collectionRef.insertMany(documentsWithTimestamps);
    
    console.log(`Created ${result.insertedIds.length} documents in database '${projectId}', collection '${collection}'`);
    return {
      insertedIds: Object.values(result.insertedIds),
      insertedCount: result.insertedCount
    };
  }

  // UPDATE operations
  async updateDocument(projectId, collection, id, updateData) {
    const collectionRef = getCollection(projectId, collection);
    
    // Add updated timestamp
    updateData.updatedAt = new Date();

    // if _id is included in updateData, remove it so it doesn't error (_id is immutable)
    if (updateData._id) {
      delete updateData._id;
    }
    
    try {
      // Try findOneAndUpdate first (MongoDB 4.2+)
      const result = await collectionRef.findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: updateData },
        { returnDocument: 'after' }
      );
      
      if (result.value) {
        console.log(`Updated document ${id} in database '${projectId}', collection '${collection}'`);
        return result.value;
      }
    } catch (error) {
      console.warn(`findOneAndUpdate failed for document ${id}, trying alternative method:`, error.message);
    }
    
    // Fallback: use updateOne + findOne for older MongoDB versions
    const updateResult = await collectionRef.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );
    
    if (updateResult.matchedCount === 0) {
      throw new Error(`Document with id ${id} not found`);
    }
    
    if (updateResult.modifiedCount === 0) {
      console.warn(`Document ${id} was found but not modified (no changes detected)`);
    }
    
    // Fetch the updated document
    const updatedDoc = await collectionRef.findOne({ _id: new ObjectId(id) });
    if (!updatedDoc) {
      throw new Error(`Document with id ${id} not found after update`);
    }
    
    console.log(`Updated document ${id} in database '${projectId}', collection '${collection}'`);
    return updatedDoc;
  }

  async updateManyDocuments(projectId, collection, filter, updateData) {
    const collectionRef = getCollection(projectId, collection);
    
    // Add updated timestamp
    updateData.updatedAt = new Date();

    // if _id is included in updateData, remove it so it doesn't error (_id is immutable)
    if (updateData._id) {
      delete updateData._id;
    }
    
    const result = await collectionRef.updateMany(
      filter,
      { $set: updateData }
    );
    
    console.log(`Updated ${result.modifiedCount} documents in database '${projectId}', collection '${collection}'`);
    return {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount
    };
  }

  // DELETE operations
  async deleteDocument(projectId, collection, id) {
    const collectionRef = getCollection(projectId, collection);
    
    const result = await collectionRef.findOneAndDelete({ _id: new ObjectId(id) });
    
    if (!result.value) {
      throw new Error(`Document with id ${id} not found`);
    }
    
    console.log(`Deleted document ${id} from database '${projectId}', collection '${collection}'`);
    return result.value;
  }

  async deleteManyDocuments(projectId, collection, filter) {
    const collectionRef = getCollection(projectId, collection);
    
    const result = await collectionRef.deleteMany(filter);
    
    console.log(`Deleted ${result.deletedCount} documents from database '${projectId}', collection '${collection}'`);
    return {
      deletedCount: result.deletedCount
    };
  }

  // Bulk operations with individual error handling
  async bulkCreateDocuments(projectId, collection, documentsData) {
    const results = [];
    
    for (const doc of documentsData) {
      try {
        const result = await this.createDocument(projectId, collection, doc);
        results.push({ success: true, data: result });
      } catch (error) {
        results.push({ success: false, error: error.message, data: doc });
      }
    }
    
    return results;
  }

  async bulkUpdateDocuments(projectId, collection, updates) {
    const results = [];
    
    for (const update of updates) {
      try {
        const { id, ...updateData } = update;
        const result = await this.updateDocument(projectId, collection, id, updateData);
        results.push({ success: true, data: result });
      } catch (error) {
        results.push({ success: false, error: error.message, data: update });
      }
    }
    
    return results;
  }

  async bulkDeleteDocuments(projectId, collection, ids) {
    const results = [];
    
    for (const id of ids) {
      try {
        const result = await this.deleteDocument(projectId, collection, id);
        results.push({ success: true, data: result });
      } catch (error) {
        results.push({ success: false, error: error.message, id });
      }
    }
    
    return results;
  }
}

module.exports = new EntityService();