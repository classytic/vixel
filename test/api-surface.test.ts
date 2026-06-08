/**
 * Public API surface — conformance/golden harness.
 *
 * Snapshots the exported names of every entry point so the primitive contract
 * can't drift silently: adding, removing, or renaming a public export fails this
 * test, forcing an intentional contract change (and a CHANGELOG note). The
 * explicit "must export" checks pin the load-bearing primitives even if a
 * snapshot is regenerated carelessly.
 */

import { describe, it, expect } from 'vitest';
import * as root from '../src/index.js';
import * as profiles from '../src/profiles/index.js';
import * as captions from '../src/captions/index.js';
import * as compose from '../src/compose/index.js';
import * as generators from '../src/generators/index.js';
import * as utils from '../src/utils/index.js';

const keys = (m: object) => Object.keys(m).sort();

describe('public API surface (golden — update intentionally)', () => {
  it('@classytic/vixel', () => expect(keys(root)).toMatchSnapshot());
  it('@classytic/vixel/profiles', () => expect(keys(profiles)).toMatchSnapshot());
  it('@classytic/vixel/captions', () => expect(keys(captions)).toMatchSnapshot());
  it('@classytic/vixel/compose', () => expect(keys(compose)).toMatchSnapshot());
  it('@classytic/vixel/generators', () => expect(keys(generators)).toMatchSnapshot());
  it('@classytic/vixel/utils', () => expect(keys(utils)).toMatchSnapshot());
});

describe('load-bearing primitives are exported', () => {
  it('core / ingest / errors', () => {
    for (const k of ['Source', 'fetchToFile', 'VixelError', 'ErrorCode', 'tryCatch', 'downscaleFilter']) {
      expect(root, k).toHaveProperty(k);
    }
  });
  it('profiles', () => {
    for (const k of ['editorProxy', 'editorPackage', 'hlsLadder']) expect(profiles).toHaveProperty(k);
  });
  it('captions (BYO + CapCut modes)', () => {
    for (const k of ['burnCaptions', 'buildAss', 'CAPTION_PRESETS']) expect(captions).toHaveProperty(k);
  });
  it('compose (the declarative renderer + schema)', () => {
    for (const k of ['compose', 'planTimeline', 'buildComposeGraph', 'defineComposition']) {
      expect(compose).toHaveProperty(k);
    }
  });

  it('no export is undefined', () => {
    for (const mod of [root, profiles, captions, compose, generators, utils]) {
      for (const [name, value] of Object.entries(mod)) {
        expect(value, name).not.toBeUndefined();
      }
    }
  });
});
