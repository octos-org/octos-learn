/** Authored masks and attachment geometry for the upright Star Fox portrait.
 * Coordinates describe this drawing, not a generic automatic segmentation. */
export type PartPoint=[number,number];
export interface HairPartSpec {
  id:'hair'|'leftHair'|'forelock';
  path:string;
  chain:readonly[PartPoint,PartPoint,PartPoint];
  angles:readonly[number,number];
  box:readonly[number,number,number,number];
  output:readonly[number,number,number,number];
}
export const STAR_FOX_RIGHT_EAR={
  root:[524,307] as PartPoint,
  attachment:[[451,177],[473,190],[493,205],[510,226],[527,249],[542,271],[560,294],[592,316]] as PartPoint[],
  path:'M578 78 C600 121 615 183 608 239 C608 277 594 310 565 321 L533 302 C530 265 517 231 485 200 L440 172 C483 135 534 99 578 78 Z',
  fullPath:'M574 85 C599 133 609 208 597 265 C589 308 569 331 519 335 C478 337 441 323 436 294 C423 243 434 209 454 177 C499 141 541 105 574 85 Z',
  foreground:'M451 177 C474 188 493 203 509 225 C526 247 539 272 552 291 C564 307 582 315 597 316 L606 335 L414 335 L397 150 C419 150 436 165 451 177 Z',
};
export const STAR_FOX_HAIR:readonly HairPartSpec[]=[
  {id:'hair',path:'M510 326 C519 343 534 356 550 362 C568 371 585 365 592 352 C587 371 573 378 556 379 C535 381 517 366 507 350 Z',
    chain:[[513,330],[546,360],[584,359]],angles:[.12,.36],box:[500,305,96,88],output:[480,290,140,130]},
  {id:'leftHair',path:'M238 350 C222 373 197 399 162 404 C145 408 130 404 120 394 C124 402 145 406 171 409 C202 411 228 394 245 376 Z',
    chain:[[237,365],[193,402],[132,404]],angles:[.07,.2],box:[112,340,144,88],output:[90,320,195,140]},
  {id:'forelock',path:'M390 239 C408 253 412 280 405 305 C394 337 371 365 337 379 C365 354 377 332 379 303 C382 277 377 254 390 239 Z',
    chain:[[391,248],[394,305],[345,373]],angles:[.035,.09],box:[328,230,94,160],output:[310,215,130,190]},
];
