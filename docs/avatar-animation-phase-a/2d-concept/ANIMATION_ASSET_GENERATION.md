# 二维动画底稿生成记录

日期：2026-11-02。使用内置 image_gen，编辑/身份参考流程；透明输出。参考图：`star-fox-expression-direction-v1.png`。最终文件：`public/teach-avatars/star-fox/illustrated-v0.1/base.png`。1199×1312 RGBA，底稿仅保留鼻子，没有眼睛/眉毛/嘴巴；这些部件由程序独立绘制。生成结果已检查透明边缘与姿态，当前效果见实际渲染导出。

最终提示词：

```text
Use case: precise-object-edit.
Asset type: transparent production base illustration for a 2D speaking fox character, not an expression sheet.
Input image is a style and identity reference sheet. Recreate ONLY the first (leftmost, neutral) fox as ONE front-facing bust, centered on a genuinely TRANSPARENT background. Preserve its appealing flat hand-inked illustrated look, orange swept forelock, pointed ears, cream muzzle and cheeks, small brown triangular nose, navy cape, ivory mandarin-collar shirt and single gold star badge. Preserve the exact character identity, friendly head silhouette and warm outlines. Fine very subtle gouache grain, no paper backdrop. All ear tips and full shoulder silhouette in frame, clean alpha edges; cut the bust neatly at the lower chest.
CRITICAL production separation: the cream/ivory face must be a clean blank facial base. Omit BOTH EYES, EYELASHES, EYEBROWS and MOUTH entirely. Keep the nose intact. Do not draw closed eyes, empty eye sockets, smile lines, placeholder marks or eye shadows. Leave the upper cream face around both eyes clean so our program can draw animated eyes and eyebrows there. Leave a clean cream muzzle below the nose so our program can draw animated mouth shapes. Keep the orange fur and hair framing the face; do not let hair obscure the future eye areas. Face directly forward, symmetric relaxed pose, both paws out of frame. No hand gestures. No weapons or wand. Make a short simple cream neck visible between chin and shirt collar, for a small independent head tilt.
ONE character only, not a grid, no extra pieces, no facial features floating separately, no text, no labels, no background color, no floor shadow. Large usable centered character occupying most of image height with about 5% transparent padding. Clearly 2D drawn art, never 3D/toy/plastic shading.
```
