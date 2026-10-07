import type { DragEvent } from 'react';

export const DRAG_MIME = 'application/x-bfp-item';

export interface DraggedItem {
  kind: 'metric' | 'dimension';
  id: string;
}

export function setDraggedItem(event: DragEvent, item: DraggedItem) {
  event.dataTransfer.setData(DRAG_MIME, JSON.stringify(item));
  event.dataTransfer.setData('text/plain', item.id);
  event.dataTransfer.effectAllowed = 'copy';
}

export function readDraggedItem(event: DragEvent): DraggedItem | null {
  try {
    const raw = event.dataTransfer.getData(DRAG_MIME);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraggedItem;
    return parsed.kind === 'metric' || parsed.kind === 'dimension' ? parsed : null;
  } catch {
    return null;
  }
}

export function hasDraggedItem(event: DragEvent) {
  return event.dataTransfer.types.includes(DRAG_MIME);
}
