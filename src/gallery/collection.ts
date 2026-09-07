import { publicAssetUrl } from '../lib/asset-url';
import type { GalleryItem } from '../lib/gallery/types';

const artwork = (name: string) => ({
  src: publicAssetUrl(`gallery-images/natural-${name}.webp`),
  thumbnail: publicAssetUrl(`gallery-images/natural-${name}-thumb.webp`),
});

/**
 * Ordinary photographic sources generated without recursion.
 * The renderer creates every repeated copy. Small, well-inset openings
 * are calibrated against the uncropped source; rectangular openings
 * retain their proportions in the renderer's working crop.
 * Originals and prompts: assets/examples/natural-sources/.
 */
export const galleryItems: GalleryItem[] = [
  {
    id: 'photo-camera', title: 'Before the shutter',
    description: 'An ordinary lens. Then the camera looks into its own room.',
    ...artwork('camera'), category: 'Objects',
    alt: 'A worn black and silver camera with an ordinary dark glass lens and red strap on a wooden table.',
    nest: { x: .443, y: .481, w: .148, h: .151 }, shape: 'ellipse',
  },
  {
    id: 'photo-coffee', title: 'One quiet coffee',
    description: 'A small cup, a spoon, a few crumbs. A whole morning fits inside.',
    ...artwork('coffee'), category: 'Objects',
    alt: 'One cup of plain black coffee seen from above, with blue linen, bread and a teaspoon on a worn table.',
    nest: { x: .407, y: .403, w: .187, h: .184 }, shape: 'ellipse',
  },
  {
    id: 'photo-boat', title: 'Harbor glass',
    description: 'The tide is quiet. Follow the little brass porthole.',
    ...artwork('boat'), category: 'Places',
    alt: 'A worn teal fishing boat beside a wooden pier, with one small brass porthole of ordinary dark glass.',
    nest: { x: .439, y: .347, w: .103, h: .104 }, shape: 'ellipse',
  },
  {
    id: 'photo-cabin', title: 'A room in the forest',
    description: 'A small window. A whole forest on the other side.',
    ...artwork('cabin'), category: 'Places',
    alt: 'A small weathered timber cabin among tall trees and ferns, with one square window reflecting dark foliage.',
    nest: { x: .435, y: .407, w: .131, h: .131 }, shape: 'rect',
  },
  {
    id: 'photo-greenhouse', title: 'The allotment',
    description: 'One open doorway. A path that finds its way back to the garden.',
    ...artwork('greenhouse'), category: 'Places',
    alt: 'A single weathered greenhouse amid overgrown plants, with a small open doorway into its dim ordinary interior.',
    nest: { x: .440, y: .408, w: .109, h: .194 }, shape: 'rect',
  },
  {
    id: 'photo-radio', title: 'Afternoon radio',
    description: 'Wood, woven cloth and a little afternoon light. Tune in.',
    ...artwork('radio'), category: 'Objects',
    alt: 'One walnut tabletop radio with a round woven speaker grille, sitting on a sideboard against a teal wall.',
    nest: { x: .300, y: .438, w: .178, h: .181 }, shape: 'ellipse',
  },
  {
    id: 'photo-frame', title: 'The empty frame',
    description: 'There is no painting yet. The frame borrows the room around it.',
    ...artwork('frame'), category: 'Still life',
    alt: 'A single small wooden frame with plain dark backing on an artist’s paint-stained workbench.',
    nest: { x: .425, y: .414, w: .161, h: .153 }, shape: 'rect',
  },
  {
    id: 'photo-garden-window', title: 'Behind the garden wall',
    description: 'Old brick, climbing roses, a small circle of dark glass.',
    ...artwork('garden-window'), category: 'Places',
    alt: 'A brick potting-shed wall with ivy, roses and terracotta pots around one small stone-rimmed circular window.',
    nest: { x: .422, y: .334, w: .154, h: .153 }, shape: 'ellipse',
  },
  {
    id: 'photo-record', title: 'A side of silence',
    description: 'A blank label. Put the whole room on repeat.',
    ...artwork('record'), category: 'Still life',
    alt: 'One black vinyl record with a plain cream label on a worn turntable, photographed from above.',
    nest: { x: .369, y: .428, w: .170, h: .170 }, shape: 'ellipse',
  },
  {
    id: 'photo-guitar', title: 'Quiet strings',
    description: 'The workshop is still. The sound hole opens into something larger.',
    ...artwork('guitar'), category: 'Still life',
    alt: 'A worn amber acoustic guitar above a workbench, with a normal dark sound hole and six strings.',
    nest: { x: .450, y: .347, w: .120, h: .120 }, shape: 'ellipse',
  },
  {
    id: 'photo-watch', title: 'A little time',
    description: 'A brass chain rests on linen. Stay for another turn.',
    ...artwork('watch'), category: 'Objects',
    alt: 'A single brass pocket watch with an ordinary cream clock face and chain on rumpled indigo cloth.',
    nest: { x: .438, y: .444, w: .124, h: .132 }, shape: 'ellipse',
  },
  {
    id: 'photo-laundry', title: 'Laundry day',
    description: 'A familiar room. A different sort of spin cycle.',
    ...artwork('laundry'), category: 'Still life',
    alt: 'One ordinary white washing machine with a closed dark glass door, a canvas basket and folded towels in a pale blue room.',
    nest: { x: .445, y: .482, w: .130, h: .130 }, shape: 'ellipse',
  },
];
