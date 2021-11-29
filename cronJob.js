const cron = require('node-cron');
const projectModel = require('../models/project');
const send = require('./send');
const conf = require('../conf/config').SQS;
const log = require('./info/log');

cron.schedule('* * * * *', async () => {
  logger.info('cron per minute');
  try {
    const projects = await projectModel.find({
      is_active: true,
      run_option: 1,
      $or: [{ is_payment_active: true }, { is_trialing: true }, { credentials: { $exists: false } }],
      is_suspended: false,
    });
    const messages = [];

    for (let i = 0; i < Math.ceil(projects.length / 10); i += 1) {
      messages[i] = projects.slice((i * 10), (i * 10) + 10);
    }
    await send(messages, conf.url);
  } catch (err) {
    log.error(`Failed to get projects: ${err}`);
  }
});
