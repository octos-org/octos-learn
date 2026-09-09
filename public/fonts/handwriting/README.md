# Board handwriting font

This modified subset is named **Octos Board Handwriting**. It is derived from
[LXGW WenKai v1.522 Regular](https://github.com/lxgw/LxgwWenKai/tree/v1.522),
Copyright 2021 The LXGW WenKai Project Authors.

The font is redistributed under the SIL Open Font License 1.1 in [OFL.txt](OFL.txt).
Reserved font names have been replaced in the modified font's name table.
No separate license is applied to the font.

Upstream source: `fonts/TTF/LXGWWenKai-Regular.ttf` at tag `v1.522`.
Source SHA-256: `39ad71264b588165b469e35e6afb162a378dacd1f95348160240ba9038ac3009`.

Rebuild with `scripts/fonts/build-board-writing.py` and the upstream TTF.
The WOFF format is intentional: the outline decoder does not support WOFF2.
Font fetch, decoding, and outline layout run in a Web Worker. A build that
enables board writing advertises the negotiated ink capability immediately;
the writer queues returned content until the font is ready and reports a
visible error if preparation fails, rather than changing the result to a card.
