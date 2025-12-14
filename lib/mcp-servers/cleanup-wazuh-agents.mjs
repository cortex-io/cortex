import axios from 'axios';
import https from 'https';

const WAZUH_URL = 'https://10.88.140.202:55000';
const WAZUH_USER = 'admin';
const WAZUH_PASS = '*B96Y7a0t8Ep9cw+z0RSevdRHwLnsiay';

async function main() {
  try {
    console.log('=== Wazuh Agent Cleanup ===\n');

    // Authenticate
    console.log('→ Authenticating with Wazuh...');
    const authResponse = await axios.post(
      `${WAZUH_URL}/security/user/authenticate`,
      {},
      {
        auth: { username: WAZUH_USER, password: WAZUH_PASS },
        httpsAgent: new https.Agent({ rejectUnauthorized: false })
      }
    );

    const token = authResponse.data.data.token;
    console.log('✓ Authenticated\n');

    // Get disconnected agents
    console.log('→ Finding disconnected agents...');
    const disconnectedResponse = await axios.get(
      `${WAZUH_URL}/agents?status=disconnected`,
      {
        headers: { 'Authorization': `Bearer ${token}` },
        httpsAgent: new https.Agent({ rejectUnauthorized: false })
      }
    );

    const disconnected = disconnectedResponse.data.data.affected_items || [];

    if (disconnected.length === 0) {
      console.log('No disconnected agents found');
      process.exit(0);
    }

    console.log(`Found ${disconnected.length} disconnected agents:`);
    disconnected.forEach(agent => {
      const ip = agent.ip || 'N/A';
      const lastSeen = agent.lastKeepAlive || 'Never';
      console.log(`  - ID: ${agent.id} | Name: ${agent.name} | IP: ${ip} | Last seen: ${lastSeen}`);
    });
    console.log('');

    // Delete disconnected agents
    const agentIds = disconnected.map(a => a.id).join(',');
    console.log(`→ Removing disconnected agents (IDs: ${agentIds})...`);

    const deleteResponse = await axios.delete(
      `${WAZUH_URL}/agents?agents_list=${agentIds}&status=all&older_than=0s`,
      {
        headers: { 'Authorization': `Bearer ${token}` },
        httpsAgent: new https.Agent({ rejectUnauthorized: false })
      }
    );

    const deletedCount = deleteResponse.data.data.total_affected_items || 0;
    console.log(`✓ Deleted ${deletedCount} disconnected agents\n`);

    // Show remaining active agents
    console.log('→ Remaining active agents:');
    const activeResponse = await axios.get(
      `${WAZUH_URL}/agents?status=active`,
      {
        headers: { 'Authorization': `Bearer ${token}` },
        httpsAgent: new https.Agent({ rejectUnauthorized: false })
      }
    );

    const active = activeResponse.data.data.affected_items || [];
    if (active.length === 0) {
      console.log('  No active agents');
    } else {
      active.forEach(agent => {
        console.log(`  ✓ ID: ${agent.id} | Name: ${agent.name} | IP: ${agent.ip} | Status: ${agent.status}`);
      });
    }

    console.log('\n=== Cleanup Complete ===');

  } catch (error) {
    console.error('Error:', error.response?.data?.detail || error.message);
    console.error('Full error:', error.response?.data || error);
    process.exit(1);
  }
}

main();
