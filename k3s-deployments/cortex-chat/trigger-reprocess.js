/**
 * Trigger reprocessing of YouTube video with corrected code
 */

const VIDEO_ID = '-Tz_FWVYgnM';
const SESSION_ID = 'conv_1767139397437_7krcxws';

async function reprocessVideo() {
  console.log('Starting video reprocessing...');

  // Fetch the video knowledge from ingestion service
  const knowledgeResponse = await fetch(
    `http://youtube-ingestion.cortex.svc.cluster.local:8080/knowledge/${VIDEO_ID}`
  );

  if (!knowledgeResponse.ok) {
    throw new Error(`Failed to fetch knowledge: ${knowledgeResponse.status}`);
  }

  const videoData = await knowledgeResponse.json();
  console.log('Fetched video knowledge:', videoData.title);

  // Extract actionable items
  const actionables = videoData.actionable_items || [];
  console.log(`Found ${actionables.length} actionable items`);

  // Generate improvements using corrected logic
  const improvements = actionables.slice(0, 5).map((item, idx) => {
    const description = typeof item === 'object' ? item.description : item;
    const implementationNotes = typeof item === 'object' ? item.implementation_notes : `Implement: ${item}`;
    const type = typeof item === 'object' ? item.type : 'improvement';

    return {
      id: `imp_${Date.now()}_${idx}`,
      title: description,
      description: implementationNotes,
      type,
      priority: idx < 2 ? 'high' : 'medium'
    };
  });

  console.log('Generated improvements:');
  improvements.forEach((imp, idx) => {
    console.log(`  ${idx + 1}. [${imp.priority.toUpperCase()}] ${imp.title}`);
  });

  // Format the analysis summary
  const relevance = videoData.relevance_to_cortex || 0.9;
  const relevanceBar = '▓'.repeat(Math.floor(relevance * 10)) + '░'.repeat(10 - Math.floor(relevance * 10));

  let message = `**Video Analysis Complete** ✅ *(Corrected)*

**Summary:**
- Title: ${videoData.title}
- Relevance to Cortex: [${relevanceBar}] ${Math.floor(relevance * 100)}%
- ${videoData.summary}

**Recommended Improvements:**
`;

  improvements.forEach((imp, idx) => {
    const priorityLabel = imp.priority === 'high' ? '[HIGH]' : imp.priority === 'medium' ? '[MED]' : '[LOW]';
    message += `${idx + 1}. ${priorityLabel} **${imp.title}**\n   ${imp.description}\n\n`;
  });

  message += `**Would you like me to implement these improvements?**

Reply with:
- **"yes"** to implement all improvements
- **"details"** to see more information
- **"no"** to skip implementation`;

  // Post to conversation via backend API
  const backendResponse = await fetch(
    'http://cortex-chat-backend-simple.cortex-chat.svc.cluster.local:8080/api/conversations/' + SESSION_ID + '/messages',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        role: 'assistant',
        content: message,
        metadata: {
          type: 'youtube_analysis',
          videoId: VIDEO_ID,
          analysis: {
            summary: videoData.summary,
            relevance,
            improvements
          },
          requiresApproval: true,
          corrected: true
        }
      })
    }
  );

  if (!backendResponse.ok) {
    throw new Error(`Failed to post message: ${backendResponse.status}`);
  }

  console.log('✅ Posted corrected analysis to conversation');
  console.log('\nFull message:');
  console.log(message);
}

reprocessVideo().catch(error => {
  console.error('Reprocessing failed:', error);
  process.exit(1);
});
