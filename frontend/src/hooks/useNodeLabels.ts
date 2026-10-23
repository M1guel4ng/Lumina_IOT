import { useCallback, useState } from 'react'

const STORAGE_KEY = 'lumina_node_labels'

function loadLabels(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, string>) : {}
  } catch {
    return {}
  }
}

function saveLabels(labels: Record<string, string>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(labels))
}

export interface UseNodeLabels {
  /** Returns the user-defined label for a deviceId, or the deviceId itself if none set */
  getLabel: (deviceId: string) => string
  /** Returns the raw label (empty string if none set) */
  getRawLabel: (deviceId: string) => string
  /** Save / update a label. Pass empty string to clear */
  setLabel: (deviceId: string, label: string) => void
}

export function useNodeLabels(): UseNodeLabels {
  const [labels, setLabels] = useState<Record<string, string>>(loadLabels)

  const getLabel = useCallback(
    (deviceId: string) => labels[deviceId]?.trim() || deviceId,
    [labels],
  )

  const getRawLabel = useCallback(
    (deviceId: string) => labels[deviceId] ?? '',
    [labels],
  )

  const setLabel = useCallback((deviceId: string, label: string) => {
    setLabels((prev) => {
      const next = { ...prev }
      if (label.trim()) {
        next[deviceId] = label.trim()
      } else {
        delete next[deviceId]
      }
      saveLabels(next)
      return next
    })
  }, [])

  return { getLabel, getRawLabel, setLabel }
}
