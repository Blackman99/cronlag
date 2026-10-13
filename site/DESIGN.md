# cronlag — design brief

**Reference object:** a Black Forest cuckoo clock — the carved walnut house with a pitched roof and leaf finial, the enamel dial, the little door the bird pops out of on the hour, the pendulum, and the pinecone weights on chains.

Why this object: cronlag is about *when the clock should have struck and when it actually did*. A cuckoo clock is the most physical "something happens at a scheduled time" object there is, and a late cuckoo is instantly funny and legible.

| Axis | Choice |
|---|---|
| Base tone | dark walnut `#2e1a12` (warm brown, not black/navy) |
| Palette | carve `#5a3522`, shadow `#1b0f0a`, enamel `#e9efe6`, leaf `#8fb547` (on time), coral `#e3876f` (late), raspberry `#b8405e` (>1h / missed), slate bird `#6f8fae` (links), pinecone `#9a6a3c` |
| Type | Grenze Gotisch 600/800 (carved signboard display), Alegreya Sans 400/700 (body), Spline Sans Mono 400/600 (cron strings, terminal) — all self-hosted woff2 |
| Texture | carved wood: SVG grain lines and a two-tone bevel (light top edge, dark bottom edge) on planks |
| Rendering | flat woodcarving SVG; the data view is a polar 24 h dial: one concentric ring per day, a peg at every cron slot, an arc from slot to run creation (colour = lag band), a bird mark where the run was created, hollow peg = missed |
| Layout | one centred clock house; the h1 sits on a carved plank under the dial; weights hang from the house; later sections alternate left/right along a central chain |
| Motion | pendulum swing; the hour hand sweeps once and the lag arcs grow behind it; the door opens (2D scaleX) and the bird pops out with the real lag ("+5h50"); weights drop as runs accumulate. `prefers-reduced-motion`: final state only, no swing |
| Logo | roof + leaf finial + arched door + slate bird on its perch + pinecone weight — not a rounded square; SVG + 512 PNG; favicon is the bird in the door |
| OG / social | same house, dial and plank rendered from the live page in `?og` mode (1200×630 and 1280×640) |

Banned-trope check: no dark-navy/cyan/purple gradient, no gradient text, no glow, no glass, no left-copy/right-card hero, no three-column cards, no Inter, no paper/stamp/typewriter (toolsmoke owns that).

The live check on the page is real: it bundles the CLI's analyser for the browser and queries the public GitHub API from the visitor's browser (no backend).
