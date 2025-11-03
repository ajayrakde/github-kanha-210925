/**
 * Haptic Feedback Utility
 * Provides tactile feedback for mobile interactions using the Vibration API
 * Falls back gracefully on unsupported devices
 */

type HapticPattern = 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'warning';

const HAPTIC_PATTERNS: Record<HapticPattern, number | number[]> = {
  light: 10,           // Quick tap feedback
  medium: 20,          // Standard button press
  heavy: 30,           // Strong interaction (delete, important action)
  success: [10, 50, 10], // Success pattern (double tap)
  error: [20, 100, 20, 100, 20], // Error pattern (triple strong tap)
  warning: [15, 100, 15], // Warning pattern (double medium tap)
};

/**
 * Check if vibration API is supported
 */
function isVibrationSupported(): boolean {
  return typeof navigator !== 'undefined' && 'vibrate' in navigator;
}

/**
 * Trigger haptic feedback
 * @param pattern - Predefined haptic pattern or custom vibration duration(s)
 */
export function triggerHaptic(pattern: HapticPattern | number | number[]): void {
  if (!isVibrationSupported()) {
    return; // Silently fail on unsupported devices
  }

  try {
    const vibrationPattern = typeof pattern === 'string' 
      ? HAPTIC_PATTERNS[pattern]
      : pattern;

    navigator.vibrate(vibrationPattern);
  } catch (error) {
    // Silently catch any errors (e.g., permissions, unsupported)
    console.debug('Haptic feedback failed:', error);
  }
}

/**
 * Cancel any ongoing vibration
 */
export function cancelHaptic(): void {
  if (typeof navigator !== 'undefined' && isVibrationSupported()) {
    navigator.vibrate(0);
  }
}

/**
 * Haptic feedback for common interactions
 */
export const haptic = {
  // UI interactions
  tap: () => triggerHaptic('light'),
  press: () => triggerHaptic('medium'),
  longPress: () => triggerHaptic('heavy'),
  
  // State changes
  success: () => triggerHaptic('success'),
  error: () => triggerHaptic('error'),
  warning: () => triggerHaptic('warning'),
  
  // Gestures
  swipeStart: () => triggerHaptic('light'),
  swipeEnd: () => triggerHaptic('medium'),
  
  // Actions
  delete: () => triggerHaptic('heavy'),
  add: () => triggerHaptic('medium'),
  toggle: () => triggerHaptic('light'),
  
  // Navigation
  pageTransition: () => triggerHaptic('light'),
  
  // Cancel
  cancel: () => cancelHaptic(),
};
