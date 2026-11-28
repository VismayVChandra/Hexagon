import { showToast } from '../hooks/hooks';
import type { SessionSummary, Subject } from '../types';
import { formatDuration } from '../lib/time';

/** A short, friendly line to send a friend. It never includes a name; the student chooses to send it. */
export function shareText(summary: SessionSummary, subject?: Subject): string {
  const what = subject ? ` of ${subject.name}` : '';
  const honey = summary.cellsAdded > 0 ? `, ${summary.cellsAdded} honey ${summary.cellsAdded === 1 ? 'cell' : 'cells'} added to my hive` : '';
  const streak = summary.streakDays > 1 ? ` ${summary.streakDays}-day streak.` : '';
  return `I just studied ${formatDuration(summary.studiedMs)}${what}${honey}.${streak}`;
}

export async function shareSummary(summary: SessionSummary, subject?: Subject) {
  const text = shareText(summary, subject);
  const url = window.location.origin + window.location.pathname;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Hexagon', text, url });
      return;
    }
    await navigator.clipboard.writeText(`${text} ${url}`);
    showToast('Copied. Paste it anywhere.', 'success');
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return; // they closed the share sheet
    showToast('Couldn’t share from this browser.', 'error');
  }
}
