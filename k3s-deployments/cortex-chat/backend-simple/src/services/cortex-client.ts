/**
 * Cortex Orchestrator Client
 * Routes requests to the existing Cortex system instead of rebuilding capabilities
 */

export async function askCortex(request: string): Promise<any> {
  const cortexUrl = process.env.CORTEX_URL || 'http://cortex-orchestrator.cortex.svc.cluster.local:8000';
  
  try {
    console.log(`[CortexClient] Sending request to Cortex: ${request}`);
    
    const response = await fetch(`${cortexUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: `chat-${Date.now()}`,
        type: 'user_query',
        priority: 5,
        payload: { query: request },
        metadata: { source: 'cortex-chat' }
      }),
      signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cortex API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('[CortexClient] Cortex response received');
    
    return result.result || result;
    
  } catch (error) {
    console.error('[CortexClient] Error calling Cortex:', error);
    throw error;
  }
}
