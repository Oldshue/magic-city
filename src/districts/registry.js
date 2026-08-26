/**
 * registry.js — static district module registry.
 *
 * TECH-CONTRACT requires no template-string dynamic import (the artifact
 * bundler cannot resolve a runtime-computed specifier). Instead every
 * district module under src/districts/ is imported here as a namespace,
 * and this file exports a single lookup map keyed by file slug (filename
 * without the .js extension) to that module's build function. main.js
 * imports this map and looks up builders[d.slug] instead of doing a
 * dynamic import itself.
 *
 * Keep this file in sync with the contents of src/districts/: add one
 * static import line and one map entry per new district module. Do not
 * import this file (registry.js) from itself.
 */
import * as alabamaWay from './alabama-way.js';
import * as avondaleBoulevard from './avondale-boulevard.js';
import * as ensleyWorksMercato from './ensley-works-mercato.js';
import * as furnaceRowSlossFlats from './furnace-row-sloss-flats.js';
import * as heaviestCorner from './heaviest-corner.js';
import * as redMountainCrestVulcanPark from './red-mountain-crest-vulcan-park.js';
import * as southsideHighlands from './southside-highlands.js';
import * as terminalQuarter from './terminal-quarter.js';
import * as testBlock from './test-block.js';

export const builders = {
  'alabama-way': alabamaWay.build,
  'avondale-boulevard': avondaleBoulevard.build,
  'ensley-works-mercato': ensleyWorksMercato.build,
  'furnace-row-sloss-flats': furnaceRowSlossFlats.build,
  'heaviest-corner': heaviestCorner.build,
  'red-mountain-crest-vulcan-park': redMountainCrestVulcanPark.build,
  'southside-highlands': southsideHighlands.build,
  'terminal-quarter': terminalQuarter.build,
  'test-block': testBlock.build,
};
