import { ElementRef, QueryList } from '@angular/core';
import { GestureController } from '@ionic/angular';

export interface LongPressConfig {
  delayMs: number;
  moveTolerancePx: number;
  startDelayMs: number;
}

export function initializePressGestures(
  elements: QueryList<ElementRef> | undefined | null,
  gestureCtrl: GestureController, // kept for compatibility with current callsite
  onTrigger: (nativeEl: any) => void,
  onFinalize: () => void,
  cfg: LongPressConfig
): () => void {
  const cleanupFns: Array<() => void> = [];
  const activeTimeouts = new Set<any>();

  elements?.forEach((elRef) => {
    const nativeEl = elRef.nativeElement as HTMLElement;
    if (!nativeEl) return;

    let pressTimeout: any = null;
    let startX = 0;
    let startY = 0;
    let longPressTriggered = false;
    let tracking = false;

    const clearPressTimeout = () => {
      if (pressTimeout) {
        clearTimeout(pressTimeout);
        activeTimeouts.delete(pressTimeout);
        pressTimeout = null;
      }
    };

    const finish = () => {
      clearPressTimeout();

      if (longPressTriggered) {
        onFinalize();
      }

      tracking = false;
      longPressTriggered = false;
    };

    const getPoint = (event: TouchEvent) => {
      const touch = event.touches[0] || event.changedTouches[0];
      return touch
        ? { x: touch.clientX, y: touch.clientY }
        : { x: 0, y: 0 };
    };

    const onTouchStart = (event: TouchEvent) => {
      if (!event.touches || event.touches.length !== 1) {
        finish();
        return;
      }

      const point = getPoint(event);
      startX = point.x;
      startY = point.y;
      tracking = true;
      longPressTriggered = false;

      clearPressTimeout();
      pressTimeout = setTimeout(() => {
        if (!tracking) return;
        longPressTriggered = true;
        onTrigger(nativeEl);
      }, cfg.delayMs);

      activeTimeouts.add(pressTimeout);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!tracking) return;
      if (!event.touches || event.touches.length !== 1) {
        finish();
        return;
      }

      const point = getPoint(event);
      const dx = Math.abs(point.x - startX);
      const dy = Math.abs(point.y - startY);

      if (dx > cfg.moveTolerancePx || dy > cfg.moveTolerancePx) {
        clearPressTimeout();
      }
    };

    const onTouchEnd = () => {
      finish();
    };

    const onTouchCancel = () => {
      finish();
    };

    nativeEl.addEventListener('touchstart', onTouchStart, { passive: true });
    nativeEl.addEventListener('touchmove', onTouchMove, { passive: true });
    nativeEl.addEventListener('touchend', onTouchEnd, { passive: true });
    nativeEl.addEventListener('touchcancel', onTouchCancel, { passive: true });

    cleanupFns.push(() => {
      clearPressTimeout();
      nativeEl.removeEventListener('touchstart', onTouchStart);
      nativeEl.removeEventListener('touchmove', onTouchMove);
      nativeEl.removeEventListener('touchend', onTouchEnd);
      nativeEl.removeEventListener('touchcancel', onTouchCancel);
    });
  });

  return () => {
    for (const timeout of Array.from(activeTimeouts)) {
      clearTimeout(timeout);
    }
    activeTimeouts.clear();

    for (const cleanup of cleanupFns) {
      cleanup();
    }
  };
}
