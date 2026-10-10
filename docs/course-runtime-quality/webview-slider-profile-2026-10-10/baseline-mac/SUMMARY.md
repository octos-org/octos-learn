# Slider drag profile

base http://127.0.0.1:5187, viewport 1440x900, 90 steps out and back

## linear-intro-and-slope (CPU x1)
cards {"plot":1,"math":1,"note":1}; slider input events 91; drag 2287ms
frame interval p50 8.3ms / p90 9.2ms / max 125.79999999999927ms; long tasks 0 (0ms total, max 0ms)
layout 276x 0.029s, style recalc 203x 0.041s, script 0.171s

CPU active 464ms. Inclusive time by bucket (ms; buckets overlap):
- React commit/render: 155
- BoardView.render: 91
- BoardView.syncNodes: 80
- updatePlotExplorer: 27
- getBoundingClientRect/offset*/scrollHeight: 25
- applyManualVariable: 23
- persist / checkpoint: 18
- IndexedDB write: 13
- computeBoardLayout: 5
- measureVisualRegionBounds/measureBoardNodeBounds: 4
- positionNodes/syncGroups/renderConnections: 3
- structuredClone (runtime/player snapshots): 2

Top self time:
- 208.9ms (program) :0
- 49.8ms syncNodes board-view.js:2093
- 24.3ms get offsetWidth :0
- 6.9ms (garbage collector) :0
- 4.9ms get snapshot index.js:196
- 4.9ms get canonicalEvents index.js:191
- 4.4ms remove :0
- 4.3ms save learning-document-store.ts:153
- 3.6ms LearningWorkspace learning-workspace.tsx:316
- 3.5ms fingerprintEvents index.js:12
- 3.4ms (anonymous) plot.js:150
- 3.3ms querySelectorAll :0

## linear-intro-and-slope (CPU x4)
cards {"plot":1,"math":1,"note":1}; slider input events 91; drag 2444ms
frame interval p50 8.3ms / p90 9.2ms / max 549.2999999999993ms; long tasks 0 (0ms total, max 0ms)
layout 275x 0.104s, style recalc 204x 0.143s, script 0.631s

CPU active 1727ms. Inclusive time by bucket (ms; buckets overlap):
- React commit/render: 597
- BoardView.render: 339
- BoardView.syncNodes: 300
- updatePlotExplorer: 103
- applyManualVariable: 78
- getBoundingClientRect/offset*/scrollHeight: 74
- persist / checkpoint: 60
- IndexedDB write: 50
- measureVisualRegionBounds/measureBoardNodeBounds: 23
- computeBoardLayout: 18
- positionNodes/syncGroups/renderConnections: 13
- structuredClone (runtime/player snapshots): 5

Top self time:
- 824.4ms (program) :0
- 184.7ms syncNodes board-view.js:2093
- 71.4ms get offsetWidth :0
- 18.2ms get snapshot index.js:196
- 15.9ms LearningWhiteboard oll-lesson-runtime.tsx:435
- 15.7ms save learning-document-store.ts:153
- 15.2ms querySelectorAll :0
- 14.8ms get canonicalEvents index.js:191
- 14.2ms remove :0
- 13.7ms renderedWorldRect oll-lesson-runtime.tsx:184
- 11.5ms (anonymous) plot.js:150
- 10.7ms fingerprintEvents index.js:12

## slope-and-intercept (CPU x1)
cards {"plot":1,"math":3,"note":1}; slider input events 91; drag 2282ms
frame interval p50 8.3ms / p90 9.1ms / max 116.60000000000036ms; long tasks 0 (0ms total, max 0ms)
layout 277x 0.03s, style recalc 203x 0.039s, script 0.188s

CPU active 486ms. Inclusive time by bucket (ms; buckets overlap):
- React commit/render: 168
- BoardView.render: 94
- BoardView.syncNodes: 84
- updatePlotExplorer: 30
- applyManualVariable: 28
- persist / checkpoint: 22
- getBoundingClientRect/offset*/scrollHeight: 21
- IndexedDB write: 19
- measureVisualRegionBounds/measureBoardNodeBounds: 7
- computeBoardLayout: 5
- positionNodes/syncGroups/renderConnections: 4
- structuredClone (runtime/player snapshots): 3

Top self time:
- 218.6ms (program) :0
- 50.3ms syncNodes board-view.js:2093
- 20.8ms get offsetWidth :0
- 8ms get snapshot index.js:196
- 6.6ms save learning-document-store.ts:153
- 5.6ms (anonymous) plot.js:150
- 5.5ms remove :0
- 4.6ms querySelectorAll :0
- 4.5ms get canonicalEvents index.js:191
- 4.2ms fingerprintEvents index.js:12
- 3.9ms (garbage collector) :0
- 3.8ms LearningWhiteboard oll-lesson-runtime.tsx:435

## slope-and-intercept (CPU x4)
cards {"plot":1,"math":3,"note":1}; slider input events 91; drag 2529ms
frame interval p50 8.3ms / p90 9.1ms / max 549.8999999999996ms; long tasks 0 (0ms total, max 0ms)
layout 277x 0.117s, style recalc 205x 0.135s, script 0.703s

CPU active 1847ms. Inclusive time by bucket (ms; buckets overlap):
- React commit/render: 659
- BoardView.render: 366
- BoardView.syncNodes: 332
- updatePlotExplorer: 111
- applyManualVariable: 99
- persist / checkpoint: 76
- IndexedDB write: 71
- getBoundingClientRect/offset*/scrollHeight: 62
- measureVisualRegionBounds/measureBoardNodeBounds: 24
- computeBoardLayout: 18
- structuredClone (runtime/player snapshots): 6
- positionNodes/syncGroups/renderConnections: 6

Top self time:
- 854.7ms (program) :0
- 208.5ms syncNodes board-view.js:2093
- 61.8ms get offsetWidth :0
- 24.3ms get snapshot index.js:196
- 23.2ms save learning-document-store.ts:153
- 17.5ms remove :0
- 17.2ms setRegionLayouts board-view.js:1875
- 16.4ms fingerprintEvents index.js:12
- 16.4ms get canonicalEvents index.js:191
- 16.3ms querySelectorAll :0
- 16.1ms renderedWorldRect oll-lesson-runtime.tsx:184
- 16.1ms write learning-document-store.ts:98

## linear-simultaneous-intersections (CPU x1)
no slider on the final board

## linear-simultaneous-intersections (CPU x4)
no slider on the final board

## trig-unit-circle-to-sine (CPU x1)
cards {"geometry":1,"plot":1,"math":2,"note":2}; slider input events 91; drag 2284ms
frame interval p50 8.3ms / p90 9.1ms / max 133.29999999999927ms; long tasks 0 (0ms total, max 0ms)
layout 288x 0.034s, style recalc 215x 0.03s, script 0.205s

CPU active 520ms. Inclusive time by bucket (ms; buckets overlap):
- React commit/render: 175
- BoardView.render: 102
- BoardView.syncNodes: 85
- applyManualVariable: 32
- getBoundingClientRect/offset*/scrollHeight: 22
- persist / checkpoint: 22
- IndexedDB write: 19
- updatePlotExplorer: 14
- measureVisualRegionBounds/measureBoardNodeBounds: 8
- positionNodes/syncGroups/renderConnections: 7
- computeBoardLayout: 6
- structuredClone (runtime/player snapshots): 2

Top self time:
- 238ms (program) :0
- 43.8ms syncNodes board-view.js:2093
- 21.6ms get offsetWidth :0
- 9.5ms get snapshot index.js:196
- 6.2ms (garbage collector) :0
- 6ms save learning-document-store.ts:153
- 4.8ms querySelectorAll :0
- 4.8ms write learning-document-store.ts:98
- 4.5ms get canonicalEvents index.js:191
- 4.3ms setLessonVariables index.js:1788
- 4.3ms replaceChildren :0
- 4.1ms setAttribute :0

## trig-unit-circle-to-sine (CPU x4)
cards {"geometry":1,"plot":1,"math":2,"note":2}; slider input events 91; drag 2692ms
frame interval p50 8.3ms / p90 9.1ms / max 550.7999999999993ms; long tasks 0 (0ms total, max 0ms)
layout 276x 0.141s, style recalc 205x 0.113s, script 0.813s

CPU active 1988ms. Inclusive time by bucket (ms; buckets overlap):
- React commit/render: 736
- BoardView.render: 424
- BoardView.syncNodes: 365
- applyManualVariable: 127
- persist / checkpoint: 92
- getBoundingClientRect/offset*/scrollHeight: 79
- IndexedDB write: 72
- updatePlotExplorer: 65
- measureVisualRegionBounds/measureBoardNodeBounds: 33
- positionNodes/syncGroups/renderConnections: 26
- computeBoardLayout: 17
- structuredClone (runtime/player snapshots): 10

Top self time:
- 883.8ms (program) :0
- 186.5ms syncNodes board-view.js:2093
- 75.9ms get offsetWidth :0
- 39.1ms get snapshot index.js:196
- 28.2ms save learning-document-store.ts:153
- 26.3ms replaceChildren :0
- 22.7ms renderedWorldRect oll-lesson-runtime.tsx:184
- 21.4ms LearningWhiteboard oll-lesson-runtime.tsx:435
- 21ms setAttribute :0
- 18.5ms write learning-document-store.ts:98
- 18.3ms setLessonVariables index.js:1788
- 16.9ms (anonymous) plot.js:150

## trig-cosine-and-phase-shift (CPU x1)
cards {"geometry":1,"plot":2,"math":3,"note":2}; slider input events 91; drag 2285ms
frame interval p50 8.3ms / p90 9.1ms / max 133.3000000000011ms; long tasks 0 (0ms total, max 0ms)
layout 286x 0.035s, style recalc 211x 0.045s, script 0.211s

CPU active 544ms. Inclusive time by bucket (ms; buckets overlap):
- React commit/render: 176
- BoardView.render: 101
- BoardView.syncNodes: 83
- getBoundingClientRect/offset*/scrollHeight: 38
- applyManualVariable: 38
- persist / checkpoint: 26
- IndexedDB write: 21
- updatePlotExplorer: 12
- computeBoardLayout: 7
- measureVisualRegionBounds/measureBoardNodeBounds: 7
- positionNodes/syncGroups/renderConnections: 6
- structuredClone (runtime/player snapshots): 2

Top self time:
- 243ms (program) :0
- 43.7ms syncNodes board-view.js:2093
- 37.2ms get offsetWidth :0
- 12.8ms get snapshot index.js:196
- 7.5ms save learning-document-store.ts:153
- 6.4ms setLessonVariables index.js:1788
- 5.9ms (garbage collector) :0
- 5.8ms write learning-document-store.ts:98
- 5.5ms get canonicalEvents index.js:191
- 5.1ms renderedWorldRect oll-lesson-runtime.tsx:184
- 4.5ms fingerprintEvents index.js:12
- 4.1ms setAttribute :0

## trig-cosine-and-phase-shift (CPU x4)
cards {"geometry":1,"plot":2,"math":3,"note":2}; slider input events 91; drag 2743ms
frame interval p50 8.3ms / p90 9.2ms / max 566.7000000000007ms; long tasks 0 (0ms total, max 0ms)
layout 275x 0.134s, style recalc 204x 0.173s, script 0.852s

CPU active 2161ms. Inclusive time by bucket (ms; buckets overlap):
- React commit/render: 733
- BoardView.render: 422
- BoardView.syncNodes: 353
- applyManualVariable: 146
- getBoundingClientRect/offset*/scrollHeight: 135
- persist / checkpoint: 103
- IndexedDB write: 89
- updatePlotExplorer: 63
- measureVisualRegionBounds/measureBoardNodeBounds: 39
- positionNodes/syncGroups/renderConnections: 25
- computeBoardLayout: 19
- structuredClone (runtime/player snapshots): 8

Top self time:
- 958.8ms (program) :0
- 184.4ms syncNodes board-view.js:2093
- 130.8ms get offsetWidth :0
- 43.9ms get snapshot index.js:196
- 31.3ms save learning-document-store.ts:153
- 29.9ms renderedWorldRect oll-lesson-runtime.tsx:184
- 27.8ms write learning-document-store.ts:98
- 24.6ms querySelectorAll :0
- 20.1ms get canonicalEvents index.js:191
- 19.7ms (garbage collector) :0
- 18.5ms setAttribute :0
- 17.7ms replaceChildren :0

## trig-quadrants-and-monotonicity (CPU x1)
cards {"geometry":1,"plot":1,"note":1,"math":5}; slider input events 91; drag 2281ms
frame interval p50 8.3ms / p90 9ms / max 124.89999999999964ms; long tasks 0 (0ms total, max 0ms)
layout 276x 0.033s, style recalc 202x 0.029s, script 0.212s

CPU active 536ms. Inclusive time by bucket (ms; buckets overlap):
- React commit/render: 178
- BoardView.render: 101
- BoardView.syncNodes: 84
- applyManualVariable: 37
- persist / checkpoint: 26
- getBoundingClientRect/offset*/scrollHeight: 22
- IndexedDB write: 19
- updatePlotExplorer: 15
- computeBoardLayout: 8
- measureVisualRegionBounds/measureBoardNodeBounds: 8
- positionNodes/syncGroups/renderConnections: 5
- structuredClone (runtime/player snapshots): 3

Top self time:
- 248.6ms (program) :0
- 43.1ms syncNodes board-view.js:2093
- 21.3ms get offsetWidth :0
- 10.2ms get snapshot index.js:196
- 10.2ms querySelectorAll :0
- 9.1ms write learning-document-store.ts:98
- 6.4ms (garbage collector) :0
- 5.5ms replaceChildren :0
- 5.3ms get canonicalEvents index.js:191
- 5ms save learning-document-store.ts:153
- 4ms setVariable index.js:332
- 3.4ms drawGeometry board-view.js:745

## trig-quadrants-and-monotonicity (CPU x4)
cards {"geometry":1,"plot":1,"note":1,"math":5}; slider input events 91; drag 2756ms
frame interval p50 8.3ms / p90 9.2ms / max 557.4000000000015ms; long tasks 0 (0ms total, max 0ms)
layout 277x 0.14s, style recalc 205x 0.112s, script 0.859s

CPU active 2125ms. Inclusive time by bucket (ms; buckets overlap):
- React commit/render: 748
- BoardView.render: 423
- BoardView.syncNodes: 354
- applyManualVariable: 143
- persist / checkpoint: 99
- getBoundingClientRect/offset*/scrollHeight: 79
- IndexedDB write: 74
- updatePlotExplorer: 62
- measureVisualRegionBounds/measureBoardNodeBounds: 39
- positionNodes/syncGroups/renderConnections: 31
- computeBoardLayout: 22
- structuredClone (runtime/player snapshots): 8

Top self time:
- 969.9ms (program) :0
- 179.5ms syncNodes board-view.js:2093
- 77.1ms get offsetWidth :0
- 46.2ms get snapshot index.js:196
- 41.2ms querySelectorAll :0
- 26ms save learning-document-store.ts:153
- 22.9ms LearningWhiteboard oll-lesson-runtime.tsx:435
- 22.2ms setAttribute :0
- 21.3ms write learning-document-store.ts:98
- 20.6ms (garbage collector) :0
- 20.2ms get canonicalEvents index.js:191
- 20.2ms renderedWorldRect oll-lesson-runtime.tsx:184

## surface-paraboloid-level-sets (CPU x1)
cards {"note":1,"scene3d":1,"geometry":1,"math":2}; slider input events 91; drag 2282ms
frame interval p50 8.3ms / p90 9.1ms / max 133.5ms; long tasks 0 (0ms total, max 0ms)
layout 184x 0.027s, style recalc 110x 0.053s, script 0.193s

CPU active 511ms. Inclusive time by bucket (ms; buckets overlap):
- React commit/render: 129
- getBoundingClientRect/offset*/scrollHeight: 81
- BoardView.render: 63
- BoardView.syncNodes: 52
- applyManualVariable: 26
- updateScene3d: 23
- persist / checkpoint: 20
- IndexedDB write: 15
- measureVisualRegionBounds/measureBoardNodeBounds: 6
- computeBoardLayout: 5
- structuredClone (runtime/player snapshots): 2
- positionNodes/syncGroups/renderConnections: 2

Top self time:
- 222.9ms (program) :0
- 80.1ms get offsetWidth :0
- 7.5ms (garbage collector) :0
- 5.8ms meshPlaneSegments scene3d.js:383
- 5.4ms get snapshot index.js:196
- 5.3ms querySelectorAll :0
- 5ms save learning-document-store.ts:153
- 4.6ms setAttribute :0
- 4.3ms get canonicalEvents index.js:191
- 4.1ms replaceChildren :0
- 3.9ms fingerprintEvents index.js:12
- 3.8ms tick :5

## surface-paraboloid-level-sets (CPU x4)
cards {"note":1,"scene3d":1,"geometry":1,"math":2}; slider input events 91; drag 2576ms
frame interval p50 8.3ms / p90 9.2ms / max 575.2000000000007ms; long tasks 0 (0ms total, max 0ms)
layout 185x 0.116s, style recalc 113x 0.206s, script 0.797s

CPU active 2071ms. Inclusive time by bucket (ms; buckets overlap):
- React commit/render: 556
- getBoundingClientRect/offset*/scrollHeight: 315
- BoardView.render: 272
- BoardView.syncNodes: 220
- applyManualVariable: 110
- updateScene3d: 99
- persist / checkpoint: 82
- IndexedDB write: 63
- measureVisualRegionBounds/measureBoardNodeBounds: 36
- computeBoardLayout: 28
- positionNodes/syncGroups/renderConnections: 12
- structuredClone (runtime/player snapshots): 9

Top self time:
- 912.6ms (program) :0
- 311ms get offsetWidth :0
- 30.1ms meshPlaneSegments scene3d.js:383
- 27.5ms querySelectorAll :0
- 22.3ms fingerprintEvents index.js:12
- 20.7ms (garbage collector) :0
- 20.5ms replaceChildren :0
- 19.2ms write learning-document-store.ts:98
- 18.9ms get snapshot index.js:196
- 18.6ms save learning-document-store.ts:153
- 16ms LearningWorkspace learning-workspace.tsx:316
- 14.2ms get canonicalEvents index.js:191

## surface-partial-derivative-slice (CPU x1)
cards {"math":4,"scene3d":1,"note":3,"plot":1}; slider input events 91; drag 2285ms
frame interval p50 8.3ms / p90 9.2ms / max 133.20000000000073ms; long tasks 0 (0ms total, max 0ms)
layout 185x 0.017s, style recalc 110x 0.018s, script 0.198s

CPU active 474ms. Inclusive time by bucket (ms; buckets overlap):
- React commit/render: 124
- BoardView.render: 50
- BoardView.syncNodes: 37
- getBoundingClientRect/offset*/scrollHeight: 35
- applyManualVariable: 31
- updateScene3d: 23
- persist / checkpoint: 23
- IndexedDB write: 18
- measureVisualRegionBounds/measureBoardNodeBounds: 7
- computeBoardLayout: 6
- positionNodes/syncGroups/renderConnections: 4
- structuredClone (runtime/player snapshots): 3

Top self time:
- 231.6ms (program) :0
- 34.9ms get offsetWidth :0
- 8.7ms get snapshot index.js:196
- 5.3ms write learning-document-store.ts:98
- 5.3ms renderedWorldRect oll-lesson-runtime.tsx:184
- 5.3ms save learning-document-store.ts:153
- 5.1ms tick :5
- 5ms fingerprintEvents index.js:12
- 4.6ms querySelectorAll :0
- 4.3ms remove :0
- 4.3ms (garbage collector) :0
- 3.9ms LearningWhiteboard oll-lesson-runtime.tsx:435

## surface-partial-derivative-slice (CPU x4)
cards {"math":4,"scene3d":1,"note":3,"plot":1}; slider input events 91; drag 2587ms
frame interval p50 8.3ms / p90 9.2ms / max 557.5ms; long tasks 0 (0ms total, max 0ms)
layout 185x 0.064s, style recalc 114x 0.062s, script 0.74s

CPU active 1773ms. Inclusive time by bucket (ms; buckets overlap):
- React commit/render: 496
- BoardView.render: 208
- BoardView.syncNodes: 157
- getBoundingClientRect/offset*/scrollHeight: 122
- applyManualVariable: 104
- updateScene3d: 102
- persist / checkpoint: 72
- IndexedDB write: 69
- measureVisualRegionBounds/measureBoardNodeBounds: 34
- computeBoardLayout: 22
- positionNodes/syncGroups/renderConnections: 16
- structuredClone (runtime/player snapshots): 8

Top self time:
- 871.2ms (program) :0
- 120.6ms get offsetWidth :0
- 34.6ms querySelectorAll :0
- 32.1ms get snapshot index.js:196
- 21.9ms renderedWorldRect oll-lesson-runtime.tsx:184
- 20.6ms save learning-document-store.ts:153
- 19.2ms remove :0
- 18.8ms meshPlaneSegments scene3d.js:383
- 16.7ms LearningWhiteboard oll-lesson-runtime.tsx:435
- 14.8ms write learning-document-store.ts:98
- 13.8ms get canonicalEvents index.js:191
- 13.8ms (anonymous) learning-document-store.ts:104

## surface-saddle-point-analysis (CPU x1)
no slider on the final board

## surface-saddle-point-analysis (CPU x4)
no slider on the final board
