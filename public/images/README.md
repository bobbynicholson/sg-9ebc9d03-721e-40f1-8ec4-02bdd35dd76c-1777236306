# Landing page photography

Drop real photos at these exact paths and they appear on the homepage with
**zero code changes**. Until a file exists, a tasteful warm gradient shows in
its place (no broken-image icons), so the layout always looks finished.

Use high-quality, well-lit, appetising photography. Optimise before adding
(WebP/JPEG, ~70–80% quality). Suggested sizes below are minimums for sharpness
on retina screens.

| Path | What it is | Suggested size | Crop |
| --- | --- | --- | --- |
| `hero.jpg` | Hero background — a stunning catering spread / plated table | 2400×1400 | landscape, central interest |
| `cta.jpg` | Final call-to-action banner wash (sits behind a dark scrim) | 2000×1000 | landscape, can be moody |
| `services/weddings.jpg` | Wedding catering | 1000×750 | 4:3 |
| `services/corporate.jpg` | Corporate / conference catering | 1000×750 | 4:3 |
| `services/private.jpg` | Private party / birthday | 1000×750 | 4:3 |
| `services/gala.jpg` | Gala / special event | 1000×750 | 4:3 |
| `menu/beef-fillet.jpg` | Seared beef fillet (signature main) | 1000×800 | 5:4 |
| `menu/arancini.jpg` | Truffle arancini (canapé) | 1000×800 | 5:4 |
| `menu/curry.jpg` | Cape Malay curry | 1000×800 | 5:4 |
| `menu/grazing.jpg` | Grazing table | 1000×800 | 5:4 |
| `menu/malva.jpg` | Malva pudding (dessert) | 1000×800 | 5:4 |
| `menu/potjie.jpg` | Lamb potjie | 1000×800 | 5:4 |
| `gallery/1.jpg` | Feature shot (large tile) — banquet / table setting | 1400×1400 | square-ish |
| `gallery/2.jpg` … `gallery/5.jpg` | Event / food / plating shots | 800×800 | square |
| `testimonials/sarah.jpg` | Headshot — Sarah Johnson | 240×240 | square |
| `testimonials/michael.jpg` | Headshot — Michael Peters | 240×240 | square |
| `testimonials/linda.jpg` | Headshot — Linda Ndlovu | 240×240 | square |

> The image slots are rendered by the `Photo` component in
> `src/pages/index.tsx` via CSS background-image, so missing files degrade
> gracefully to a gradient. To change a path, edit the `src` in that file.
