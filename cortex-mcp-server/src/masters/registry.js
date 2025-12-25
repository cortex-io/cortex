/**
 * Master Agent Registry
 *
 * Discovers and tracks master agent capabilities via manifests
 */

const fs = require('fs').promises;
const path = require('path');

const CORTEX_HOME = process.env.CORTEX_HOME || '/Users/ryandahlberg/Projects/cortex';
const MANIFESTS_DIR = path.join(CORTEX_HOME, 'mcp-server/manifests');
const MASTERS_DIR = path.join(CORTEX_HOME, 'coordination/masters');

class MasterRegistry {
  constructor() {
    this.masters = new Map();
  }

  /**
   * Load all master manifests
   */
  async loadManifests() {
    try {
      const indexPath = path.join(MANIFESTS_DIR, 'index.json');
      const indexData = await fs.readFile(indexPath, 'utf8');
      const index = JSON.parse(indexData);

      console.log(`[Master Registry] Loading ${index.masters.length} master manifests`);

      for (const masterRef of index.masters) {
        try {
          const manifestPath = path.join(MANIFESTS_DIR, masterRef.manifest_file);
          const manifestData = await fs.readFile(manifestPath, 'utf8');
          const manifest = JSON.parse(manifestData);

          this.masters.set(masterRef.master_id, {
            ...manifest,
            manifest_file: masterRef.manifest_file,
            loaded_at: new Date().toISOString()
          });

          console.log(`[Master Registry] Loaded: ${masterRef.master_id} (${manifest.capabilities.length} capabilities)`);
        } catch (error) {
          console.error(`[Master Registry] Failed to load ${masterRef.master_id}: ${error.message}`);
        }
      }

      return {
        loaded: this.masters.size,
        masters: Array.from(this.masters.keys())
      };
    } catch (error) {
      console.error(`[Master Registry] Failed to load manifests: ${error.message}`);
      return {
        loaded: 0,
        error: error.message
      };
    }
  }

  /**
   * Get master by ID
   */
  getMaster(masterId) {
    return this.masters.get(masterId);
  }

  /**
   * Get all masters
   */
  getAllMasters() {
    return Array.from(this.masters.values());
  }

  /**
   * Find masters by capability
   */
  findMastersByCapability(capability) {
    const matches = [];

    for (const [masterId, master] of this.masters.entries()) {
      const hasCapability = master.capabilities.some(cap =>
        cap.name === capability || cap.category === capability
      );

      if (hasCapability) {
        matches.push({
          master_id: masterId,
          master_name: master.master_name,
          capabilities: master.capabilities.filter(cap =>
            cap.name === capability || cap.category === capability
          )
        });
      }
    }

    return matches;
  }

  /**
   * Find best master for a task description
   */
  findBestMaster(taskDescription) {
    const lowerTask = taskDescription.toLowerCase();
    const scores = [];

    for (const [masterId, master] of this.masters.entries()) {
      let score = 0;
      const matchedCapabilities = [];

      // Score based on domain match
      if (lowerTask.includes(master.domain.toLowerCase())) {
        score += 50;
      }

      // Score based on capability keywords
      for (const cap of master.capabilities) {
        if (lowerTask.includes(cap.name.toLowerCase())) {
          score += 30;
          matchedCapabilities.push(cap.name);
        }

        if (cap.keywords) {
          for (const keyword of cap.keywords) {
            if (lowerTask.includes(keyword.toLowerCase())) {
              score += 10;
              matchedCapabilities.push(`keyword: ${keyword}`);
            }
          }
        }
      }

      if (score > 0) {
        scores.push({
          master_id: masterId,
          master_name: master.master_name,
          domain: master.domain,
          score,
          confidence: Math.min(score / 100, 1.0),
          matched_capabilities: matchedCapabilities
        });
      }
    }

    // Sort by score
    scores.sort((a, b) => b.score - a.score);

    if (scores.length === 0) {
      return {
        master_id: 'coordinator',
        master_name: 'Coordinator Master',
        confidence: 0.5,
        reason: 'No strong match, defaulting to coordinator'
      };
    }

    const best = scores[0];
    return {
      ...best,
      reason: `Matched: ${best.matched_capabilities.join(', ')}`,
      all_matches: scores
    };
  }

  /**
   * Get master state
   */
  async getMasterState(masterId) {
    try {
      const statePath = path.join(MASTERS_DIR, masterId, 'context/master-state.json');
      const stateData = await fs.readFile(statePath, 'utf8');
      return JSON.parse(stateData);
    } catch (error) {
      return {
        error: true,
        message: `Failed to read master state: ${error.message}`,
        master_id: masterId
      };
    }
  }

  /**
   * Get registry statistics
   */
  getStats() {
    const totalCapabilities = Array.from(this.masters.values())
      .reduce((sum, master) => sum + master.capabilities.length, 0);

    const domainCounts = {};
    for (const master of this.masters.values()) {
      domainCounts[master.domain] = (domainCounts[master.domain] || 0) + 1;
    }

    return {
      total_masters: this.masters.size,
      total_capabilities: totalCapabilities,
      domains: domainCounts,
      master_list: Array.from(this.masters.keys())
    };
  }
}

module.exports = MasterRegistry;
