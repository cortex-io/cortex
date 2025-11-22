import { useEffect, useState } from 'react'
import wsService from '../services/websocketService'

export function useRealtimeUpdates<T>(
  eventType: string,
  initialValue: T
) {
  const [data, setData] = useState<T>(initialValue)

  useEffect(() => {
    wsService.connect()

    const unsubscribe = wsService.subscribe(eventType, (newData) => {
      setData(newData)
    })

    return () => {
      unsubscribe()
    }
  }, [eventType])

  return data
}

export function useRealtimeEvents() {
  const [events, setEvents] = useState<any[]>([])

  useEffect(() => {
    wsService.connect()

    const unsubscribe = wsService.subscribe('all', (message) => {
      setEvents(prev => [message, ...prev].slice(0, 100))
    })

    return () => {
      unsubscribe()
    }
  }, [])

  return events
}
