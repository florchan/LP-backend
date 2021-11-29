/* eslint-disable guard-for-in */
/* eslint-disable no-restricted-syntax */
const axios = require('axios');
const { By, until } = require('selenium-webdriver');
const { exec } = require('child_process');
const getDrivers = require('./getWebDrivers');
const logger = require('./logger');

const driversForKickstarter = [];
const driversForIndiegogo = [];

async function sh(cmd) {
  return new Promise(((resolve, reject) => {
    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        if (cmd === 'sudo reboot') resolve(1);
        reject(err);
      } else {
        resolve({ stdout, stderr });
      }
    });
  }));
}

async function updatekickstarterRewardData({
  project_id: prj_id, url, email, password, total_stock, current,
}, type) {
  try {
    if (!driversForKickstarter[prj_id]) {
      driversForKickstarter[prj_id] = await getDrivers.getKickstarterDriver(url, email, password, type);
    }
    const data = await driversForKickstarter[prj_id].wait(until.elementLocated(By.xpath("//meta[@name='csrf-token']")), 50000).then(async () => {
      const csrf_token = await driversForKickstarter[prj_id].findElement(By.xpath("//meta[@name='csrf-token']")).getAttribute('content');
      const cookie_info = await driversForKickstarter[prj_id].manage().getCookies();

      let ksr_session;

      for (const m in cookie_info) {
        if (cookie_info[m].name === '_ksr_session') {
          ksr_session = `_ksr_session=${cookie_info[m].value}`;
        }
      }

      try {
        const response = await axios({
          url: 'https://www.kickstarter.com/graph',
          method: 'post',
          headers: {
            cookie: ksr_session,
            'x-csrf-token': csrf_token,
          },
          data: {
            query: `
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
                id: current.id,
                limit: total_stock,
                description: current.description,
              },
            },
          },
        });
        if (!response.data.data.updateReward) {
          logger.error(`Error while updating rewards: ${JSON.stringify(response.data)}
          Instance ID: ${(await sh('wget -q -O - http://169.254.169.254/latest/meta-data/instance-id')).stdout}
          Instance will be rebooted`);
          await sh('sudo reboot');
        }
        return response.data.data.updateReward;
      } catch (err) {
        logger.error(`Error with session/selenium (IG): ${JSON.stringify(err)}
        Instance ID: ${(await sh('wget -q -O - http://169.254.169.254/latest/meta-data/instance-id')).stdout}
        Instance will be rebooted`);
        await sh('sudo reboot');
      }
    });
    return data;
  } catch (err) {
    logger.error(`Error with session/selenium (KS): ${JSON.stringify(err)}
    Instance ID: ${(await sh('wget -q -O - http://169.254.169.254/latest/meta-data/instance-id')).stdout}
    Instance will be rebooted`);
    await sh('sudo reboot');
  }
}

async function updateIndiegogoRewardData({
  project_id: prj_id, url, email, password, total_stock, current,
}, type) {
  try {
    if (!driversForIndiegogo[prj_id]) {
      driversForIndiegogo[prj_id] = await getDrivers.getIndiegogoDriver(url, email, password, type);
    }
    await new Promise((res) => {
      setTimeout(() => {
        res(1);
      }, 5000);
    });
    const data = await driversForIndiegogo[prj_id].wait(until.elementLocated(By.xpath("//meta[@name='csrf-token']")), 50000).then(async () => {
      const project_id = await driversForIndiegogo[prj_id].findElement(By.xpath("//meta[@name='sailthru.project_id']")).getAttribute('content');
      const csrf_token = await driversForIndiegogo[prj_id].findElement(By.xpath("//meta[@name='csrf-token']")).getAttribute('content');
      const cookie_info = await driversForIndiegogo[prj_id].manage().getCookies();
      let cookie = '';
      for (const m in cookie_info) {
        cookie += `${cookie_info[m].name}=${cookie_info[m].value}; `;
      }
      let response;
      try {
        response = await axios({
          url: `https://www.indiegogo.com/private_api/campaign_editor/${project_id}/perks/${current.id}`,
          method: 'put',
          headers: {
            cookie,
            'x-csrf-token': csrf_token,
          },
          data: {
            perk: {
              amount: current.amount,
              description: current.description,
              estimated_delivery_date: current.estimated_delivery_date,
              label: current.label,
              number_available: total_stock,
              perk_image_public_id: current.perk_image_public_id,
              perk_item_links: current.perk_item_links,
              perk_type: current.perk_type,
              retail_amount: current.retail_amount,
              secret_perk_token: current.secret_perk_token,
              shipping_address_required: current.shipping_address_required,
              shipping_fees: current.shipping_fees,
              status: current.status,
            },
          },
        });
      } catch (err) {
        logger.error(`Error with session/selenium (IG): ${JSON.stringify(err)}
        Instance ID: ${(await sh('wget -q -O - http://169.254.169.254/latest/meta-data/instance-id')).stdout}
        Instance will be rebooted`);
        await sh('sudo reboot');
      }
      return response.data.response;
    });
    return data;
  } catch (err) {
    logger.error(`Error with session/selenium (IG): ${JSON.stringify(err)}
    Instance ID: ${(await sh('wget -q -O - http://169.254.169.254/latest/meta-data/instance-id')).stdout}
    Instance will be rebooted`);
    await sh('sudo reboot');
  }
}

module.exports = {
  updatekickstarterRewardData,
  updateIndiegogoRewardData,
};
