import { describe, it, expect } from 'vitest';
import { textStyle, themeOrDefault, getTheme, setFontPackBase, fontFileForFamily, DEFAULT_THEME_ID } from './theme.js';
import { buildScene, buildScenes, authoringManifest, statCards } from './templates.js';

describe('theme', () => {
  it('emits BOTH fontFamily and fontFile (so export never silently falls back)', () => {
    const theme = themeOrDefault();
    const s = textStyle(theme, 'heading', 'textPrimary');
    expect(s.fontFamily).toBe(theme.fonts.heading.family);
    expect(s.fontFile).toBeTruthy();
    expect(s.fontFile).toMatch(/\.ttf$/); // ttf, not woff2 — libass-readable
    expect(s.fillColor).toBe(theme.palette.textPrimary);
  });

  it('setFontPackBase rewrites every theme font url', () => {
    setFontPackBase('https://cdn.example.com/fonts/');
    const s = textStyle(themeOrDefault(), 'body', 'textSecondary');
    expect(s.fontFile).toMatch(/^https:\/\/cdn\.example\.com\/fonts\//);
    setFontPackBase('/fonts'); // restore
  });

  it('fontFileForFamily resolves hosted families (shared family→file map) and is undefined otherwise', () => {
    expect(fontFileForFamily('Inter')).toMatch(/\/Inter-Regular\.ttf$/);
    expect(fontFileForFamily('Fraunces')).toMatch(/\/Fraunces-SemiBold\.ttf$/);
    expect(fontFileForFamily("Comic Sans That Nobody Hosts")).toBeUndefined();
  });

  it('themeOrDefault always resolves (unknown id ⇒ default)', () => {
    expect(themeOrDefault('does-not-exist').id).toBe(DEFAULT_THEME_ID);
    expect(getTheme('does-not-exist')).toBeUndefined();
  });

  it('swapping the theme restyles a template (no shared hardcoded color)', () => {
    const headingColor = (themeId: string): string | undefined => {
      const clips = statCards({ at: 0, duration: 5, heading: 'X', cards: [] }, getTheme(themeId));
      return (clips[0]!.media as { style?: { fillColor?: string } }).style?.fillColor;
    };
    // Dark studio vs light warm-brand resolve the SAME role to DIFFERENT colors.
    expect(headingColor('studio')).not.toBe(headingColor('warm-brand'));
  });
});

describe('scene presets', () => {
  it('buildScene expands a preset into themed clips', () => {
    const clips = buildScene({
      template: 'title-card',
      at: 1,
      duration: 4,
      theme: 'editorial',
      content: { title: 'Hello', subtitle: 'world' },
    });
    expect(clips.length).toBeGreaterThan(0);
    const title = clips.find((c) => c.media.kind === 'text')!;
    const style = (title.media as { style?: { fontFamily?: string } }).style;
    expect(style?.fontFamily).toBe(getTheme('editorial')!.fonts.heading.family);
  });

  it('unknown template ⇒ [] (one bad scene does not throw)', () => {
    expect(buildScene({ template: 'nope', at: 0, duration: 1 })).toEqual([]);
  });

  it('buildScenes flattens and applies the default theme', () => {
    const clips = buildScenes(
      [
        { template: 'title-card', at: 0, duration: 3, content: { title: 'A' } },
        { template: 'lower-third', at: 3, duration: 3, content: { title: 'B' } },
      ],
      'minimal-mono',
    );
    expect(clips.length).toBeGreaterThan(1);
  });

  it('authoringManifest lists themes + templates as flat metadata', () => {
    const m = authoringManifest();
    expect(m.themes.map((t) => t.id)).toContain('studio');
    expect(m.templates.map((t) => t.id)).toEqual(expect.arrayContaining(['stat-cards', 'title-card', 'lower-third']));
  });
});
