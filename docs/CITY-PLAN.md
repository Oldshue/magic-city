# CITY-PLAN.md — Planner Memo, Magic City 1929

City Planner's layout decisions for the open-world Birmingham. Coordinates in meters; origin (0,0) is the Heaviest Corner (20th Street & 1st Avenue North). +X = east, +Z = south. All numbers below are canon once committed.

## World frame
- Walkable bounds: 2,400m × 2,400m, x and z each −1200…+1200.
- Real Birmingham sits its districts across ~8km; we compress the valley to keep every landmark within a 10–15 minute walk while preserving relative bearings: furnaces north of downtown (Sloss is really just north of First Avenue North), Ensley to the southwest, Red Mountain to the south with Vulcan facing north over downtown.

## Districts (8 polygons, tiled without overlap)
| Slug | Extent | Logic |
|---|---|---|
| `furnace-row-sloss-flats` | full width north of z=−320 | Loose industrial parcels on a coarse grid; rail belt along its south edge feeds Sloss. |
| `terminal-quarter` | west of 20th St spine (x<−160), z −320…60 | Station quarter west of downtown, as in reality; arrival plaza faces east onto the canyon. |
| `heaviest-corner` | tight core around the origin crossing | Downtown grid at ~120m blocks: avenues E–W every ~110m, streets N–S every ~80–90m; towers crowd the Corner itself. |
| `alabama-way` | strip along 2nd Ave N between 19th–22nd Sts | Theatre/radio row, one block north-east of the Corner. |
| `avondale-boulevard` | east residential belt | Bungalows and merchant homes around Avondale Park; streetcar-suburb scale. |
| `ensley-works-mercato` | southwest quadrant | TCI South Works furnace wall along the rail belt plus the immigrant market quarter beside it. |
| `southside-highlands` | band south of downtown, below Red Mountain | Highland Avenue ridge, DeLancey Mansion, transition slope to the mountain parks. |
| `red-mountain-crest-vulcan-park` | southern rim, z > 950 | Summit plateau; Vulcan on his tower looks due north down the 20th Street axis at downtown. |

Polygons share edges exactly (e.g. terminal-quarter/heaviest-corner split at x=−160; furnace-row south edge at z=−320) so there are no gaps or slivers. Winding is clockwise throughout.

## Streets
Numbered avenues run east–west (`1st Avenue North` at z=0 through `7th Avenue North`); numbered streets run north–south (`19th`–`23rd Streets`). **20th Street North** is the wide ceremonial spine from Terminal Plaza to Vulcan Park. The Furnace Row grid loosens to ~200m parcels; Ensley uses long industrial blocks. The crest road curves along the mountain rim (Vulcan Parkway) connecting two funicular-head plazas.

## Landmarks — placement notes
- Four Heaviest Corner towers ring the origin crossing at ~30–40m offsets, rotated to face the intersection; Jefferson Trust Tower (410 ft / 125 m, tallest) stands NE at (30,−30). TCI Building (380 ft / 116 m) NW.
- Terminal Station at (−420,−140), dome facing east toward downtown; Hotel Tutwiler Grand adjacent; the 60-ft WELCOME gantry over the arrival tracks behind it.
- Sloss Furnaces at (150,−620) with four stacks; Slag Glass Works just west.
- Alabama Theatre at (95,55) fronting 2nd Ave N; Club Savoy next door.
- Vulcan at (0,1085): statue 17m tall on a 37m tower (56 ft + 120 ft ≈ canon heights), rotationYDeg 180 so he faces north/downtown. Sentinel Observation Deck cantilevers beside him.
- Ensley Blast Furnace Row at (−900,700) — six stacks visible from the whole southwest; Mercato Public Market at (−760,520).
- Avondale Park & Spring at (820,480); Labor Temple at (620,300); DeLancey Mansion at (−180,870) above Highland Ave.
- Belt Loop viaduct is a rectangular elevated circuit, ±260m around the core, 30 ft deck.

## Streetcars (Birmingham Electric Co., 5 lines)
Red Line (terminal↔mountain via 20th St), Ensley Flyer (orange loop SW), Avondale Local (green loop E), Belt Loop white/gold elevated circuit, Bessemer Limited (blue loop SW, wider than the Flyer). All modeled as closed loops.

## Spawn
Player spawns at (0,55) on 20th Street just south of the Corner, yawDeg 180 = facing north up the canyon toward the Jefferson Trust Tower crown, with the Corner towers flanking and Vulcan's spear far south behind them.

## Numbers invented here (now canon)
- District boundary lines listed above; block spacing (~110m avenue pitch, ~85m street pitch downtown).
- Landmark coordinates as tabled in city-plan.json.
- Crest elevation treated as flat plateau at plan level (terrain agent may add relief).
- Streetcar loop geometries as pathed; fare and rolling stock per World Bible.
