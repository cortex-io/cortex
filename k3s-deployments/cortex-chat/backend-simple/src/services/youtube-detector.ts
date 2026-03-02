/**
 * YouTube URL Detection and Ingestion Service
 * Detects YouTube URLs in messages and triggers ingestion
 */

const YOUTUBE_INGESTION_URL = process.env.YOUTUBE_INGESTION_URL || 'http://youtube-ingestion.cortex.svc.cluster.local:8080';

/**
 * YouTube URL patterns
 */
const YOUTUBE_PATTERNS = [
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/live\/([a-zA-Z0-9_-]{11})/
];

export interface YouTubeDetectionResult {
  detected: boolean;
  urls: string[];
  videoIds: string[];
}

export interface YouTubeIngestionResult {
  success: boolean;
  count: number;
  videos: Array<{
    videoId: string;
    status: string;
    title?: string;
    error?: string;
  }>;
  error?: string;
}

/**
 * Detect YouTube URLs in a message
 */
export function detectYouTubeURLs(message: string): YouTubeDetectionResult {
  const urls: string[] = [];
  const videoIds: string[] = [];

  for (const pattern of YOUTUBE_PATTERNS) {
    const matches = message.matchAll(new RegExp(pattern, 'g'));
    for (const match of matches) {
      if (match[0] && match[1]) {
        urls.push(match[0]);
        if (!videoIds.includes(match[1])) {
          videoIds.push(match[1]);
        }
      }
    }
  }

  return {
    detected: urls.length > 0,
    urls,
    videoIds
  };
}

/**
 * Trigger YouTube video ingestion
 */
export async function ingestYouTubeVideos(message: string): Promise<YouTubeIngestionResult> {
  try {
    const response = await fetch(`${YOUTUBE_INGESTION_URL}/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message }),
      signal: AbortSignal.timeout(180000) // 3 minute timeout
    });

    if (!response.ok) {
      throw new Error(`Ingestion service returned ${response.status}`);
    }

    const result = await response.json();

    return {
      success: result.detected && result.count > 0,
      count: result.count || 0,
      videos: result.videos || []
    };

  } catch (error: any) {
    console.error('[YouTubeDetector] Ingestion failed:', error.message);
    return {
      success: false,
      count: 0,
      videos: [],
      error: error.message
    };
  }
}

/**
 * Format ingestion results for display in chat
 */
export function formatIngestionResults(result: YouTubeIngestionResult): string {
  if (!result.success || result.count === 0) {
    return '';
  }

  const parts: string[] = [];
  parts.push(`\n\n**YouTube Video Ingestion** (${result.count} video${result.count > 1 ? 's' : ''})`);

  for (const video of result.videos) {
    if (video.status === 'ingested') {
      parts.push(`✓ **${video.title || video.videoId}**: Successfully analyzed and stored`);
    } else if (video.status === 'failed') {
      parts.push(`✗ **${video.videoId}**: Failed (${video.error || 'Unknown error'})`);
    }
  }

  return parts.join('\n');
}
