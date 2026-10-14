import { ui } from '../ui/root.js';
import { TheatreView, EmbedView } from '../ui/theatre.js';
// --- theatre / embed modes (?3mm=...&mode=theatre|embed) ----------------------
// The building's cinema (bldghd.cht kgobTheatre1 + theatre.cht kgobMovie) is
// now a canvas view — see app/ui/theatre.js for layout. The editor chrome
// stays mounted underneath, covered by the view like the old opaque overlays.
export const enterTheatre = () => ui.replace(new TheatreView(), 'fade');
export const enterEmbed = () => ui.replace(new EmbedView(), 'fade');
