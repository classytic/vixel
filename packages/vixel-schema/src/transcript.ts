/**
 * Timeline transcript — what the cut actually SAYS, in timeline time.
 * ==================================================================
 * The inverse of {@link buildCaptionCues} (which turns ASR words INTO caption clips):
 * this walks the assembled timeline and reads the spoken words BACK OUT, mapped into
 * timeline seconds. For every audio-bearing element (video clips with source audio,
 * audio items) in timeline order, each source word is projected through the element's
 * `trimStart`/`in` and `at` into its on-screen time — and words trimmed off the clip
 * are dropped. So after cuts, the result reflects exactly what is now audible: no
 * stale words, no per-clip frame math by the caller.
 *
 * This is the read an AGENT needs for transcript-driven editing (filler-word / dead-
 * air / retake removal, locating a quote, take selection) and for verifying what
 * remains after a {@link rippleDeleteRanges}. The words themselves come from the host's
 * transcription provider (vixel does not transcribe — same boundary as the caption
 * builder); feed them in keyed by element id and this does the timeline projection.
 *
 * Pure + deterministic. Because vixel has no per-clip speed, source time maps 1:1 to
 * timeline time (offset by `at − sourceStart`), so the projection is exact.
 */
import type { VixelSpec } from './spec.js';
import type { AsrWord } from './caption-cues.js';

/** A word placed on the timeline (seconds), attributed to one element. */
export interface TimelineWord {
  readonly text: string;
  /** Timeline start (seconds). */
  readonly startSec: number;
  /** Timeline end (seconds). */
  readonly endSec: number;
}

/** One audio-bearing element's words, in timeline order. */
export interface TranscriptSegment {
  /** Clip or audio-item id the words belong to. */
  readonly id: string;
  readonly kind: 'clip' | 'audio';
  /** Lane index (stacking/render order). */
  readonly trackIndex: number;
  readonly words: TimelineWord[];
}

/** Options for {@link timelineTranscript}. */
export interface TimelineTranscriptOptions {
  /** Keep a word if at least this fraction of it is inside the clip. Default 0.5. */
  readonly minOverlap?: number;
}

/** Project one element's source words (ms) into timeline words, dropping trimmed-out ones. */
function projectWords(
  words: readonly AsrWord[],
  sourceStartSec: number,
  sourceEndSec: number,
  atSec: number,
  minOverlap: number,
): TimelineWord[] {
  const out: TimelineWord[] = [];
  for (const w of words) {
    const ws = w.startMs / 1000;
    const we = w.endMs / 1000;
    const dur = we - ws;
    // Overlap of the word with the clip's visible source window.
    const lo = Math.max(ws, sourceStartSec);
    const hi = Math.min(we, sourceEndSec);
    const overlap = hi - lo;
    if (overlap <= 0) continue;
    if (dur > 0 && overlap / dur < minOverlap) continue;
    out.push({
      text: w.text,
      startSec: atSec + (lo - sourceStartSec),
      endSec: atSec + (hi - sourceStartSec),
    });
  }
  return out;
}

/**
 * Read the spoken transcript of the assembled timeline, in timeline seconds.
 * `wordsById` maps each clip/audio-item id to its FULL source-time ASR words (ms from
 * source start); this projects them through each element's trim + position and drops
 * the trimmed-out ones. Segments come back in timeline order (by start time). Pure.
 *
 * Pass the result's word `startSec`/`endSec` straight back into
 * {@link rippleDeleteRanges} to cut by what was said.
 */
export function timelineTranscript(
  spec: VixelSpec,
  wordsById: ReadonlyMap<string, readonly AsrWord[]>,
  options: TimelineTranscriptOptions = {},
): TranscriptSegment[] {
  const minOverlap = options.minOverlap ?? 0.5;
  const segments: TranscriptSegment[] = [];

  spec.tracks.forEach((t, trackIndex) => {
    if (t.type === 'visual') {
      for (const c of t.clips) {
        if (c.media.kind !== 'video' || c.muted || !c.id) continue;
        const words = wordsById.get(c.id);
        if (!words?.length) continue;
        const srcStart = c.media.trimStart ?? 0;
        const projected = projectWords(words, srcStart, srcStart + c.duration, c.at, minOverlap);
        if (projected.length) segments.push({ id: c.id, kind: 'clip', trackIndex, words: projected });
      }
    } else {
      for (const it of t.items) {
        if (!it.id) continue;
        const words = wordsById.get(it.id);
        if (!words?.length) continue;
        const srcStart = it.in ?? 0;
        const srcEnd = it.out != null ? it.out : Infinity;
        const projected = projectWords(words, srcStart, srcEnd, it.at ?? 0, minOverlap);
        if (projected.length) segments.push({ id: it.id, kind: 'audio', trackIndex, words: projected });
      }
    }
  });

  segments.sort((a, b) => (a.words[0]?.startSec ?? 0) - (b.words[0]?.startSec ?? 0));
  return segments;
}

/** Flatten a transcript to plain text in timeline order. Pure. */
export function transcriptText(segments: readonly TranscriptSegment[]): string {
  return segments
    .map((s) => s.words.map((w) => w.text).join(' '))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
