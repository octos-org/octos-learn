# 原画表情素材生成记录

日期：2026-11-02。工具：内置 image_gen，使用本地 `concept-thinking.png` 作编辑目标，透明输出。原始基础 PNG 本身未改动。两张输出都已复制进项目 `public/teach-avatars/star-fox/original-v0.1/`；运行时只读取局部切片。

## expressions.png 最终提示词

```text
Use case: precise-object-edit.
Edit target: the attached original high-detail star fox illustration. Preserve the original painted/anime illustration EXACTLY: identical pose, head tilt, swept orange hair strands, fur detail, rich amber eyes styling, navy constellation-embroidered robes, hand at chin, wand, lighting, linework, crop, transparency and scale. Do NOT simplify, redesign, stylize into flat cartoon, change proportions, add new objects, or change the background.
Change ONLY these facial expression details:
1. Close both eyes in a gentle natural blink, keeping the same eye positions and the same slanted facial perspective. Draw the eyelids and eyelashes with the SAME fine painterly detail as the original. The closed lids cover the irises completely. Keep the eyebrows and surrounding fur in the same locations.
2. Open the fox's existing small mouth into a modest mid-speech opening, following its original tilted lip line. Preserve the upper-lip position. Add a small dark oral interior and subtle tongue, matching the painting's rendering; no huge mouth, no exaggerated grin, no teeth bar.
Everything outside those tiny eye and mouth regions must remain unchanged. Maintain the exact original image's dimensions and alignment. Return ONE complete edited character, on genuinely transparent background, no grid, no text, no new frame.
This edited image supplies local blink and mouth patches for animating the unmodified original image; it is crucial that facial features stay aligned.
```

## clean.png 最终提示词

```text
Use case: precise-object-edit.
The input is the exact ORIGINAL star fox painting we are animating. Produce a clean facial underpainting from this SAME image. Preserve the exact character, pose, composition, dimensions, original head tilt, every hair strand, nose, ears, hand at chin, academy robe, embroidered stars, wand, lighting, colors, background transparency and rendering.
Change ONLY the following tiny facial regions: remove the eyes, eyelashes and eyebrows, and remove the small mouth line. Seamlessly replace those marks with the original soft cream-colored fur/skin shading. Keep the nose intact. Do not change face shape, proportions, hair silhouette, facial angle or any other pixels outside the marks. No eye sockets, closed eye lines, replacement features, blurred rectangular patches or placeholder dots. The result should be the original painting with a naturally blank eye/brow/mouth area ready for overlaying the ORIGINAL painted facial feature layers. Retain all fine painted texture and lighting. Do NOT redesign in any other style or reduce detail. Same resolution/alignment as input, ONE character, transparent background, no labels.
```
