const fs = require('fs');
const path = require('path');
const sequelize = require('../../models/index'); // Adjust the path as needed
const { getDsaHierarchy, updateOrCreateMongoMIS } = require('../../helper'); // Adjust the path as needed
const { logger } = require('../../logger');
const { QueryTypes } = require("sequelize");

const getStatus = (status) => {
  let customStatus;
  if(status == 'Approved'){
    customStatus = 'approved';
  }else if(status == 'Pending/WIP'){
    customStatus = 'pending';
  }else{
    customStatus = 'rejected';
  }
  return customStatus;
};


function toUnderscoreSeparatedLowerCase(str) {
    return str
      .replace(/([a-z])([A-Z])/g, '$1_$2') // Add underscore between camelCase words
      .replace(/[\s\-]+/g, '_')            // Replace spaces and hyphens with underscores
      .toLowerCase();                      // Convert the entire string to lower case
}

async function fetchCreditCardApplications() {
  try {

    const batchSize = 100;
    const type = 'Credit Card'; // Type for incred credit card applications
    let queryOffset = ` select * from  temp_mis_count where field_type = ? `;
    let offsetCount = await _sequelize.query(queryOffset,{replacements:[type],type:QueryTypes.SELECT})
   
    logger.info(`Fetching the first ${batchSize} ${type}  applications.`);

    const applicationsQuery = `
      SELECT
        cc.application_id,
        cc.application_submitted_at,
        cc.stage,
        cc.sub_stage,
        cc.status,
        cc.status_description,
        cc.address_id,
        cc.bureau_ref_id,
        cc.consent_given_at,
        rlp.product_name,
        cc.created_at,
        cc.updated_at,
        cust.address_city as city,
        cust.address_state as state,
        cust.address_pincode as pincode,
        dsa.dsa_mobile_number
      FROM
        ru_cc_applications cc
      LEFT JOIN \`${process.env.RU_SERVICE_DB}\`.ru_loans_products rlp on cc.product_id = rlp.product_id
      LEFT JOIN
        ru_customers cust ON cc.customer_id = cust.id
      LEFT JOIN
        ru_direct_selling_agents dsa ON cc.dsa_id = dsa.id
      ORDER BY
        cc.id
      LIMIT :offset, :limit;
    `;

    logger.info(`Executing applications query for ${type}.`);
    const applications = await _sequelize.query(applicationsQuery, {
      type: QueryTypes.SELECT,
      replacements: {
        offset: offsetCount[0].count || 0,
        limit: batchSize,
      },
    });
 
    logger.info(`Fetched ${applications.length} ${type} applications.`);

    if (applications.length === 0) {
      logger.warn(`No ${type} applications found.`);
      return;
    }

    // Fetch DSA hierarchy for each application and update MongoDB
    for (const application of applications) {
      let dsaHierarchy;
      try {
        dsaHierarchy = await getDsaHierarchy(application.dsa_mobile_number);
      } catch (error) {
        logger.error(`Error fetching DSA hierarchy for ${type} application`, { application_id: application.application_id, error });
        continue; // Continue to the next application if an error occurs while fetching DSA hierarchy
      }
      const formattedApplication = {
        application_id: application.application_id,
        lender: `${application.product_name?toUnderscoreSeparatedLowerCase(application.product_name):''}_cc`,
        loan_type: 'credit_card',
        applied_amount: null, // Not applicable for credit card
        approved_amount: null, // Not applicable for credit card
        approved_date: null,// Not applicable for credit card
        city: application.city,
        state: application.state,
        pincode: application.pincode,
        users: dsaHierarchy,
        disbursed_amount: null, // Not applicable for credit card
        stage: application.stage,
        sub_stage: application.sub_stage,
        status: getStatus(application.status),
        disbursed_date: null, // Not applicable for credit card
        updated_at: application.updated_at,
        created_at: application.created_at,
      };

      console.log(formattedApplication)
      try {
        // Update or create MongoDB record for each application
        await updateOrCreateMongoMIS(formattedApplication);
        logger.info(`Successfully updated or created MongoDB record for ${type} application`, { application_id: application.application_id });
      } catch (error) {
        console.log(error)
        logger.error(`Error updating or creating MongoDB record for ${type} application`, { application_id: application.application_id, error });
        // Continue to the next application even if an error occurs
      }
    }

    let query = ` update temp_mis_count where field_type = ? and count = count +100`;
    await _sequelize.query(query,{replacements:[type],type:QueryTypes.UPDATE})
    
    logger.info(`Successfully updated or created MongoDB records for all ${type} applications.`);
    return true;

  } catch (error) {
    logger.error(`Error fetching or updating ${type} credit card applications`, { error });
    throw error;
  }
}

module.exports = fetchCreditCardApplications;
