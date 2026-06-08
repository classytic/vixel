/**
 * Profiles — named, validated encode recipes ("the smarts" packaged).
 *
 * Currently: {@link editorProxy} (browser-editor proxy MP4). Coming: hlsLadder,
 * webMp4.
 */

export {
  editorProxy,
  buildEditorProxyArgs,
  type EditorProxyConfig,
  type EditorProxyResult,
} from './editor-proxy.js';
export {
  editorPackage,
  defaultPosterSec,
  defaultSpriteIntervalSec,
  type EditorPackageConfig,
  type EditorPackageResult,
} from './editor-package.js';
export {
  hlsLadder,
  ladderFor,
  type HlsLadderConfig,
  type HlsLadderResult,
} from './hls-ladder.js';
