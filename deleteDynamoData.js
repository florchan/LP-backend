const AWS = require('aws-sdk');
const logger = require('./logger');
const awsConfig = require('../config/index').aws;

AWS.config.update({ region: awsConfig.region });
const dynamoDB = new AWS.DynamoDB();

const updateData = async (item, type, id) => {
  try {
    const updateParams = {
      Key: {
        id: {
          S: item.id.S,
        },
      },
      ReturnValues: 'ALL_NEW',
      TableName: awsConfig.dynamoDBName,
      UpdateExpression: `SET ${type === 'check' ? 'check_project_ids = :i' : 'upd_project_ids = :i'}`,
    };
    if (type === 'check') {
      const index = item.check_project_ids.SS.indexOf(id);
      if (index === 0) {
        updateParams.UpdateExpression = 'REMOVE check_project_ids';
      } else if (index > 0) {
        item.check_project_ids.SS.splice(index, 1);
        updateParams.ExpressionAttributeValues = {};
        updateParams.UpdateExpression = 'SET check_project_ids = :i';
        updateParams.ExpressionAttributeValues = {
          ':i': {
            SS: item.check_project_ids.SS,
          },
        };
      }
    } else {
      const index = item.upd_project_ids.SS.indexOf(id);
      if (index === 0) {
        updateParams.UpdateExpression = 'REMOVE upd_project_ids';
      } else if (index > 0) {
        item.upd_project_ids.SS.splice(index, 1);
        updateParams.UpdateExpression = 'SET upd_project_ids = :i';
        updateParams.ExpressionAttributeValues = {
          ':i': {
            SS: item.upd_project_ids.SS,
          },
        };
      }
    }
    await dynamoDB.updateItem(updateParams).promise();
  } catch (e) {
    logger.error(`Failed update dynamo data ${e}`);
  }
};

const deleteProject = async (id) => {
  try {
    const paramsCheck = {
      ScanFilter: {
        check_project_ids: {
          ComparisonOperator: 'CONTAINS',
          AttributeValueList: [
            {
              S: id,
            },
          ],
        },
      },
      TableName: awsConfig.dynamoDBName,
    };

    const checkRecord = await dynamoDB.scan(paramsCheck).promise();
    if (checkRecord.Items[0]) await updateData(checkRecord.Items[0], 'check', id);

    const paramsUpdate = {
      ScanFilter: {
        upd_project_ids: {
          ComparisonOperator: 'CONTAINS',
          AttributeValueList: [
            {
              S: id,
            },
          ],
        },
      },
      TableName: awsConfig.dynamoDBName,
    };

    const updateRecord = await dynamoDB.scan(paramsUpdate).promise();
    if (updateRecord.Items[0]) await updateData(updateRecord.Items[0], 'update', id);
  } catch (e) {
    logger.error(`Failed getting info from dynamo ${e}`);
  }
};

module.exports = deleteProject;
