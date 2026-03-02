/**
 * Example Usage - YouTube Ingestion Service
 * Demonstrates various ways to interact with the service
 */

import axios from 'axios';

const SERVICE_URL = process.env.YOUTUBE_SERVICE_URL || 'http://localhost:8080';

// Example 1: Ingest a single video
async function example1_ingestVideo() {
  console.log('\n=== Example 1: Ingest a Video ===\n');

  const videoUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

  try {
    const response = await axios.post(`${SERVICE_URL}/ingest`, {
      url: videoUrl
    });

    const { knowledge } = response.data;

    console.log('✓ Video ingested successfully!');
    console.log(`  Title: ${knowledge.title}`);
    console.log(`  Category: ${knowledge.category}`);
    console.log(`  Relevance: ${(knowledge.relevance_to_cortex * 100).toFixed(0)}%`);
    console.log(`  Summary: ${knowledge.summary}`);
    console.log(`  Key Concepts: ${knowledge.key_concepts.join(', ')}`);
    console.log(`  Tools Mentioned: ${knowledge.tools_mentioned.join(', ')}`);
  } catch (error) {
    console.error('✗ Ingestion failed:', error.response?.data?.error || error.message);
  }
}

// Example 2: Process a message with URL detection
async function example2_processMessage() {
  console.log('\n=== Example 2: Process Message (Auto-Detect URLs) ===\n');

  const message = `
    Hey, check out these awesome videos:
    - https://www.youtube.com/watch?v=dQw4w9WgXcQ
    - https://youtu.be/abc123def45

    They have great content on infrastructure automation!
  `;

  try {
    const response = await axios.post(`${SERVICE_URL}/process`, {
      message
    });

    const { detected, count, videos } = response.data;

    if (detected) {
      console.log(`✓ Detected ${count} YouTube URL(s)`);

      for (const video of videos) {
        console.log(`\n  Video ID: ${video.videoId}`);
        console.log(`  Status: ${video.status}`);

        if (video.status === 'ingested') {
          console.log(`  Title: ${video.knowledge.title}`);
          console.log(`  Category: ${video.knowledge.category}`);
        } else if (video.status === 'already_exists') {
          console.log(`  (Already in knowledge base)`);
        } else if (video.status === 'failed') {
          console.log(`  Error: ${video.error}`);
        }
      }
    } else {
      console.log('✓ No YouTube URLs detected');
    }
  } catch (error) {
    console.error('✗ Processing failed:', error.response?.data?.error || error.message);
  }
}

// Example 3: Search the knowledge base
async function example3_searchKnowledge() {
  console.log('\n=== Example 3: Search Knowledge Base ===\n');

  // Search for high-relevance tutorials
  const query = {
    category: 'tutorial',
    minRelevance: 0.7,
    limit: 5
  };

  try {
    const response = await axios.post(`${SERVICE_URL}/search`, query);

    const { count, results } = response.data;

    console.log(`✓ Found ${count} matching videos:\n`);

    for (const video of results) {
      console.log(`  • ${video.title}`);
      console.log(`    Category: ${video.category}`);
      console.log(`    Relevance: ${(video.relevance_to_cortex * 100).toFixed(0)}%`);
      console.log(`    Summary: ${video.summary}`);
      console.log(`    URL: ${video.url}\n`);
    }
  } catch (error) {
    console.error('✗ Search failed:', error.response?.data?.error || error.message);
  }
}

// Example 4: Get statistics
async function example4_getStats() {
  console.log('\n=== Example 4: Get Statistics ===\n');

  try {
    const response = await axios.get(`${SERVICE_URL}/stats`);

    const stats = response.data;

    console.log('✓ Knowledge Base Statistics:');
    console.log(`  Total Videos: ${stats.total}`);
    console.log(`  Average Relevance: ${(stats.avg_relevance * 100).toFixed(0)}%`);
    console.log(`  Recent (7 days): ${stats.recent_count}`);
    console.log('\n  By Category:');

    for (const [category, count] of Object.entries(stats.by_category || {})) {
      console.log(`    ${category}: ${count}`);
    }
  } catch (error) {
    console.error('✗ Failed to get stats:', error.response?.data?.error || error.message);
  }
}

// Example 5: Get a specific video
async function example5_getVideo() {
  console.log('\n=== Example 5: Get Specific Video ===\n');

  const videoId = 'dQw4w9WgXcQ';

  try {
    const response = await axios.get(`${SERVICE_URL}/video/${videoId}`);

    const video = response.data;

    console.log('✓ Video Details:');
    console.log(`  Title: ${video.title}`);
    console.log(`  Channel: ${video.channel_name}`);
    console.log(`  Category: ${video.category}`);
    console.log(`  Relevance: ${(video.relevance_to_cortex * 100).toFixed(0)}%`);
    console.log(`  Summary: ${video.summary}`);
    console.log('\n  Key Concepts:');
    video.key_concepts.forEach(concept => console.log(`    - ${concept}`));
    console.log('\n  Actionable Items:');
    video.actionable_items.forEach(item => {
      console.log(`    - [${item.type}] ${item.description}`);
    });
    console.log('\n  Tools Mentioned:');
    video.tools_mentioned.forEach(tool => console.log(`    - ${tool}`));
    console.log(`\n  Transcript Word Count: ${video.transcript.word_count}`);
    console.log(`  Ingested At: ${video.ingested_at}`);
  } catch (error) {
    if (error.response?.status === 404) {
      console.log('✗ Video not found in knowledge base');
    } else {
      console.error('✗ Failed to get video:', error.response?.data?.error || error.message);
    }
  }
}

// Example 6: List all videos
async function example6_listVideos() {
  console.log('\n=== Example 6: List Recent Videos ===\n');

  try {
    const response = await axios.get(`${SERVICE_URL}/videos?limit=10`);

    const { count, videos } = response.data;

    console.log(`✓ Listing ${count} most recent videos:\n`);

    for (const video of videos) {
      console.log(`  • ${video.title}`);
      console.log(`    ${video.category} | Relevance: ${(video.relevance_to_cortex * 100).toFixed(0)}%`);
      console.log(`    Ingested: ${new Date(video.ingested_at).toLocaleDateString()}\n`);
    }
  } catch (error) {
    console.error('✗ Failed to list videos:', error.response?.data?.error || error.message);
  }
}

// Example 7: Get improvement proposals
async function example7_getImprovements() {
  console.log('\n=== Example 7: Get Improvement Proposals ===\n');

  try {
    const response = await axios.get(`${SERVICE_URL}/improvements`);

    const { count, improvements } = response.data;

    if (count === 0) {
      console.log('✓ No pending improvement proposals');
      return;
    }

    console.log(`✓ Found ${count} improvement proposals:\n`);

    for (const improvement of improvements.slice(0, 3)) {
      console.log(`  From: ${improvement.title}`);
      console.log(`  Video Relevance: ${(improvement.relevance * 100).toFixed(0)}%`);

      if (improvement.improvements.passive.length > 0) {
        console.log(`  Passive Improvements (${improvement.improvements.passive.length}):`);
        improvement.improvements.passive.slice(0, 2).forEach(item => {
          console.log(`    - [${item.category}] ${item.description}`);
        });
      }

      if (improvement.improvements.active.length > 0) {
        console.log(`  Active Improvements (${improvement.improvements.active.length}):`);
        improvement.improvements.active.slice(0, 2).forEach(item => {
          console.log(`    - [${item.category}] ${item.description}`);
        });
      }

      console.log();
    }
  } catch (error) {
    console.error('✗ Failed to get improvements:', error.response?.data?.error || error.message);
  }
}

// Example 8: Perform meta-review
async function example8_metaReview() {
  console.log('\n=== Example 8: Perform Meta-Review ===\n');
  console.log('Note: This may take 30-60 seconds...\n');

  try {
    const response = await axios.post(`${SERVICE_URL}/meta-review`, {
      lookbackDays: 30,
      minVideos: 3
    });

    const review = response.data;

    if (review.status === 'insufficient_data') {
      console.log(`✗ Insufficient data for meta-review`);
      console.log(`  Need at least ${review.min_required} videos (found ${review.videos_analyzed})`);
      return;
    }

    console.log('✓ Meta-Review Complete:');
    console.log(`  Videos Analyzed: ${review.videos_analyzed}`);
    console.log(`  Period: ${review.period_days} days`);

    console.log('\n  Top Recurring Tools:');
    review.analysis.recurring_tools.slice(0, 5).forEach(({ item, count }) => {
      console.log(`    - ${item}: ${count} mentions`);
    });

    console.log('\n  Top Recurring Concepts:');
    review.analysis.recurring_concepts.slice(0, 5).forEach(({ item, count }) => {
      console.log(`    - ${item}: ${count} mentions`);
    });

    if (review.analysis.insights) {
      console.log('\n  AI Insights:');

      if (review.analysis.insights.recurring_themes) {
        console.log('\n    Recurring Themes:');
        review.analysis.insights.recurring_themes.forEach(theme => {
          console.log(`      - ${theme.theme} (${theme.priority} priority)`);
        });
      }

      if (review.analysis.insights.recommended_integrations) {
        console.log('\n    Recommended Integrations:');
        review.analysis.insights.recommended_integrations.slice(0, 3).forEach(rec => {
          console.log(`      - ${rec.tool} (${rec.priority} priority)`);
          console.log(`        ${rec.reason}`);
        });
      }

      if (review.analysis.insights.next_actions) {
        console.log('\n    Next Actions:');
        review.analysis.insights.next_actions.forEach(action => {
          console.log(`      ${action.priority}. ${action.action}`);
        });
      }
    }
  } catch (error) {
    console.error('✗ Meta-review failed:', error.response?.data?.error || error.message);
  }
}

// Example 9: Health check
async function example9_healthCheck() {
  console.log('\n=== Example 9: Health Check ===\n');

  try {
    const response = await axios.get(`${SERVICE_URL}/health`);

    const health = response.data;

    console.log('✓ Service Health:');
    console.log(`  Status: ${health.status}`);
    console.log(`  Service: ${health.service}`);
    console.log(`  Redis Connected: ${health.redis_connected ? 'Yes' : 'No'}`);
  } catch (error) {
    console.error('✗ Health check failed:', error.message);
  }
}

// Run all examples
async function runAllExamples() {
  console.log('==============================================');
  console.log('  YouTube Ingestion Service - Example Usage');
  console.log('==============================================');
  console.log(`\nService URL: ${SERVICE_URL}\n`);

  await example9_healthCheck();
  await example4_getStats();
  await example6_listVideos();

  // Uncomment to test ingestion (may take time)
  // await example1_ingestVideo();
  // await example2_processMessage();

  await example5_getVideo();
  await example3_searchKnowledge();
  await example7_getImprovements();

  // Uncomment to test meta-review (may take time and requires data)
  // await example8_metaReview();

  console.log('\n==============================================');
  console.log('  Examples Complete!');
  console.log('==============================================\n');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export {
  example1_ingestVideo,
  example2_processMessage,
  example3_searchKnowledge,
  example4_getStats,
  example5_getVideo,
  example6_listVideos,
  example7_getImprovements,
  example8_metaReview,
  example9_healthCheck
};
