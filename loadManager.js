/* eslint-disable no-loop-func */
/* eslint-disable no-cond-assign */
/* eslint-disable no-restricted-syntax */
const cron = require('node-cron');
const AWS = require('aws-sdk');
const SSH = require('ssh2').Client;
const fs = require('fs');
const projectModel = require('../models/project');
const logger = require('./logger');
const serviceConf = require('../config/config').services;
const instanceConf = require('../config/config').instances;

AWS.config.update({ region: 'us-east-1' });
const dynamoDB = new AWS.DynamoDB();
const ec2 = new AWS.EC2();

let isLaunched = false;

async function startLoadManager() {
  cron.schedule('*/10 * * * * *', async () => {
    logger.info(`cron per minute (state ${isLaunched ? 'launched' : 'not launched'})`);
    if (isLaunched) return 1;
    try {
      isLaunched = true;
      const projects = await projectModel.find(
        { is_active: true,
          $or: [{ is_payment_active: true }, { is_trialing: true }, { credentials: { $exists: false } }],
        },
      ).select('_id');
      const dynamoData = await dynamoDB.scan({
        TableName: serviceConf.dynamoDBName,
        AttributesToGet: ['id', 'check_project_ids',
          'upd_project_ids', 'count_check', 'count_update'],
      }).promise();
      const existingItemCheck = [];
      const notExistingItemCheck = [];
      const existingItemUpdate = [];
      const notExistingItemUpdate = [];
      const allCheckProjectsIds = [];
      const allUpdateProjectsIds = [];
      const instancesForTerminate = [];

      let freeSlotsForCheck = 0;
      let freeSlotsForUpdate = 0;
      dynamoData.Items.map(async (res) => {
        freeSlotsForCheck += serviceConf.maxCheckProjects - res.count_check.N < 1 ? 0 : serviceConf.maxCheckProjects - res.count_check.N;
        freeSlotsForUpdate += serviceConf.maxUpdateProjects - res.count_update.N < 1 ? 0 : serviceConf.maxUpdateProjects - res.count_update.N;
        if ((res.check_project_ids && ((res.check_project_ids.SS.length / +res.count_check.N) * 100 < 70))
          || (res.upd_project_ids && ((res.upd_project_ids.SS.length / +res.count_update.N) * 100 < 70))
          || (!res.upd_project_ids && res.count_update.N > 0) || (!res.check_project_ids && res.count_check.N > 0)) {
          instancesForTerminate.push(res.id.S);
          const params = {
            Key: {
              id: {
                S: res.id.S,
              },
            },
            TableName: serviceConf.dynamoDBName,
          };
          await dynamoDB.deleteItem(params).promise();
        } else {
          if (res.check_project_ids) {
            allCheckProjectsIds.push(...res.check_project_ids.SS);
          }
          if (res.upd_project_ids) {
            allUpdateProjectsIds.push(...res.upd_project_ids.SS);
          }
          return 1;
        }
      });
      projects.map((res) => {
        // eslint-disable-next-line no-underscore-dangle
        const id = res._id.toString();
        if (allCheckProjectsIds && allCheckProjectsIds.includes(id)) existingItemCheck.push(id);
        else notExistingItemCheck.push(id);

        if (allUpdateProjectsIds && allUpdateProjectsIds.includes(id)) existingItemUpdate.push(id);
        else notExistingItemUpdate.push(id);
        return 1;
      });
      if (instancesForTerminate.length) await ec2.terminateInstances({ InstanceIds: instancesForTerminate }).promise();
      if (notExistingItemCheck || notExistingItemUpdate) {
        const instanceCount = Math.ceil((notExistingItemCheck.length - freeSlotsForCheck) / serviceConf.maxCheckProjects)
          > Math.ceil((notExistingItemUpdate.length - freeSlotsForUpdate) / serviceConf.maxUpdateProjects)
          ? Math.ceil((notExistingItemCheck.length - freeSlotsForCheck) / serviceConf.maxCheckProjects)
          : Math.ceil((notExistingItemUpdate.length - freeSlotsForUpdate) / serviceConf.maxUpdateProjects);
        if (instanceCount < 1) {
          isLaunched = false;
          return 1;
        }
        const params = {
          ImageId: instanceConf.imageId,
          InstanceType: instanceConf.instanceType,
          KeyName: instanceConf.keyPairName,
          MaxCount: instanceCount,
          MinCount: instanceCount,
          CreditSpecification: {
            CpuCredits: 'unlimited',
          },
          SecurityGroupIds: instanceConf.securityGroups,
          SubnetId: instanceConf.subnetId,
          TagSpecifications: [{
            ResourceType: "instance",
            Tags: [{ Key: "Name", Value: `${serviceConf.gitBranch} check/update api` }],
          }],
        };
        const instances = await ec2.runInstances(params).promise();
        await new Promise((res) => {
          setTimeout(res, 20000);
        });
        const instanceIds = instances.Instances.map((res) => res.InstanceId);
        const getInstances = {
          InstanceIds: instanceIds,
        };
        const instanceData = await ec2.describeInstances(getInstances).promise();
        await new Promise((res) => {
          setTimeout(res, 45000);
        });
        for (const instance of instanceData.Reservations[0].Instances) {
          const conn = new SSH();
          logger.info(`Instance IP ${instance.PrivateIpAddress} START CONN`);
          await new Promise((res, rej) => {
            try {
              const timer = setTimeout(async () => {
                rej(new Error("Cannot connect to the instance"));
              }, 10000);
              conn.on('ready', async () => {
                clearTimeout(timer);
                try {
                  logger.info(`Instance IP ${instance.PrivateIpAddress} start pull project`);
                  await new Promise((res, rej) => {
                    conn.exec(`cd /opt/justearlybird-automation && git pull origin ${serviceConf.gitBranch}`, async (err) => {
                      if (err) rej(err);
                      res(1);
                    });
                  });
                  logger.info(`Instance IP ${instance.PrivateIpAddress} start conf env`);
                  await new Promise((res, rej) => {
                    conn.exec(`echo 'NODE_ENV=${process.env.NODE_ENV}' >> /opt/justearlybird-automation/.env`, async (err) => {
                      if (err) rej(err);
                      res(1);
                    });
                  });
                  logger.info(`Instance IP ${instance.PrivateIpAddress} start npm i`);
                  await new Promise((res, rej) => {
                    conn.exec(`cd /opt/justearlybird-automation && npm i`, async (err, stream) => {
                      if (err) rej(err);
                      stream.on('data', () => {
                        res(1);
                      });
                    });
                  });
                  logger.info(`Instance IP ${instance.PrivateIpAddress} restart update api`);
                  await new Promise((res, rej) => {
                    conn.exec(`pm2 restart 0`, async (err, stream) => {
                      if (err) rej(err);
                      stream.on('data', (data) => {
                        console.log(data.toString());
                        res(1);
                      });
                    });
                  });
                  logger.info(`Instance IP ${instance.PrivateIpAddress} restart check api`);
                  await new Promise((res, rej) => {
                    conn.exec(`pm2 restart 1`, async (err, stream) => {
                      if (err) rej(err);
                      stream.on('data', (data) => {
                        console.log(data.toString());
                        res(1);
                      });
                    });
                  });
                  logger.info(`Instance IP ${instance.PrivateIpAddress} exit`);
                  await new Promise((res, rej) => {
                    conn.exec(`exit`, (err) => {
                      if (err) rej(err);
                      res(1);
                    });
                  });
                  logger.info(`Instance IP ${instance.PrivateIpAddress} connect end`);
                  conn.end();
                  res(1);
                } catch (err) {
                  logger.error(`Failed configure instance ${err}`);
                  rej(err);
                }
              }).connect({
                host: instance.PrivateIpAddress,
                username: 'ec2-user',
                privateKey: fs.readFileSync(instanceConf.keyPath),
                readyTimeout: 10000,
              });
            } catch (err) {
              logger.error(`Failed connect to instance ${err}`);
              rej(err);
            }
          });
          const dynamoParams = {
            Item: {
              id: {
                S: instance.InstanceId,
              },
              private_ip: {
                S: instance.PrivateIpAddress,
              },
              public_ip: {
                S: instance.PublicIpAddress,
              },
              count_check: {
                N: '0',
              },
              count_update: {
                N: '0',
              },
            },
            ReturnConsumedCapacity: 'TOTAL',
            TableName: serviceConf.dynamoDBName,
          };
          // eslint-disable-next-line no-await-in-loop
          await dynamoDB.putItem(dynamoParams).promise();
        }
      }
      isLaunched = false;
    } catch (err) {
      isLaunched = false;
      logger.error(`Failed to get projects: ${JSON.stringify(err)}`);
    }
  });
}

module.exports = startLoadManager;
