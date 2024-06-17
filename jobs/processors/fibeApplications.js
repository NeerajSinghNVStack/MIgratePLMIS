const fs = require('fs');
const path = require('path');
const sequelize = require('../../models/index'); // Adjust the path as needed
const { getDsaHierarchy, updateOrCreateMongoMIS } = require('../../helper'); // Adjust the path as needed
const { logger } = require('../../logger');
const { QueryTypes } = require("sequelize");

const getStatus = (applicationStatus) => {
  let status;
  if (applicationStatus === 'LOAN_TAKEN') {
    status = 'disbursed';
  } else if (['REJECTED', 'BLOCKED', 'ACCOUNT_RESET', 'ERROR'].includes(applicationStatus)) {
    status = 'rejected';
  } else {
    status = 'approved';
  }
  return status;
};

async function fetchPersonalLoanApplications() {
  try {
    const offsetsFilePath = path.resolve(__dirname, 'offsets.json');

    // Read offsets from JSON file
    let offsets = {};
    try {
      offsets = JSON.parse(fs.readFileSync(offsetsFilePath));
    } catch (err) {
      logger.error('Error reading offsets file:', err);
    }

    const batchSize = 100;
    const type = 'fibe'; // Type for fibe personal loan applications

    logger.info(`Fetching the first ${batchSize} ${type} 100 personal loan applications.`);

    const applicationsQuery = `
      SELECT
        fpl.application_id,
        fpl.sanctionLimit AS approved_amount,
        cust.address_city as city,
        cust.address_state as state,
        cust.address_pincode as pincode,
        fpl.dsa_mobile_number AS dsa_mobile_number,
        fpl.sub_stage AS stage,
        fpl.stage AS sub_stage,
        fpl.status AS status,
        fpl.disburse_amount,
        fpl.disbursed_date,
        fpl.created_at,
        fpl.updated_at
      FROM
        ru_fibe_personal_loan_applications fpl
      LEFT JOIN
        ru_customers cust ON fpl.mobilenumber = cust.customer_mobile_number
      ORDER BY
        fpl.id
      LIMIT :offset, :limit;
    `;

    logger.info(`Executing applications query for ${type}.`);
    const applications = await _sequelize.query(applicationsQuery, {
      type: QueryTypes.SELECT,
      replacements: {
        offset: offsets[type] || 0,
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
        approved_amount: application.approved_amount,
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

    // Update offset for the type
    offsets[type] = (offsets[type] || 0) + batchSize;

    // Write updated offsets to JSON file
    fs.writeFileSync(offsetsFilePath, JSON.stringify(offsets, null, 2));

    logger.info(`Successfully updated or created MongoDB records for all ${type} applications.`);
    return true;

  } catch (error) {
    logger.error(`Error fetching or updating ${type} personal loan applications`, { error });
    throw error;
  }
}

module.exports = fetchPersonalLoanApplications;
