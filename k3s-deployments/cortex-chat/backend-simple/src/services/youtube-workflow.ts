/**
 * YouTube Video Processing Workflow
 * Handles the complete lifecycle of YouTube video analysis and implementation
 */

import { conversationStorage } from './conversation-storage';
import { detectYouTubeURLs, ingestYouTubeVideos } from './youtube-detector';
import { runErrorDetectionAndRecovery, notifyUserOfError } from './error-recovery';

const YOUTUBE_INGESTION_URL = process.env.YOUTUBE_INGESTION_URL || 'http://youtube-ingestion.cortex.svc.cluster.local:8080';
const CORTEX_URL = process.env.CORTEX_URL || 'http://cortex-orchestrator.cortex.svc.cluster.local:8000';

export interface VideoProcessingStatus {
  videoId: string;
  url: string;
  title?: string;
  status: 'detected' | 'processing' | 'analyzing' | 'ready_for_approval' | 'implementing' | 'completed' | 'failed';
  progress?: string;
  segmentsExtracted?: number;
  analysisResults?: {
    summary: string;
    relevance: number;
    improvements: Array<{
      id: string;
      title: string;
      description: string;
      priority: 'high' | 'medium' | 'low';
    }>;
  };
  error?: string;
}

/**
 * Start processing YouTube video and track status
 */
export async function startVideoProcessing(
  sessionId: string,
  videoUrl: string,
  videoId: string
): Promise<void> {
  console.log(`[YouTubeWorkflow] Starting video processing for ${videoId}`);

  // Update conversation status to in_progress
  await conversationStorage.updateConversationStatus(sessionId, 'in_progress');

  // Post initial status message to conversation
  await conversationStorage.addMessage(sessionId, {
    role: 'assistant',
    content: formatInitialStatus(videoUrl, videoId),
    timestamp: new Date().toISOString()
  });

  // Start background processing
  processVideoInBackground(sessionId, videoUrl, videoId).catch(error => {
    console.error(`[YouTubeWorkflow] Background processing failed:`, error);
  });
}

/**
 * Background video processing workflow
 */
async function processVideoInBackground(
  sessionId: string,
  videoUrl: string,
  videoId: string
): Promise<void> {
  try {
    // Step 1: Trigger ingestion and wait for completion
    console.log(`[YouTubeWorkflow] Step 1: Ingesting video ${videoId}`);
    const ingestionResult = await ingestYouTubeVideos(`Video URL: ${videoUrl}`);

    if (!ingestionResult.success || ingestionResult.videos.length === 0) {
      throw new Error(ingestionResult.error || 'Ingestion failed');
    }

    const videoData = ingestionResult.videos[0];

    if (videoData.status === 'failed') {
      throw new Error(videoData.error || 'Video processing failed');
    }

    // Step 2: Extract analysis results from ingested knowledge
    console.log(`[YouTubeWorkflow] Step 2: Analyzing video content`);
    const analysis = await analyzeVideoContent(videoData);

    // Step 3: Post analysis summary to conversation
    console.log(`[YouTubeWorkflow] Step 3: Posting analysis summary`);
    await conversationStorage.addMessage(sessionId, {
      role: 'assistant',
      content: formatAnalysisSummary(videoData, analysis),
      timestamp: new Date().toISOString(),
      metadata: {
        type: 'youtube_analysis',
        videoId,
        analysis,
        requiresApproval: true
      }
    });

    console.log(`[YouTubeWorkflow] Video ${videoId} ready for approval`);

    // Step 4: Run error detection and auto-recovery
    console.log(`[YouTubeWorkflow] Step 4: Running error detection`);
    const { errorsFound, errorsFixed, errors } = await runErrorDetectionAndRecovery(sessionId, 'youtube_ingestion');

    if (errorsFound > 0 && errorsFixed > 0) {
      console.log(`[YouTubeWorkflow] Detected ${errorsFound} error(s), attempting to fix ${errorsFixed}`);

      // Reprocess with fixed code
      console.log(`[YouTubeWorkflow] Reprocessing video analysis with corrections`);
      const reanalysis = await analyzeVideoContent(videoData);

      // Post corrected analysis
      await notifyUserOfError(sessionId, errors[0], 'completed');
      await conversationStorage.addMessage(sessionId, {
        role: 'assistant',
        content: formatAnalysisSummary(videoData, reanalysis),
        timestamp: new Date().toISOString(),
        metadata: {
          type: 'youtube_analysis',
          videoId,
          analysis: reanalysis,
          requiresApproval: true,
          corrected: true
        }
      });

      console.log(`[YouTubeWorkflow] Posted corrected analysis for ${videoId}`);
    }

  } catch (error: any) {
    console.error(`[YouTubeWorkflow] Processing failed:`, error);

    // Post error message
    await conversationStorage.addMessage(sessionId, {
      role: 'assistant',
      content: `ERROR: Video processing failed: ${error.message}`,
      timestamp: new Date().toISOString()
    });

    // Mark conversation as completed (with error)
    await conversationStorage.updateConversationStatus(sessionId, 'completed');
  }
}

/**
 * Analyze video content and extract actionable improvements
 */
async function analyzeVideoContent(videoData: any): Promise<any> {
  // Extract key information from ingested video
  const { title, summary, key_concepts, actionable_items, relevance_to_cortex, raw_transcript } = videoData.knowledge || {};

  // Use Claude to analyze and generate improvements
  const improvements = await generateImprovements(
    title,
    summary,
    key_concepts || [],
    actionable_items || [],
    raw_transcript
  );

  return {
    summary: summary || 'Video content analyzed',
    relevance: relevance_to_cortex || 0,
    improvements
  };
}

/**
 * Generate improvement recommendations using Claude
 */
async function generateImprovements(
  title: string,
  summary: string,
  concepts: string[],
  actionables: any[],
  transcript: string
): Promise<any[]> {
  // For now, create placeholder improvements from actionable items
  // TODO: Use Claude API to generate detailed improvement plans

  const improvements = actionables.slice(0, 5).map((item, idx) => {
    // Handle both object format (from ingestion service) and string format
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

  // If no actionables, create generic improvement
  if (improvements.length === 0 && title) {
    improvements.push({
      id: `imp_${Date.now()}_0`,
      title: `Apply learnings from: ${title}`,
      description: `Review and apply concepts from this video to Cortex architecture`,
      type: 'improvement',
      priority: 'medium'
    });
  }

  return improvements;
}

/**
 * Handle user approval for implementation
 */
export async function handleImplementationApproval(
  sessionId: string,
  videoId: string,
  approved: boolean
): Promise<void> {
  if (!approved) {
    console.log(`[YouTubeWorkflow] User declined implementation for ${videoId}`);

    await conversationStorage.addMessage(sessionId, {
      role: 'assistant',
      content: 'Got it - I won\'t implement these changes. The analysis is saved for future reference.',
      timestamp: new Date().toISOString()
    });

    await conversationStorage.updateConversationStatus(sessionId, 'completed');
    return;
  }

  console.log(`[YouTubeWorkflow] User approved implementation for ${videoId}`);

  // Update status message
  await conversationStorage.addMessage(sessionId, {
    role: 'assistant',
    content: 'Starting implementation... I\'ll work on this in the background and keep you updated.',
    timestamp: new Date().toISOString()
  });

  // Trigger Cortex implementation in background
  startImplementation(sessionId, videoId).catch(error => {
    console.error(`[YouTubeWorkflow] Implementation failed:`, error);
  });
}

/**
 * Start Cortex implementation tasks
 */
async function startImplementation(sessionId: string, videoId: string): Promise<void> {
  try {
    // Get the analysis from conversation metadata
    const messages = await conversationStorage.getMessages(sessionId);
    const analysisMessage = messages.find(m =>
      m.metadata?.type === 'youtube_analysis' &&
      m.metadata?.videoId === videoId
    );

    if (!analysisMessage || !analysisMessage.metadata?.analysis) {
      throw new Error('Analysis data not found');
    }

    const { improvements } = analysisMessage.metadata.analysis;

    // Create Cortex tasks for each improvement
    for (const improvement of improvements) {
      await createCortexTask(improvement);
    }

    // Post completion message
    await conversationStorage.addMessage(sessionId, {
      role: 'assistant',
      content: `Implementation started! Created ${improvements.length} task(s) in Cortex queue.\n\nI'll work on these automatically and report back when complete.`,
      timestamp: new Date().toISOString()
    });

    // Mark conversation as completed
    await conversationStorage.updateConversationStatus(sessionId, 'completed');

  } catch (error: any) {
    console.error(`[YouTubeWorkflow] Implementation startup failed:`, error);

    await conversationStorage.addMessage(sessionId, {
      role: 'assistant',
      content: `ERROR: Failed to start implementation: ${error.message}`,
      timestamp: new Date().toISOString()
    });

    await conversationStorage.updateConversationStatus(sessionId, 'completed');
  }
}

/**
 * Create a task in Cortex orchestrator
 */
async function createCortexTask(improvement: any): Promise<void> {
  const taskPayload = {
    id: improvement.id,
    type: 'user_query',
    priority: improvement.priority === 'high' ? 8 : 5,
    payload: {
      query: `YouTube Improvement: ${improvement.title}\n\nDescription: ${improvement.description}\n\nPlease analyze and implement this improvement to the Cortex system.`
    },
    metadata: {
      source: 'youtube-workflow',
      auto_approved: true,
      improvement_id: improvement.id
    }
  };

  const response = await fetch(`${CORTEX_URL}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(taskPayload)
  });

  if (!response.ok) {
    throw new Error(`Failed to create Cortex task: ${response.statusText}`);
  }

  console.log(`[YouTubeWorkflow] Created Cortex task: ${improvement.id}`);
}

/**
 * Format initial processing status message
 */
function formatInitialStatus(url: string, videoId: string): string {
  return `**Processing YouTube video in background...**

Video ID: \`${videoId}\`
Status: Extracting transcript and analyzing content...

I'll notify you when the analysis is complete!`;
}

/**
 * Format analysis summary for user approval
 */
function formatAnalysisSummary(videoData: any, analysis: any): string {
  const { title } = videoData.knowledge || {};
  const { summary, relevance, improvements } = analysis;

  const relevanceBar = '▓'.repeat(Math.floor(relevance * 10)) + '░'.repeat(10 - Math.floor(relevance * 10));

  let message = `**Video Analysis Complete**

**Summary:**
- Title: ${title || 'Unknown'}
- Relevance to Cortex: [${relevanceBar}] ${Math.floor(relevance * 100)}%
- ${summary}

**Recommended Improvements:**
`;

  improvements.forEach((imp: any, idx: number) => {
    const priorityLabel = imp.priority === 'high' ? '[HIGH]' : imp.priority === 'medium' ? '[MED]' : '[LOW]';
    message += `${idx + 1}. ${priorityLabel} ${imp.title}\n`;
  });

  message += `\n**Would you like me to implement these improvements?**

Reply with:
- **"yes"** to implement all improvements
- **"details"** to see more information
- **"no"** to skip implementation`;

  return message;
}
