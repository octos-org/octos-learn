# Octos Learn release E2E checklist

Use this checklist before an Octos Learn release. The standalone extraction is
already complete; changes to the old `/learn` entry in `octos-web` remain a
separate transition task.

## Preconditions

- Run the Octos server with the product-owned `learning-coach` runtime available
  through `OCTOS_SKILLS_PATH`. Users must not be asked to install it.
- Start Octos Learn from this repository with `pnpm dev:https`.
- Confirm the selected model and API credentials in Octos Learn settings.
- Use a new learning whiteboard for the first case, then keep the same whiteboard for the multi-course case.

## 1. Text question creates a complete lesson

Submit:

> 请用单位圆解释正弦函数是怎样产生的，并让我拖动角度观察圆上的点和函数图像如何联动。

Pass when:

- the question and loading state appear in the current viewport;
- the first lesson content starts without visiting an unrelated Octos page;
- the circle point, sine point, and angle control stay synchronized;
- playback finishes focused on this course, not the whole whiteboard.

## 2. A second course uses a separate whiteboard area

On the same whiteboard, submit:

> 请用图像比较 y=x²、y=(x-2)²+1，并解释顶点和平移的关系。

Pass when:

- the camera moves directly to the new question and loading state without flashing back to the previous course;
- the new course is separated from the first course by visible whitespace;
- the h and k controls affect the full parabola correctly;
- the course ends focused on the second course region.

## 3. Handwriting selection assistance

Write `y=x²` on the whiteboard, select only that handwriting, and use “问小章鱼” to ask:

> 检查这个函数，并在旁边画出它的图像。

Pass when:

- the selection image is uploaded successfully;
- the answer and generated visual avoid existing content;
- the assistant card remains associated with the selected handwriting;
- adding an unrelated pen stroke and refreshing keeps the assistant card;
- erasing the source handwriting also removes its associated assistant content.

## 4. Voice question

Enable voice, keep the camera off, and say:

> 请解释勾股定理为什么成立，用面积拼接的方法演示。

Pass when:

- one utterance creates exactly one question;
- no extra “the” question appears after submission or lesson playback;
- the transcript matches the intended request closely enough to create the correct lesson;
- the lesson starts and completes normally.

## 5. Camera plus text

Enable the camera, place a handwritten quadratic expression in view, and type:

> 请检查图片里的函数，并解释它的顶点和开口方向。

Pass when:

- the question card contains the captured image;
- the image can be enlarged from the question card;
- the generated lesson uses the image content instead of inventing an unrelated function;
- disabling the camera after submission does not interrupt lesson playback.

## 6. Selected handwriting plus direct voice

Select handwritten content and, without opening the “问小章鱼” dialog, say:

> 为什么这个顶点在原点？

Pass when:

- the utterance follows the selection-assistance path rather than creating a full new course;
- no camera frame is attached, even if the camera is enabled;
- exactly one assistant card is created for the active selection.

## 7. Replay isolation

Add a visible pen stroke and one selection-assistance card around the latest course, then replay that course.

Pass when:

- user strokes and selection-assistance cards are hidden during replay;
- replay shows only the selected course's generated content;
- finishing replay restores the expected whiteboard state and focuses the selected course region;
- no invalid-reference warning appears for a valid selection.

## 8. Ambiguous speech or text does not invent a lesson

On a new whiteboard, submit:

> the book

Pass when:

- Octos asks for clarification instead of generating an unrelated mathematics lesson;
- the question card remains visible;
- the empty-whiteboard placeholder is not shown once the question card exists;
- no stuck loading card remains.

## 9. Settings access and standalone persistence

From the learning canvas, open Settings with the visible settings button. Then
return to the canvas, create a titled course, and add a pen stroke. Refresh the
page and restart the frontend once.

Pass when:

- Settings opens directly from the learning canvas;
- Settings contains “Learning Companion”, changing it updates the teacher in
  the lower-right corner, and the choice survives refresh;
- returning from Settings returns to Octos Learn rather than an unrelated Octos page;
- the new course title and pen stroke remain after refresh and frontend restart.

Legacy browser-local metadata created by `octos-web` is not migrated as part of
the initial standalone release. Missing titles or handwriting from those legacy
sessions is an accepted migration limitation; persistence of content created in
Octos Learn is still required.

## Release decision

Record the tested Octos commit, learning-coach revision, OLL revision, Octos Learn commit, model, and provider. Release the tested `main` revision only after all nine cases pass or every accepted exception is written down with an owner and follow-up issue.
