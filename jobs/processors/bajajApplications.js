const fs = require('fs');
const path = require('path');
const sequelize = require('../../models/index'); // Adjust the path as needed
const { getDsaHierarchy, updateOrCreateMongoMIS } = require('../../helper'); // Adjust the path as needed
const { logger } = require('../../logger');
const { QueryTypes } = require("sequelize");

const getStatus = (stage, subStage) => {
  let status = 'rejected'; // Default to 'rejected'

  if (stage === 'Approved') {
    if (subStage === 'Approved & Disbursed') {
      status = 'disbursed';
    } else if (['Approved', 'Approved & Discrepancy Resolved'].includes(subStage)) {
      status = 'approved';
    } else if ([
        'Approved & DI Confirmation Pending',
        'Approved & DI Initiation Pending',
        'Approved & LAN Generation Pending',
        'Decision Pending',
        'Decision Pending_Reco',
        'Discrepancy Initiated',
        'Discrepancy Resolved',
        'QC Pending',
        'RSA Initiated',
        'RSA Resolved',
        'TVR/PD Hold',
        'RSA Resolved_QC Pending',
        'Reappraisal initiated_QC Pending',
        'Approved & Discrepancy Initiated',
        'Credit Decisioning - Hold',
        'HO Hold-QC Pending',
        'HO Hold-Decision Pending'
    ].includes(subStage)) {
      status = 'pending';
    }
  } else if (stage === 'Active') {
    status = 'pending';
  }

  return status;
};

async function fetchPersonalLoanApplications() {
  try {
    const batchSize = 100;
    const type = 'bajaj'; // Type for bajaj personal loan applications
    let queryOffset = ` select * from  temp_mis_count where field_type = ? `;
    let offsetCount = await _sequelize.query(queryOffset,{replacements:[type],type:QueryTypes.SELECT})
   
    logger.info(`Fetching the first ${batchSize} ${type} 100 personal loan applications.`);

    const applicationsQuery = `
      SELECT
        bajaj.application_id,
        bajaj.requested_loan_amount AS applied_amount,
        cust.address_city as city,
        cust.address_state as state,
        cust.address_pincode as pincode,
        bajaj.dsa_mobile_number,
        bajaj.sub_stage AS stage,
        bajaj.sub_stage AS sub_stage,
        bajaj.disburse_amount,
        bajaj.disburse_date,
        bajaj.created_at,
        bajaj.updated_at
      FROM
        ru_bajaj_finance_personal_loan_applications bajaj
      LEFT JOIN
        ru_customers cust ON bajaj.mobile_number = cust.customer_mobile_number
      ORDER BY
        bajaj.id
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
        applied_amount: application.applied_amount,
        approved_amount: 0, // Initialize approved amount to 0
        approved_date: null,
        city: application.city,
        state: application.state,
        pincode: application.pincode,
        users: dsaHierarchy,
        disbursed_amount: application.disburse_amount || 0, // Handle null values
        stage: application.stage,
        sub_stage: application.sub_stage,
        status: getStatus(application.stage, application.sub_stage),
        disbursed_date: application.disburse_date,
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

    let query = ` update temp_mis_count where field_type = ? set count = count +100`;
    await _sequelize.query(query,{replacements:[type],type:QueryTypes.UPDATE})
    
    logger.info(`Successfully updated or created MongoDB records for all ${type} applications.`);
    return true;

  } catch (error) {
    logger.error(`Error fetching or updating ${type} personal loan applications`, { error });
    throw error;
  }
}

module.exports = fetchPersonalLoanApplications;
