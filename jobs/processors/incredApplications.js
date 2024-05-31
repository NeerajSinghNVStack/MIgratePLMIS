const fs = require('fs');
const path = require('path');
const sequelize = require('../../models/index'); // Adjust the path as needed
const { getDsaHierarchy, updateOrCreateMongoMIS } = require('../../helper'); // Adjust the path as needed
const { logger } = require('../../logger');
const { QueryTypes } = require("sequelize");

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

    const batchSize = 10;
    const type = 'incred'; // Type for incred personal loan applications

    logger.info(`Fetching the first ${batchSize} ${type} 100 personal loan applications.`);

    const applicationsQuery = `
      SELECT
        incred.application_id,
        la.original_loan_amount AS applied_amount,
        incred.loan_amount AS approved_amount,
        cust.address_city as city,
        cust.address_state as state,
        cust.address_pincode as pincode,
        incred.dsa_mobile_number,
        incred.status,
        incred.disburse_date
      FROM
        ru_incred_personal_loan_applications incred
      LEFT JOIN
        ru_loan_applications la ON la.application_id = incred.application_id
      LEFT JOIN
        ru_customers cust ON incred.mobile = cust.customer_mobile_number
      ORDER BY
        incred.id
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
        approved_amount: application.approved_amount || 0, // Handle null values
        approved_date: 1, // Replace with appropriate value
        city: application.city,
        state: application.state,
        pincode: application.pincode,
        users: dsaHierarchy,
        disbursed_amount: 0,
        stage: application.status,
        sub_stage: null,
        status: null,
        disbursed_date: application.disburse_date,
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
    console.log(error)
    logger.error(`Error fetching or updating ${type} personal loan applications`, { error });
    throw error;
  }
}

module.exports = fetchPersonalLoanApplications;
