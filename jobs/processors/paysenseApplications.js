const fs = require('fs');
const path = require('path');
const sequelize = require('../../models/index'); // Adjust the path as needed
const { getDsaHierarchy, updateOrCreateMongoMIS } = require('../../helper'); // Adjust the path as needed
const { logger } = require('../../logger');
const { QueryTypes } = require("sequelize");

const getStatus = (payUApplicationStatus) => {
  let status = 'pending';
  if (payUApplicationStatus === 'REJECTED') {
    status = 'rejected';
  } else if (payUApplicationStatus === 'disbursed') {
    status = 'disbursed';
  }
  return status;
};

async function fetchPersonalLoanApplications() {
  try {

    const batchSize = 100;
    const type = 'paysense'; // Type for paysense personal loan applications
    let queryOffset = ` select * from  temp_mis_count where field_type = ? `;
    let offsetCount = await _dbWrite.query(queryOffset,{replacements:[type],type:QueryTypes.SELECT})
   
    logger.info(`Fetching the first ${batchSize} ${type} 100 personal loan applications.`);

    const applicationsQuery = `
      SELECT
        payu.application_id,
        payu.approved_limit AS approved_amount,
        cust.address_city as city,
        cust.address_state as state,
        cust.address_pincode as pincode,
        payu.phone AS dsa_mobile_number,
        payu.stage AS stage,
        payu.sub_stage AS sub_stage,
        rgsm.ru_status as status,
        payu.disburse_amount,
        payu.disbursed_date,
        payu.created_at,
        payu.updated_at
      FROM
        ru_pay_u_personal_loan_applications payu
      LEFT JOIN
        ru_global_status_meta rgsm on
        cast(payu.status as char charset binary) = cast(rgsm.status as char charset binary)
      LEFT JOIN 
        ru_customers cust ON payu.phone = cust.customer_mobile_number
      ORDER BY
        payu.id
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
        lender: `${type}_pl`,
        loan_type: 'personal_loan',
        applied_amount: application.applied_amount || 0,
        approved_amount: application.approved_amount || 0, // Handle null values
        approved_date: 1, // Replace with appropriate value
        city: application.city,
        state: application.state,
        pincode: application.pincode,
        users: dsaHierarchy,
        disbursed_amount: application.disburse_amount || 0, // Handle null values
        stage: application.stage,
        sub_stage: application.sub_stage,
        status: getStatus(application.status),
        disbursed_date: application.disbursed_date,
        updated_at: application.updated_at,
        created_at: application.created_at,
        status_updated_at: 1, // Replace with appropriate value
      };
      try {
        // Update or create MongoDB record for each application
        await updateOrCreateMongoMIS(formattedApplication);
        logger.info(`Successfully updated or created MongoDB record for ${type} application`, { application_id: application.application_id });
      } catch (error) {
        logger.error(`Error updating or creating MongoDB record for ${type} application`, { application_id: application.application_id, error });
        // Continue to the next application even if an error occurs
      }
    }

    let query = `  update temp_mis_count set count = count + ${applications.length}  where field_type = ? `;
    await _dbWrite.query(query,{replacements:[type],type:QueryTypes.UPDATE})
    
    logger.info(`Successfully updated or created MongoDB records for all ${type} applications.`);
    return true;

  } catch (error) {
    logger.error(`Error fetching or updating ${type} personal loan applications`, { error });
    throw error;
  }
}

module.exports = fetchPersonalLoanApplications;
