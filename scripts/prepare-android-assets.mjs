// Prepare APK content without mutating browser VAD files in public/.
// finalize-android-assets removes browser-only assets from the APK output.
import "./copy-course-pack-assets.mjs";

import "./prepare-embedded-course-assets.mjs";
