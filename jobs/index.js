require('dotenv').config({ path: '.env' });
const Queue = require('bull');
const path = require('path');
const Sequelize = require('sequelize');
const redisUrl = process.env.REDIS_CONNECTION_WITH_PORT;

global._sequelize = new Sequelize(process.env.DATABASE_NAME, process.env.DATABASE_USER_NAME, process.env.DATABASE_PASSWORD, {
    host: process.env.DATABASE_HOST,
    dialect: process.env.DATABASE_DIALECT,
    timezone: '+05:30',
    logging: true 
  });

// prefer Cron

const preferProcessor = require('./processors/preferApplications');

const preferQueue = new Queue('Prefer Application Queue', redisUrl);

preferQueue.process((job) => preferProcessor(job));

preferQueue.add(null,{repeat:{cron:"*/11 * * * *"}});

//fibe cron

const fibeProcessor = require('./processors/fibeApplications');

const fibeQueue = new Queue('Fibe Application Queue', redisUrl);

fibeQueue.process((job) => fibeProcessor(job));


fibeQueue.add(null,{repeat:{cron:"*/13 * * * *"}});

//paysense

const paysenseProcessor = require('./processors/paysenseApplications');

const paysenseQueue = new Queue('Paysense Application Queue', redisUrl);

paysenseQueue.process((job) => paysenseProcessor(job));

paysenseQueue.add(null,{repeat:{cron:"*/15 * * * *"}});

//bajaj

const bajajProcessor = require('./processors/bajajApplications');

const bajajQueue = new Queue('Bajaj Application Queue', redisUrl);

bajajQueue.process((job) => bajajProcessor(job));

bajajQueue.add(null,{repeat:{cron:"*/12 * * * *"}});

//incred

const incredProcessor = require('./processors/incredApplications');

const incredQueue = new Queue('Incred Application Queue', redisUrl);

incredQueue.process((job) => incredProcessor(job));

incredQueue.add(null,{repeat:{cron:"*/14 * * * *"}});

