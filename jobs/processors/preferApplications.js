const fs = require('fs');
const path = require('path');
const sequelize = require('../../models/index'); // Adjust the path as needed
const { getDsaHierarchy, updateOrCreateMongoMIS } = require('../../helper'); // Adjust the path as needed
const { logger } = require('../../logger');
const { QueryTypes } = require("sequelize");

const getStatus = (subStage) => {
  let status;

  if ([
    'bureau_success', 'policy_approved', 'offer_accepted', 'tentative_offer_accepted',
    'ops_approved', 'agreement_accepted', 'policy_approved_tentative',
    'bureau_alternate_number', 'loan_application_started', 'pan_success',
    'personal_details', 'nach_success'
  ].includes(subStage)) {
    status = 'approved';
  } else if ([
    'bureau_rejected', 'policy_rejected', 'ops_rejected', 'age_rejected', 'pincode_rejected'
  ].includes(subStage)) {
    status = 'rejected';
  } else if (['disbursal_success'].includes(subStage)) {
    status = 'disbursed';
  } else {
    status = 'pending';
  }

  return status;
};

async function fetchPersonalLoanApplications() {
  try {

   
    const batchSize = 100;
    const type = 'Prefer'; // Assuming you are fetching applications of type "Prefer"
    let queryOffset = ` select * from  temp_mis_count where field_type = ? `;
    let offsetCount = await _dbWrite.query(queryOffset,{replacements:[type],type:QueryTypes.SELECT})
   
    logger.info(`Fetching the first ${batchSize} ${type} personal loan applications.`);

    const applicationsQuery = `
      SELECT
        cp.application_id,
        cp.desired_loan_amount,
        cust.address_city as current_address_city,
        cust.address_state as current_address_state,
        cust.address_pincode as current_address_pincode,
        cp.loan_amount,
        cp.disburse_amount,
        cp.stage,
        cp.sub_stage,
        cp.disburse_date,
        cp.dsa_mobile_number,
        cp.created_at,
        cp.updated_at
      FROM
        ru_credit_vidya_personal_loan_applications cp
      LEFT JOIN
        ru_customers cust ON cp.mobile_number = cust.customer_mobile_number
      ORDER BY
        cp.id
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
        lender: `${type.toLowerCase()}_pl`,
        loan_type: 'personal_loan',
        applied_amount: application.desired_loan_amount,
        city: application.current_address_city,
        state: application.current_address_state,
        pincode: application.current_address_pincode,
        users: dsaHierarchy,
        approved_amount: application.loan_amount,
        disbursed_amount: application.disburse_amount,
        status: getStatus(application.sub_stage),
        stage: application.stage,
        sub_stage: application.sub_stage,
        approved_date: null,
        disbursed_date: application.disburse_date,
        updated_at: application.updated_at,
        created_at: application.created_at,
        status_updated_at: new Date(),
      };

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

    // Update offset for the type
    let query = `  update temp_mis_count set count = count + ${applications.length}  where field_type = ? `;
    await _dbWrite.query(query,{replacements:[type],type:QueryTypes.UPDATE})
    logger.info(`Successfully updated or created MongoDB records for all ${type} applications.`);
    return true;

  } catch (error) {
    console.log(error)
    logger.error(`Error fetching or updating ${type} personal loan applications`, { error });
    throw error;
  }
}

module.exports = fetchPersonalLoanApplications;
