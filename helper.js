require('dotenv').config({ path: '.env' });
const sequelize = require('./models');
const { QueryTypes} = require("sequelize");

const { MongoClient } = require('mongodb');
const { logger } = require('./logger');

async function updateOrCreateMongoMIS(application) {
    const { application_id, lender, loan_type } = application;
    const uri = process.env.MONGO_MIS_URI;
    const dbName = process.env.MONGO_MIS_DB_NAME;
    const collectionName = process.env.MONGO_MIS_DB_COLLECTION;
  
    try {
      const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
      await client.connect();
      logger.info('Connected to the MongoDB server');
  
      // Get the database
      const db = client.db(dbName);
      const existingDocument = await db.collection(collectionName).findOneAndUpdate(
        { application_id, lender, loan_type },
        { $set: { ...application, updated_at: new Date() } },
        { returnOriginal: false, upsert: true }
      );
  
      if (existingDocument) {
        logger.info('Document updated', { existingDocument });
      } else {
        const newDocument = {
          ...application,
          created_at: new Date(),
          updated_at: new Date()
        };
        const insertResult = await db.collection(collectionName).insertOne(newDocument);
        logger.info('New document added', { insertResult });
      }
  
      await client.close();
    } catch (err) {
      logger.error('Error updating or creating MongoDB document', { err });
      throw err;
    }
  }
  


async function getDsaHierarchy(dsaMobileNumber) {
  const hierarchyQuery = `
    WITH RECURSIVE DSAHierarchy AS (
      SELECT dsa_mobile_number, partner_code, dsa_id
      FROM ru_direct_selling_agents
      WHERE dsa_mobile_number = :dsaMobileNumber
      UNION ALL
      SELECT t.dsa_mobile_number, t.partner_code, t.dsa_id
      FROM ru_direct_selling_agents t
      INNER JOIN DSAHierarchy d ON t.partner_code = d.dsa_mobile_number
      WHERE t.partner_code IS NOT NULL
    )
    SELECT dsa_mobile_number
    FROM DSAHierarchy;
  `;

  const results = await _sequelize.query(hierarchyQuery, {
    replacements: { dsaMobileNumber },
    type: QueryTypes.SELECT,
  });

  return results.map(row => row.dsa_mobile_number);
}

module.exports = {
    getDsaHierarchy,
    updateOrCreateMongoMIS 
}
