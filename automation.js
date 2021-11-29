/* eslint-disable no-shadow */
/* eslint-disable new-cap */
/* eslint-disable no-underscore-dangle */
/* eslint-disable prefer-destructuring */
/* eslint-disable func-names */
/* eslint-disable array-callback-return */
/* eslint-disable no-unused-vars */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-console */
/* eslint-disable guard-for-in */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-undef */
/* eslint-disable camelcase */
const webdriver = require('selenium-webdriver');

const {
  Builder, By, Key, until,
} = webdriver;
const chrome = require('selenium-webdriver/chrome');
const axios = require('axios');
const projectModel = require('../models/project');
const rewardModel = require('../models/reward');
const rewardChangeLogModel = require('../models/reward_change_log');

const screen = {
  width: 1920,
  height: 1080,
};

async function get_kickstarter_driver(url, email_address, password, project_id) {
  webdriver_for_check[project_id] = new Builder()
    .forBrowser('chrome')
    .setChromeOptions(new chrome.Options().headless().windowSize(screen).addArguments('--no-sandbox')
      .addArguments('--disable-dev-shm-usage'))
    .build();

  await webdriver_for_check[project_id].manage().deleteAllCookies();

  await webdriver_for_check[project_id].get(url);

  await webdriver_for_check[project_id].wait(until.elementLocated(By.linkText('Log in')), 50000).then(() => {
    webdriver_for_check[project_id].findElement(By.linkText('Log in')).click();
  });

  await webdriver_for_check[project_id].wait(until.elementLocated(By.id('user_session_email')), 50000).then(() => {
    webdriver_for_check[project_id].findElement(By.id('user_session_email')).sendKeys(email_address, Key.TAB);
    webdriver_for_check[project_id].findElement(By.id('user_session_password')).sendKeys(password, Key.RETURN);
  });

  return webdriver_for_check[project_id];
}

async function get_indiegogo_driver(url, email_address, password, project_id) {
  webdriver_for_check[project_id] = new Builder()
    .forBrowser('chrome')
    .setChromeOptions(new chrome.Options().headless().windowSize(screen).addArguments('--no-sandbox')
      .addArguments('--disable-dev-shm-usage'))
    .build();

  await webdriver_for_check[project_id].manage().deleteAllCookies();

  await webdriver_for_check[project_id].get(url);

  await webdriver_for_check[project_id].wait(until.elementLocated(By.className('layoutHeader-logIn')), 50000).then(() => {
    webdriver_for_check[project_id].findElement(By.className('layoutHeader-logIn')).click();
  });

  await webdriver_for_check[project_id].wait(until.elementLocated(By.id('email')), 50000).then(() => {
    webdriver_for_check[project_id].findElement(By.id('email')).sendKeys(email_address, Key.TAB);
    webdriver_for_check[project_id].findElement(By.id('password')).sendKeys(password, Key.RETURN);
  });

  return webdriver_for_check[project_id];
}

async function get_kickstarter_reward_data(url, email_address, password, prj_id, webdriver_obj) {
  let driver = webdriver_obj;

  if (driver == null) {
    driver = await get_kickstarter_driver(url, email_address, password, prj_id);
  }

  let response = {};

  const display_name = await driver.wait(until.elementLocated(By.xpath('//title')), 50000)
    .then(() => driver.findElement(By.xpath('//title')).getAttribute('innerHTML'));

  await driver.wait(until.elementLocated(By.xpath("//meta[@name='csrf-token']")), 50000).then(async () => {
    const csrf_token = await driver.findElement(By.xpath("//meta[@name='csrf-token']")).getAttribute('content');
    const cookie_info = await driver.manage().getCookies();

    let ksr_session;
    const temp = url.split('/');
    const slug = temp[temp.length - 1].split('?')[0];

    for (const i in cookie_info) {
      if (cookie_info[i].name === '_ksr_session') {
        ksr_session = `_ksr_session=${cookie_info[i].value}`;
      }
    }

    try {
      response = await axios({
        url: 'https://www.kickstarter.com/graph',
        method: 'post',
        headers: {
          'Content-Type': 'application/json',
          cookie: ksr_session,
          'x-csrf-token': csrf_token,
        },
        data: {
          query:
            `
                            query($slug: String!) {
                                project(slug: $slug) {
                                    rewards {
                                        nodes {
                                            ...rewardFragment
                                        }
                                    }
                                }
                            }
                            fragment rewardFragment on Reward {
                                amount {
                                    currency,
                                    amount,
                                    symbol
                                }
                                backersCount
                                description
                                estimatedDeliveryOn
                                id
                                items {
                                    edges {
                                        quantity
                                        position
                                        node {
                                            id
                                            name
                                        }
                                    }
                                }
                                limit
                                rewardType
                                name
                                remainingQuantity
                                shippingPreference
                                shippingRules {
                                    id
                                    cost {
                                        amount
                                    }
                                    location {
                                        id
                                    }
                                    hasBackers
                                }
                                shippingSummary
                                startsAt
                                endsAt
                            }
                        `,
          variables: {
            slug,
          },
        },
      });
    } catch (error) {
      console.error(error);
    }
  });

  const result = {
    driver,
    display_name,
    data: response.data.data.project.rewards.nodes,
  };

  return result;
}

async function get_indiegogo_reward_data(url, email_address, password, prj_id, webdriver_obj) {
  let driver = webdriver_obj;

  if (driver == null) {
    driver = await get_indiegogo_driver(url, email_address, password, prj_id);
  }

  let response = {};

  const display_name = await driver.wait(until.elementLocated(By.xpath('//title')), 50000)
    .then(() => driver.findElement(By.xpath('//title')).getAttribute('innerHTML'));

  await driver.wait(until.elementLocated(By.xpath("//meta[@name='sailthru.project_id']")), 50000).then(async () => {
    const project_id = await driver.findElement(By.xpath("//meta[@name='sailthru.project_id']")).getAttribute('content');

    try {
      response = await axios({
        url: 'https://www.indiegogo.com/private_api/graph/query?operation_id=perks_and_items_for_editing_query',
        method: 'post',
        data: {
          variables: { project_id },
        },
      });
    } catch (error) {
      console.error(error);
    }
  });

  const result = {
    driver,
    display_name,
    data: response.data.data.project.editor_perks,
  };

  return result;
}

exports.update_kickstarter_reward = async (
  url, email_address, password, db_reward_data, project_id, webdriver_obj,
) => {
  const reward_data = await get_kickstarter_reward_data(
    url,
    email_address,
    password,
    project_id,
    webdriver_obj,
  );
  const result = db_reward_data;

  for (const j in result) {
    for (const i in reward_data.data) {
      if (reward_data.data[i].id === result[j].reward_id) {
        const current_reward_data = reward_data.data[i];

        result[j].name = current_reward_data.name;
        result[j].price = current_reward_data.amount.amount;

        if (current_reward_data.remainingQuantity >= result[j].minimum_stock) {
          result[j].remain_stock = current_reward_data.remainingQuantity;
          result[j].total_stock = current_reward_data.limit;
        } else {
          let remain_stock = 0;
          let total_stock = 0;

          if (result[j].maximum_sales === 0
            || (result[j].maximum_sales !== 0
              && current_reward_data.limit + result[j].top_up_increment <= result[j].maximum_sales)) {
            remain_stock = current_reward_data.remainingQuantity + result[j].top_up_increment;
            total_stock = current_reward_data.limit + result[j].top_up_increment;
          } else if (result[j].maximum_sales !== 0
            && current_reward_data.limit + result[j].top_up_increment > result[j].maximum_sales) {
            remain_stock = current_reward_data.remainingQuantity + (result[j].maximum_sales - current_reward_data.limit);
            total_stock = result[j].maximum_sales;
          }

          result[j].remain_stock = remain_stock;
          result[j].total_stock = total_stock;

          current_reward_data.limit = total_stock;

          await reward_data.driver.wait(until.elementLocated(By.xpath("//meta[@name='csrf-token']")), 50000).then(async () => {
            const csrf_token = await reward_data.driver.findElement(By.xpath("//meta[@name='csrf-token']")).getAttribute('content');
            const cookie_info = await reward_data.driver.manage().getCookies();

            let ksr_session;

            for (const m in cookie_info) {
              if (cookie_info[m].name === '_ksr_session') {
                ksr_session = `_ksr_session=${cookie_info[m].value}`;
              }
            }

            try {
              await axios({
                url: 'https://www.kickstarter.com/graph',
                method: 'post',
                headers: {
                  cookie: ksr_session,
                  'x-csrf-token': csrf_token,
                },
                data: {
                  query:
                    `
                                            mutation($input: UpdateRewardInput!) {
                                                updateReward(
                                                    input: $input
                                                ) {
                                                    project {
                                                        rewards {
                                                            nodes {
                                                                ...rewardFragment
                                                                }
                                                            }
                                                        addOns {
                                                            nodes {
                                                                ...rewardFragment
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                            fragment rewardFragment on Reward {
                                                limit
                                            }
                                        `,
                  variables: {
                    input: {
                      id: current_reward_data.id,
                      limit: current_reward_data.limit,
                    },
                  },
                },
              });
            } catch (error) {
              console.error(error);
            }
          });
        }
      }
    }
  }

  return result;
};

exports.update_indiegogo_reward = async function (url, email_address, password, db_reward_data, project_id, webdriver_obj) {
  const reward_data = await get_indiegogo_reward_data(url, email_address, password, project_id, webdriver_obj);
  const result = db_reward_data;

  for (const j in result) {
    for (const i in reward_data.data) {
      if (reward_data.data[i].id === result[j].reward_id) {
        const current_reward_data = reward_data.data[i];

        result[j].name = current_reward_data.label;
        result[j].price = current_reward_data.amount;

        if (current_reward_data.number_available - current_reward_data.number_claimed >= result[j].minimum_stock) {
          result[j].remain_stock = current_reward_data.number_available - current_reward_data.number_claimed;
          result[j].total_stock = current_reward_data.number_available;
        } else {
          let remain_stock = 0;
          let total_stock = 0;

          if (result[j].maximum_sales === 0
            || (result[j].maximum_sales !== 0
              && current_reward_data.number_available + result[j].top_up_increment <= result[j].maximum_sales)) {
            remain_stock = current_reward_data.number_available - current_reward_data.number_claimed + result[j].top_up_increment;
            total_stock = current_reward_data.number_available + result[j].top_up_increment;
          } else if (result[j].maximum_sales !== 0
            && current_reward_data.number_available + result[j].top_up_increment > result[j].maximum_sales) {
            remain_stock = current_reward_data.number_available - current_reward_data.number_claimed
              + (maximum_sales - current_reward_data.number_available);
            total_stock = result[j].maximum_sales;
          }

          result[j].remain_stock = remain_stock;
          result[j].total_stock = total_stock;

          current_reward_data.number_available = total_stock;
          await new Promise((res, rej) => {
            setTimeout(() => {
              res(1);
            }, 5000);
          });
          await reward_data.driver.wait(until.elementLocated(By.xpath("//meta[@name='csrf-token']")), 50000).then(async () => {
            const project_id = await reward_data.driver.findElement(By.xpath("//meta[@name='sailthru.project_id']")).getAttribute('content');
            const csrf_token = await reward_data.driver.findElement(By.xpath("//meta[@name='csrf-token']")).getAttribute('content');
            const cookie_info = await reward_data.driver.manage().getCookies();

            let session_id;

            for (const m in cookie_info) {
              if (cookie_info[m].name === '_session_id') {
                session_id = `_session_id=${cookie_info[m].value}`;
              }
            }

            try {
              const data = await axios({
                url: `https://www.indiegogo.com/private_api/campaign_editor/${project_id}/perks/${current_reward_data.id}`,
                method: 'put',
                headers: {
                  cookie: session_id,
                  'x-csrf-token': csrf_token,
                },
                data: {
                  perk: {
                    amount: current_reward_data.amount,
                    description: current_reward_data.description,
                    estimated_delivery_date: current_reward_data.estimated_delivery_date,
                    label: current_reward_data.label,
                    number_available: current_reward_data.number_available,
                    perk_image_public_id: current_reward_data.perk_image_public_id,
                    perk_item_links: current_reward_data.perk_item_links,
                    perk_type: current_reward_data.perk_type,
                    retail_amount: current_reward_data.retail_amount,
                    secret_perk_token: current_reward_data.secret_perk_token,
                    shipping_address_required: current_reward_data.shipping_address_required,
                    shipping_fees: current_reward_data.shipping_fees,
                    status: current_reward_data.status,
                  },
                },
              });
            } catch (error) {
              console.error(error);
            }
          });
        }
      }
    }
  }

  return result;
};

const getClientIp = async (req, res) => {
  let ipAddress;

  const forwardedIpsStr = req.headers['x-forwarded-for'] || req.headers['X-Forwarded-For'];

  if (forwardedIpsStr) {
    const forwardedIps = forwardedIpsStr.split(',');
    ipAddress = forwardedIps[0];
  }

  if (!ipAddress) {
    ipAddress = req.connection.remoteAddress;
  }

  const result = {
    ipAddress,
  };

  res.json(result);
};

async function getProjectData(req, res, next) {
  await projectModel.find((err, docs) => {
    if (!err) {
      res.render('index', { data: docs, title: 'Project List', error: '' });
    } else {
      res.render('index', { data: docs, title: 'Project List', error: `Error during get all the project data : ${err}` });
    }
  });
}

exports.getProjectData = async function (req, res, next) {
  await getProjectData(req, res, next);
};

async function saveRewardDataByProjectId(req, res, project_info) {
  let reward_data = {};
  const update_data = {};

  if (project_info.site_type === 'KS') {
    reward_data = await get_kickstarter_reward_data(project_info.url, project_info.email, project_info.password, project_info._id, null);
    update_data.display_name = reward_data.display_name.split(' — ')[0];
  } else {
    reward_data = await get_indiegogo_reward_data(project_info.url, project_info.email, project_info.password, project_info._id, null);
    update_data.display_name = reward_data.display_name.split(' | ')[0];
  }

  await projectModel.findOneAndUpdate({ _id: project_info._id }, update_data, { new: true }, (err, doc) => {
    if (err) {
      res.render('projects', { data: {}, title: 'Project Detail', error: `Error duing saving created webdriver object : ${err}` });
    }
  });

  let now = new Date();

  if (now.getMonth() < 9 && now.getDate() < 10) {
    now = `${now.getFullYear()}-0${now.getMonth() + 1}-0${now.getDate()}`;
  } else if (now.getMonth() < 9 && now.getDate() >= 10) {
    now = `${now.getFullYear()}-0${now.getMonth() + 1}-${now.getDate()}`;
  } else if (now.getMonth >= 9 && now.getDate() < 10) {
    now = `${now.getFullYear()}-${now.getMonth() + 1}-0${now.getDate()}`;
  } else {
    now = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  }

  for (const i in reward_data.data) {
    reward_db_row = new rewardModel();
    reward_db_row.reward_id = reward_data.data[i].id;
    reward_db_row.project_id = project_info._id;

    if (project_info.site_type === 'KS') {
      reward_db_row.name = reward_data.data[i].name;
      reward_db_row.price = reward_data.data[i].amount.amount;
      reward_db_row.remain_stock = reward_data.data[i].remainingQuantity;
      reward_db_row.total_stock = reward_data.data[i].limit;

      if (reward_data.data[i].endsAt === null) {
        reward_db_row.is_ended = false;
      } else {
        reward_db_row.is_ended = true;
      }
    } else {
      reward_db_row.name = reward_data.data[i].label;
      reward_db_row.price = reward_data.data[i].amount;
      reward_db_row.remain_stock = reward_data.data[i].number_available - reward_data.data[i].number_claimed;
      reward_db_row.total_stock = reward_data.data[i].number_available;

      if (now > reward_data.data[i].estimated_delivery_date.split('T')[0]) {
        reward_db_row.is_ended = true;
      } else {
        reward_db_row.is_ended = false;
      }
    }

    reward_db_row.top_up_increment = 0;
    reward_db_row.minimum_stock = 0;
    reward_db_row.maximum_sales = 0;

    await reward_db_row.save(async (err, doc) => {
      if (!err) {
        if (i === reward_data.data.length - 1) {
          await getProjectData(req, res);
        }
      } else {
        res.render('projects', { data: {}, title: 'Project Detail', error: `Error duing saving reward data with project id : ${err}` });
      }
    });
  }
}

exports.updateProjectData = async function (req, res, next) {
  if (req.body.project_id) {
    const update_data = {};

    update_data.site_type = req.body.site_type;
    update_data.url = req.body.url;
    update_data.email = req.body.email;
    update_data.password = req.body.password;
    update_data.run_option = parseInt(req.body.run_option, 10);

    if (req.body.is_active === 'on') {
      update_data.is_active = 1;
    } else {
      update_data.is_active = 0;
    }

    await projectModel.findOneAndUpdate({ _id: req.body.project_id }, update_data, { new: true }, async (err, doc) => {
      if (!err) {
        await getProjectData(req, res, next);
      } else {
        res.render('projects', { data: {}, title: 'Project Detail', error: `Error during update the project data : ${err}` });
      }
    });
  } else if (req.body.site_type && req.body.url && req.body.run_option) {
    project_data = new projectModel();

    project_data.site_type = req.body.site_type;
    project_data.url = req.body.url;
    project_data.email = req.body.email;
    project_data.password = req.body.password;
    project_data.run_option = parseInt(req.body.run_option, 10);

    if (req.body.is_active === 'on') {
      project_data.is_active = 1;
    } else {
      project_data.is_active = 0;
    }

    await project_data.save(async (err, doc) => {
      if (!err) {
        await saveRewardDataByProjectId(req, res, doc);
      } else {
        res.render('projects', { data: {}, title: 'Project Detail', error: `Error during save a new project data : ${err}` });
      }
    });
  } else {
    res.render('projects', { data: {}, title: 'Project Detail', error: 'Please add all the required data!' });
  }
};

exports.getProjectDataById = async function (req, res, next) {
  if (req.query.project_id) {
    await projectModel.find({ _id: req.query.project_id }, (err, docs) => {
      if (!err) {
        const result = docs[0];

        if (result.is_active) {
          result.is_active = 'checked';
        } else {
          result.is_active = '';
        }

        res.render('projects', { data: result, title: 'Project Detail', error: '' });
      } else {
        res.render('projects', { data: {}, title: 'Project Detail', error: `Error during get project data by id :${err}` });
      }
    });
  } else {
    res.render('projects', { data: {}, title: 'Project Detail', error: '' });
  }
};

exports.getRewardData = async function (req, res, next) {
  let change_log = {};

  await rewardChangeLogModel.find({ project_id: req.query.project_id }, (err, docs) => {
    if (!err) {
      change_log = docs;
    } else {
      res.render('rewards', {
        data: {}, title: 'Rewards', project_id: req.query.project_id, logs: change_log, error: `Error in getting change log with project id : ${err}`,
      });
    }
  });

  await rewardModel.find({ project_id: req.query.project_id }, (err, docs) => {
    if (!err) {
      res.render('rewards', {
        data: docs, title: 'Rewards', project_id: req.query.project_id, logs: change_log, error: '',
      });
    } else {
      res.render('rewards', {
        data: {},
        title: 'Rewards',
        project_id: req.query.project_id,
        logs: change_log,
        error: `Error in retrieving rewards list with project id : ${err}`,
      });
    }
  });
};

exports.getEditRewardData = async function (req, res, next) {
  await rewardModel.find({ reward_id: req.query.reward_id }, (err, docs) => {
    if (!err) {
      const result = {};

      result.top_up_increment = docs[0].top_up_increment === 0 ? '' : docs[0].top_up_increment;
      result.minimum_stock = docs[0].minimum_stock === 0 ? '' : docs[0].minimum_stock;
      result.maximum_sales = docs[0].maximum_sales === 0 ? '' : docs[0].maximum_sales;

      res.render('editrewards', {
        title: 'Edit Rewards',
        reward_id: req.query.reward_id,
        project_id: req.query.project_id,
        data: result,
        error: '',
      });
    } else {
      res.render('editrewards', {
        data: {},
        title: 'Edit Rewards',
        reward_id: req.query.reward_id,
        project_id: req.query.project_id,
        error: `Error during get reward data by id: ${err}`,
      });
    }
  });
};

exports.updateRewardDataById = async function (req, res, next) {
  const { reward_id } = req.body;
  let result = {};

  await rewardModel.find({ reward_id }, (err, doc) => {
    if (!err) {
      const { project_id } = doc[0];
      let change_log = {};
      result = doc[0];

      rewardChangeLogModel.find({ project_id }, (err, docs) => {
        if (!err) {
          change_log = docs;
        } else {
          res.render('rewards', {
            data: docs,
            title: 'Rewards',
            project_id,
            logs: change_log,
            error: `Error during getting change log data when update reward data : ${err}`,
          });
        }
      });

      if (doc[0].top_up_increment !== req.body.top_up_increment
        || doc[0].minimum_stock !== req.body.minimum_stock
        || doc[0].maximum_sales !== req.body.maximum_sale) {
        result.top_up_increment = Number.isNaN(parseInt(req.body.top_up_increment, 10)) ? 0 : parseInt(req.body.top_up_increment, 10);
        result.minimum_stock = Number.isNaN(parseInt(req.body.minimum_stock, 10)) ? 0 : parseInt(req.body.minimum_stock, 10);
        result.maximum_sales = Number.isNaN(parseInt(req.body.maximum_sale, 10)) ? 0 : parseInt(req.body.maximum_sale, 10);

        rewardModel.findOneAndUpdate({ reward_id }, result, { new: true }, (err, doc) => {
          if (!err) {
            rewardModel.find({ project_id }, (error, docs) => {
              if (!error) {
                res.render('rewards', {
                  data: docs, title: 'Rewards', project_id, logs: change_log, error: '',
                });
              } else {
                res.render('editrewards', {
                  data: {}, title: 'Edit Rewards', reward_id, project_id, error: `Error during getting reward data after update : ${error}`,
                });
              }
            });
          } else {
            res.render('editrewards', {
              data: {}, title: 'Edit Rewards', reward_id, project_id, error: `Error during updating reward data by id : ${err}`,
            });
          }
        });
      } else {
        rewardModel.find({ project_id }, (err, docs) => {
          if (!err) {
            res.render('rewards', {
              data: docs, title: 'Rewards', project_id, logs: change_log, error: '',
            });
          } else {
            res.render('editrewards', {
              data: {}, title: 'Edit Rewards', reward_id, project_id, error: `Error during getting reward data when no change : ${err}`,
            });
          }
        });
      }
    } else {
      res.render('editrewards', {
        data: {}, title: 'Edit Rewards', reward_id, project_id: req.query.project_id, error: `Error during finding reward data by id : ${err}`,
      });
    }
  });
};
