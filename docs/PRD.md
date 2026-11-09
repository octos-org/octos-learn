# Octos Learn Product Requirements Document (PRD)

| Document Version | Date | Status | Target Scope |
| :--- | :--- | :--- | :--- |
| v2.1 | November 2026 | Approved Revision | Web, Android Touch Displays/Tablets, Server & Engine |

---

## 1. Product Vision and Core Positioning

### 1.1 Background and Vision
In a real-world classroom, a single teacher often has to manage dozens of students at once. Due to limited classroom time and attention, it is nearly impossible to cater to each student's unique learning pace, comprehension level, and personal learning preferences. When children encounter stumbling blocks after school, they frequently lack immediate, patient, and tailored guidance.

**Octos Learn is an intelligent AI teacher—highly capable, full of personality, and always available—designed as an essential companion outside the traditional classroom.**

By combining 24/7 AI availability with deep pedagogical comprehension, Octos Learn ensures that whenever students face an intellectual bottleneck, a patient and skilled teacher with a distinct personality is right by their side to guide their thinking, encourage exploration, and help them achieve true mastery.

### 1.2 Four Pillars of Learning Support
To inspire children's intrinsic motivation and guarantee genuine learning outcomes, Octos Learn builds its educational experience across four core dimensions:

1. **Distinct Virtual AI Teachers with Rich Personalities**  
   Moving beyond sterile, generic chatbots, Octos Learn provides an ensemble of virtual educators. Each teacher features an independent backstory, high-quality character art, a signature voice, and chibi avatars. Different teachers embody different instructional styles (e.g., warm and encouraging, rigorously logical, or exploratory/inquiry-based), allowing children to choose the mentor they connect with best.
2. **Exploration via the Knowledge Graph**  
   Knowledge is not a collection of isolated test questions; it is an interconnected web. Octos Learn offers an end-to-end discipline knowledge graph. Starting from any point of interest or difficulty, students can clearly trace both prerequisites ("What should I know before learning this?") and downstream concepts ("What exciting topics does this unlock?"), helping them construct a structured, holistic mental model.
3. **Instant Positive Feedback and Recognition**  
   Every question asked, concept understood, and practice completed leaves a tangible mark of growth. By lighting up Star Atlas nodes, earning milestone achievements, and unlocking unique titles, the platform continually reinforces the child's curiosity, confidence, and sense of accomplishment.
4. **The Feynman Technique: "Learning by Teaching"**  
   There is a profound gap between passively listening and truly understanding. Octos Learn provides an accessible Studio where learners step onto the podium themselves. By organizing blackboard notes, structuring ideas, and explaining concepts in their own words to create micro-lessons, students deeply synthesize and cement their knowledge.

---

## 2. Core Curriculum System

All instructional content in Octos Learn centers around **whiteboard dynamic visual interactions, progressive handwriting chalkboard notes, and synchronized voice narration**, organized into three primary course types:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Octos Learn Course System                          │
├──────────────────────────┬──────────────────────────┬───────────────────────┤
│ 1. Auto-Generated        │ 2. Pre-Generated         │ 3. Student-Recorded   │
│    Lessons               │    Curated Lessons       │    Lessons            │
│ - On-demand for real-time│ - Systematically mapped  │ - Feynman Technique in│
│   questions and blockers │   across Knowledge Graph │   practice            │
│ - Instant intent parsing │ - Manually reviewed for  │ - Teach Studio + 2D   │
│   and OLL compilation    │   pedagogical rigor      │   avatar performance  │
│ - Powered by interactive │ - Underpinned by the same│ - Offline packages &  │
│   runtime components     │   interactive runtime    │   future community    │
└──────────────────────────┴──────────────────────────┴───────────────────────┘
```

1. **Auto-Generated Lessons**  
   * **Mechanism**: When students ask any math or science question via handwriting, snapshots, voice, or text, the AI teacher instantly interprets the intent, plans a multi-step lesson, and compiles an interactive micro-lesson on the fly.
   * **Underlying Interactive Components**: Powered by the self-developed OLL (Octos Lesson Language) runtime, lessons feature dynamic interactive components (coordinate plots, draggable parameter sliders, 2D/3D geometric transformations). Currently focused on K–12 mathematics, with upcoming expansion into physics, chemistry, and other subjects.
2. **Pre-Generated Curated Lessons (CoursePack)**  
   * **Systematic Coverage**: A library of standardized courses mapped directly across the knowledge graph, systematically covering essential curriculum standards.
   * **Pedagogical Review**: Carefully curated, scripted, and verified by expert educators to guarantee instructional clarity and mathematical rigor.
   * **Shared Underlying Architecture**: Pre-generated lessons share the exact same underlying data structures, player protocols, and interactive components as auto-generated lessons, delivering the identical dynamic interactive experience.
3. **Student-Recorded Lessons (Learner Teaching Studio)**  
   * **Creation and Consolidation**: Students prepare their lessons in the Teach Studio, using blackboard drawing tools, formula cleanup, and AI assistant feedback to explain and record their own work.
   * **Expressive Virtual Personas**: Students choose 2D hand-painted avatars (e.g., Star Fox, Red Panda) animated by real-time camera tracking and voiced by synthesized audio personas.
   * **Community Sharing Vision**: Beyond saving lessons in "My Lessons" for personal review, recorded lesson packs will be publishable to a student learning community for peer viewing, appreciation, and collaborative discussion.

---

## 3. Detailed Functional Requirements

### 3.1 Virtual AI Teachers and Personalized Mentorship
* **Character Realization**: Each teacher has a complete character dossier (portrait illustration, backstory, catchphrases, chibi bust, and avatars).
* **Instructional Styles and Signature Voices**:
  * Teachers communicate in distinct vocal tones and pedagogical registers (e.g., patient and nurturing, analytical and rigorous).
  * High-fidelity signature voices provide a consistent, recognizable companion experience across all lectures and feedback.
* **Seamless Teacher Switching**: Students can change their active teacher in the Academy Hall or on the canvas at any time. Subsequent lessons and comments immediately reflect the chosen teacher's personality and voice.

### 3.2 Knowledge Graph and the Star Atlas
* **Bidirectional Concept Mapping**:
  * **Prerequisites**: Clicking any topic node surfaces upstream foundations, revealing what prior concepts need strengthening.
  * **Next Steps**: Highlights downstream extensions and advanced branches unlocked by mastering the current topic.
* **Visual Star Atlas Node States**:
  * Listening to a lesson lights up the node's "Explored" ring.
  * Completing follow-up practice elevates the node to an active "Practiced" or "Mastered" status.
  * Recording and publishing an original lesson lights up a distinctive outer "Taught" badge.

### 3.3 Interactive Whiteboard and OLL Runtime
* **Dynamic Visuals and Controls**:
  * **Coordinate Systems and Curves**: Dynamic Cartesian axes with zooming, supporting smooth plotting of linear, quadratic, polynomial, and trigonometric curves.
  * **Interactive Sliders**: Embedded draggable sliders update geometric and functional graphs in real time (e.g., observing vertex shifts as coefficients change).
  * **Geometric Primitives**: Support for points, lines, polygons, unit circles, and 3D perspective projections (e.g., rectangular prisms).
* **Synchronized Board Writing and Voice**: Handwriting appears stroke by stroke in lockstep with spoken audio, recreating the authentic cadence of a teacher writing on a blackboard.
* **Step-by-Step Delivery and Pause-and-Explore**: Lessons play in logical cards/steps. Students can pause at any second to drag sliders, inspect figures, and test hypotheses before resuming playback.

### 3.4 Teach Studio (`/teach`)
The creative workspace where students practice the Feynman Technique, structured across planning, recording, checking, and packaging:

1. **Lesson Preparation (Teach Plan)**:
   * The learner enters the topic and target learning outcome.
   * Automatically organizes into a default 4-card structure (Introduction, Concept Deduction, Key Example, Practice Challenge), with full card reordering and editing.
2. **Recording Workbench & Tool Dock**:
   * **Inking Tools**: Pencil, highlighter, eraser, and trailing laser pointer.
   * **Handwriting to LaTeX**: Lasso messy handwritten math to convert it into clean, typeset LaTeX formulas with one click.
   * **Quick Math Insertions**: Instant insertion of coordinate planes, function graphs, unit circles, 3D prisms, and lines through two points.
   * **Structured Placement ("Place beside...")**: Automatically snaps newly inserted components beside current work in clean row layouts, preventing overlaps.
3. **Card-by-Card Recording and Forgiving Controls**:
   * Record cards one by one with live speech-to-text captions.
   * Review and edit captions after recording each card.
   * **Re-record my voice**: Keeps all whiteboard drawings, math insertions, and camera gestures while wiping and re-recording only voice narration and laser points.
   * **Start card over / Undo**: Quick undo (⌘Z) or complete card resets at any point.
4. **AI Assistant Review ("Check My Lesson")**:
   * **Readability Audit**: Automatically simulates layouts on standard screen resolutions (1366×768 and 1920×1080) to ensure font sizes remain clear (≥ 12.5 px) and flags clipped elements.
   * **Little Octopus Coach Feedback**: Evaluates student pacing and blackboard clarity to offer encouraging advice and recap suggestions.
   * **Basic Privacy Safeguard**: Scans captions and board text to warn against accidentally sharing personal phone numbers, addresses, or full real names.

### 3.5 2D Avatars and Camera Performance Capture
* **Character Lineup**: Four hand-painted 2D storybook avatars: **Star Fox, Red Panda, White Rabbit, and Moon Cat**.
* **On-Device Facial and Head Tracking**:
  * Toggle "Animate my avatar with camera" during recording.
  * Real-time vision algorithms extract facial expressions and head orientations (mouth opening, smiling, blinking, head tilt/yaw, ear rotation, and hair movement).
  * Processes feature parameters ephemerally on-device; raw camera frames are never uploaded to servers.
* **Audio Synthesis and Multitrack Retiming**:
  * Students choose a preferred virtual teacher voice for narration.
  * During package generation, recorded head motions and expressions are retimed to match the synthesized audio duration. The player blends retimed gestures with audio lip-sync for expressive virtual storytelling.

### 3.6 Motivation and Progress Reports
* **Achievement System**: Medals recognizing self-study, active interaction, and teaching accomplishments (such as the "Little Podium" badge).
* **Periodic Growth Summaries**: Automatically generates weekly and monthly summaries based on lessons viewed, exercises attempted, and micro-lessons recorded.

### 3.7 Lesson Packaging, Offline Playback, and Community Vision
* **Self-Contained Lesson Format (`.olesson`)**: Bundles teaching steps, vector strokes, math component states, synthesized audio, and avatar motion data into an offline file.
* **"My Lessons" Dashboard (`/teach/lessons`)**: Manage recorded lessons and active drafts with automatic cloud and local sync.
* **Offline Interactive Player**:
  * Plays smoothly without internet connectivity or third-party API keys.
  * Interactive components remain live: viewers can pause and manipulate graphs. Lessons conclude with an interactive "Your turn" practice card.
* **Community Roadmap**: A future "Student Lesson Community" where recorded lessons can be published to class spaces or public discovery feeds for peer playback, feedback, and likes.

---

## 4. Platform Foundations and Reliability

### 4.1 Cross-Platform Compatibility
* **Web Browsers**: Native support for modern desktop browsers (Chrome, Edge, Safari), supporting keyboard/mouse and stylus/touchscreen inputs.
* **Android Smart Displays and Tablets**:
  * Standalone APK compatible with Android 8.0 and above.
  * Tailored for interactive conference and classroom whiteboards (such as Horion displays), featuring immersive full-screen display.
  * Optimized palm rejection and multi-touch gesture processing.

### 4.2 Performance Standards
* **Inking Responsiveness**: Drawing latency below 30ms with high-refresh rate sampling, ensuring smooth, natural handwriting.
* **Generation Response**: Rapid generation and rendering of the first interactive card to eliminate blank-screen wait times.
* **Tracking Efficiency**: Camera tracking operates with a low compute footprint on standard hardware without dropping audio or frame rates.

### 4.3 Practical Usability and Security
* **Classroom Presentation Mode**: One-click toggle hides personal drafts, learning histories, and private notes when presenting on public screens.
* **Flexible Cost and Service Model**:
  * Supports BYOK (Bring Your Own Key for LLMs like Google Gemini or ByteDance Ark) for extensive self-study.
  * Platform-hosted TTS quota pools ensure a seamless, ready-to-use audio experience for standard users.

---

## 5. Product Roadmap

1. **Phase 1 (Current Core Baseline)**:
   * Virtual teachers and interactive whiteboard math components.
   * Full Knowledge Graph exploration and Star Atlas progress tracking.
   * Teach Studio, 2D avatar camera performance capture, and offline `.olesson` playback.
2. **Phase 2 (Community and Subject Expansion)**:
   * Launch the Student Lesson Community for peer discovery, comments, and practice sharing.
   * Expand interactive components to physics (kinematics, circuit diagrams) and chemistry (reaction equations).
3. **Phase 3 (Ecosystem and Advanced Modalities)**:
   * Broaden avatar variety with Live2D and 3D VRM custom character imports.
   * Touchless air-writing via distance hand gesture tracking for smart classroom screens.
