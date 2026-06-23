/**
 * `useCaptionStyleActions` — the behavior primitive for the CAPTION track's STYLE.
 * ===========================================================================
 * Captions are generated as a tagged track (`metadata.role:'captions'`, see
 * vixel-schema `buildCaptionClips`). This hook finds that track, reports the gallery
 * + the active style, and RE-STYLES the whole track on click via the SHARED schema
 * `applyCaptionStyle` (re-chunk + restyle from the raw words stashed on the clip).
 * The renderer/panel stays dumb — same source of truth the agent generated with.
 */
'use client';

import { useMemo } from 'react';
import { applyCaptionStyle, captionLines, setCaptionLineText, isCaptionClip, listCaptionStyles, type CaptionStyle, type CaptionLine, type VisualTrack, type TextStyle } from '@classytic/vixel-schema';
import { useEditorState, useEditorActions } from '../../../editor/controller/hooks/useEditorStore.js';
import { useAnnounce } from '../../../a11y/live-region.js';

export interface CaptionStyleActions {
  /** A caption track exists in the spec (else the gallery is inert). */
  available: boolean;
  /** The caption-style gallery (id / name / category — for swatches). */
  styles: CaptionStyle[];
  /** The currently-applied style id, if any. */
  activeId?: string;
  /** Re-style the whole caption track to `styleId` (no-op if already active / no track). */
  apply(styleId: string): void;
  /** The current caption TEXT style (colour / font / stroke / animation / box) — for the
   *  inspector controls. From the first caption clip. */
  style?: TextStyle;
  /** Merge a partial TEXT style into EVERY caption clip (colour, font, outline, the
   *  active-word effect/box, size…). The fine-grained editor on top of the presets. */
  patchStyle(partial: Partial<TextStyle>): void;
  /** The editable caption LINES (a transcript) — for fixing a misheard word, etc. */
  lines: CaptionLine[];
  /** Replace line `index`'s text and rebuild the track (style + timing preserved). */
  editLine(index: number, text: string): void;
}

const DEFAULT_ACCENT = '#7c9cff';

export function useCaptionStyleActions(): CaptionStyleActions {
  const spec = useEditorState((s) => s.spec);
  const actions = useEditorActions();
  const announce = useAnnounce();

  return useMemo<CaptionStyleActions>(() => {
    const styles = listCaptionStyles();
    const noop = () => {};
    const trackIndex = spec.tracks.findIndex((t) => t.type === 'visual' && t.clips.some(isCaptionClip));
    if (trackIndex < 0) return { available: false, styles, apply: noop, patchStyle: noop, lines: [], editLine: noop };

    const track = spec.tracks[trackIndex] as VisualTrack;
    const capClips = track.clips.filter(isCaptionClip);
    const activeId = (capClips[0]?.metadata as { captionStyle?: string } | undefined)?.captionStyle;
    const style = (capClips[0]?.media as { style?: TextStyle } | undefined)?.style;
    const accent = style?.highlightColor ?? DEFAULT_ACCENT;

    return {
      available: true,
      styles,
      activeId,
      style,
      lines: captionLines(capClips),
      editLine: (index: number, text: string) => {
        const cur = actions.getSpec();
        const t = cur.tracks[trackIndex];
        if (!t || t.type !== 'visual') return;
        const captionClips = t.clips.filter(isCaptionClip);
        const others = t.clips.filter((c) => !isCaptionClip(c));
        const next = setCaptionLineText(captionClips, index, text, { W: cur.output.width, H: cur.output.height, accent });
        const tracks = cur.tracks.slice();
        tracks[trackIndex] = { ...t, clips: [...others, ...next] };
        actions.setSpec({ ...cur, tracks });
        announce('Caption updated');
      },
      patchStyle: (partial: Partial<TextStyle>) => {
        const cur = actions.getSpec();
        const t = cur.tracks[trackIndex];
        if (!t || t.type !== 'visual') return;
        const clips = t.clips.map((c) =>
          isCaptionClip(c) && c.media.kind === 'text'
            ? { ...c, media: { ...c.media, style: { ...(c.media.style ?? {}), ...partial } } }
            : c,
        );
        const tracks = cur.tracks.slice();
        tracks[trackIndex] = { ...t, clips };
        actions.setSpec({ ...cur, tracks });
      },
      apply: (styleId: string) => {
        if (styleId === activeId) return;
        const cur = actions.getSpec();
        const t = cur.tracks[trackIndex];
        if (!t || t.type !== 'visual') return;
        const captionClips = t.clips.filter(isCaptionClip);
        const others = t.clips.filter((c) => !isCaptionClip(c)); // defensive: keep any non-caption clips
        const restyled = applyCaptionStyle(captionClips, styleId, { W: cur.output.width, H: cur.output.height, accent });
        const tracks = cur.tracks.slice();
        tracks[trackIndex] = { ...t, clips: [...others, ...restyled] };
        actions.setSpec({ ...cur, tracks });
        announce(`Caption style: ${styles.find((s) => s.id === styleId)?.name ?? styleId}`);
      },
    };
  }, [spec, actions, announce]);
}
