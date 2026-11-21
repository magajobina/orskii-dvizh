# Декоративные схемы

Созданы встроенным ImageGen в режиме редактирования двух пользовательских референсов. Прозрачные PNG используются в интерфейсе как альфа-маски; итоговый приглушённый цвет задаётся CSS. Исходные пользовательские вложения не изменялись.

- `src/assets/decorations/da40.png`: один перспективный ракурс DA-40 по новому референсу `codex-clipboard-6f3d8b0b-5b3d-4d5b-ad04-ca10188c6e09.png`. Заменяет прежний рисунок трёх проекций.
- `src/assets/decorations/propeller.png`: схема винта по референсу `codex-clipboard-f5ae1e32-2e3c-45e3-869b-6841ec41131a.png`.

## Актуальный промпт DA-40

> Use case: precise-object-edit. Edit target: user-supplied perspective line drawing of a Diamond DA-40 airplane. Project asset: minimalist decorative technical aircraft sketch in the left gutter of a dark visual novel. Preserve the exact recognizable single three-quarter top/front perspective, proportions, low wings, cockpit canopy, landing gear, propeller and T-tail of the reference. Remove the solid white background entirely, leaving genuine transparent alpha. Clean the aircraft drawing into consistent delicate thin pale gray monochrome contour lines (#b4b8b3). No opaque white filled aircraft surfaces, no shading, no texture, no shadows, no glow. Retain just enough internal panel/canopy lines for an engineering sketch. No text, labels, letters, numbers, leaders, callout arrows, logos or border. Keep the entire airplane including both wingtips and tail within the canvas with about 5% padding. Landscape canvas matching reference. Do not add extra aircraft views or extra objects.

## Предыдущий промпт DA-40 (история)

> Use case: precise-object-edit. Edit target: attached technical drawing of a Diamond DA-40 airplane showing three orthographic views. Project asset: quiet decorative engineering linework in the side gutter of a visual novel. Preserve the recognizable aircraft geometry, proportions, and the three-view arrangement (top, side, front). Clean and redraw as crisp uniform thin pale gray lines, single monochrome color approximately #b4b8b3, on a genuinely transparent background. Keep ALL three views completely inside the canvas with 5% margin, no crop. Remove all text, lettering, numbers, labels, callout arrows, leader lines, captions, dimension annotations and background. No solid white fills, no paper, no shading, no glow, no shadows, no decorative frame. Only the aircraft technical contour and a few internal construction details, delicate minimalist draughtsmanship. Avoid adding any invented lettering or symbols. Landscape composition matching reference.

## Промпт винта

> Use case: precise-object-edit. Edit target: attached exploded technical drawing of an aircraft propeller and hub mechanism. Project asset: subtle decorative engineering linework in the side gutter of a visual novel. Preserve the original exploded mechanical arrangement, all three blades, hub, shaft, flange and visible fastening components, composition and proportions. Remove ALL Russian labels, every letter, number, caption, annotation, callout leader line, arrow, watermark and the opaque white background. Redraw remaining technical contours as clean uniform thin pale gray monochrome lines approximately #b4b8b3 on a genuinely transparent background. No filled white surfaces, no paper texture, no shading, no glow or shadows. Keep every component inside canvas with 5% margin. Keep recognizable mechanism and original three-quarter view; simplify only tiny incidental texture. No frame. Portrait composition matching reference.
