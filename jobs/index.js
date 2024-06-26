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

  global._dbWrite = new Sequelize(process.env.DATABASE_NAME, process.env.DATABASE_USER_NAME, process.env.DATABASE_PASSWORD, {
    host: process.env.DATABASE_HOST_WRITE,
    dialect: process.env.DATABASE_DIALECT,
    timezone: '+05:30',
    logging: true 
  });

// prefer Cron

const preferProcessor = require('./processors/preferApplications');

const preferQueue = new Queue('Prefer Application Queue', redisUrl);


preferQueue.process((job) => preferProcessor(job));


preferQueue.add(null,{repeat:{cron:"*/2 * * * *"}});

//fibe cron

const fibeProcessor = require('./processors/fibeApplications');

const fibeQueue = new Queue('Fibe Application Queue', redisUrl);


fibeQueue.process((job) => fibeProcessor(job));
fibeQueue.add(null,{repeat:{cron:"*/3 * * * *"}});

//paysense

const paysenseProcessor = require('./processors/paysenseApplications');

const paysenseQueue = new Queue('Paysense Application Queue', redisUrl);

paysenseQueue.process((job) => paysenseProcessor(job));
paysenseQueue.add(null,{repeat:{cron:"*/5 * * * *"}});

//bajaj

const bajajProcessor = require('./processors/bajajApplications');

const bajajQueue = new Queue('Bajaj Application Queue', redisUrl);

bajajQueue.process((job) => bajajProcessor(job));
bajajQueue.add(null,{repeat:{cron:"*/6 * * * *"}});

//incred

const incredProcessor = require('./processors/incredApplications');

const incredQueue = new Queue('Incred Application Queue', redisUrl);

incredQueue.process((job) => incredProcessor(job));
incredQueue.add(null,{repeat:{cron:"*/4 * * * *"}});

//lnt
const lntProcessor = require('./processors/lntApplications');

const lntQueue = new Queue('Lnt Application Queue', redisUrl);

lntQueue.process((job) => lntProcessor(job));
lntQueue.add(null,{repeat:{cron:"*/3 * * * *"}});


// credit card
const ccProcessor = require('./processors/creditCardApplications');

const ccQueue = new Queue('Credit Card Application Queue', redisUrl);

ccQueue.process((job) => ccProcessor(job));


ccQueue.add(null,{repeat:{cron:"*/2 * * * *"}});

