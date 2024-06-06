require('dotenv').config({ path: '.env' });
const sequelize = require('./models');
const path = require('path');
const { QueryTypes} = require("sequelize");

const { MongoClient } = require('mongodb');
const { logger } = require('./logger');

async function updateOrCreateMongoMIS(application) {
    const { application_id, lender, loan_type } = application;
    const uri = process.env.MONGO_MIS_URI// + ( process.env.ENVIRONMENT  == 'prod'?process.env.MONGO_PROXY_PATH:'');
    const dbName = process.env.MONGO_MIS_DB_NAME;
    const collectionName = process.env.MONGO_MIS_DB_COLLECTION;

    let client;
    try {
      if(process.env.ENVIRONMENT  == 'prod'){
        const pemPath =  path.resolve(__dirname, process.env.MONGO_PROXY_PATH);
        client = new MongoClient(uri,  {
          useNewUrlParser: true,
          useUnifiedTopology: true,
          tlsCAFile: pemPath, // Ensure this matches the URI parameter
          tls: true,
          tlsAllowInvalidCertificates: false, // Set to true if you want to allow invalid certificates
          tlsAllowInvalidHostnames: false,   // Set to true if you want to allow invalid hostnames
          serverSelectionTimeoutMS: 5000     // Adjust the timeout as needed
        });
        await client.connect();
      }else{
        client = new MongoClient(uri,  {
          useNewUrlParser: true,
          useUnifiedTopology: true
         });
        await client.connect();
      }
      
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
      console.log(err)
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
    SELECT dsa_id
    FROM DSAHierarchy;
  `;

  let results = await _sequelize.query(hierarchyQuery, {
    replacements: { dsaMobileNumber },
    type: QueryTypes.SELECT,
  });
  results = results.map(row => row.dsa_id);
  results.push(process.env.KM_DSA_ID);
  return results;
}

module.exports = {
    getDsaHierarchy,
    updateOrCreateMongoMIS 
}
