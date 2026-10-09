package cc.pitun.learn.makepadtest;

import android.graphics.Matrix;
import android.os.Bundle;
import android.system.ErrnoException;
import android.system.Os;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.MotionEvent;
import android.view.SurfaceView;
import android.view.View;
import android.view.ViewGroup;
import dev.makepad.android.MakepadActivity;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.file.Files;

/** Independent performance-test host; course assets stay in this package's private storage. */
public final class MakepadApp extends MakepadActivity {
    private static final String ASSETS = "makepad/octos_learn/resources/course-packs";
    /** Longest side of the app's render buffer. 4K panels with weak GPUs
     *  (Mali-G52 MC1) spend most of each frame in eglSwapBuffers at full
     *  resolution, so the compositor scales a smaller buffer up. 1440p since
     *  2026-10-08 (user: 1080p too blurry, some stutter acceptable; device
     *  test: about 43-51ms per animated frame at 1440p vs 33ms at 1080p). */
    private static final int RENDER_LONG_SIDE = 2560;
    private float renderScale = 1f;

    @Override public void onCreate(Bundle state) {
        long started = System.nanoTime();
        try {
            File root = new File(getFilesDir(), "course-packs");
            byte[] stamp;
            try (InputStream input = getAssets().open(ASSETS + "/build-id.txt")) {
                stamp = readAll(input);
            }
            File marker = new File(root, "build-id.txt");
            boolean current = marker.isFile()
                && java.util.Arrays.equals(stamp, Files.readAllBytes(marker.toPath()));
            if (!current) {
                copyAssets(ASSETS, root);
                Files.write(marker.toPath(), stamp);
            }
            Os.setenv("OCTOS_LEARN_PACK_DIR", root.getAbsolutePath(), true);
            renderScale = chooseRenderScale();
            if (renderScale < 1f) {
                float dpi = getResources().getDisplayMetrics().density * renderScale;
                Os.setenv("OCTOS_RENDER_DPI", Float.toString(dpi), true);
            } else {
                Os.unsetenv("OCTOS_RENDER_DPI");
            }
            for (String name : new String[]{"OCTOS_PERF", "OCTOS_LEARN_OPEN", "OCTOS_BISECT"}) {
                String value = getIntent().getStringExtra("octos." + name);
                if (value != null && !value.isEmpty()) Os.setenv(name, value, true);
                else Os.unsetenv(name);
            }
            Log.i("OctosNativeTest", "Course assets ready in "
                + (System.nanoTime() - started) / 1000000 + "ms; cached=" + current);
        } catch (Exception error) {
            throw new IllegalStateException("Cannot prepare native test course packs", error);
        }
        super.onCreate(state);
        if (renderScale < 1f) {
            SurfaceView surface = findMakepadSurface(getWindow().getDecorView());
            if (surface == null) {
                Log.w("OctosNativeTest", "Makepad surface not found; rendering at full resolution");
                try {
                    Os.unsetenv("OCTOS_RENDER_DPI");
                } catch (ErrnoException error) {
                    throw new IllegalStateException("Cannot clear native render DPI", error);
                }
            } else {
                scaleSurface(surface);
            }
        }
        Log.i("OctosNativeTest", "Render scale " + renderScale);
    }

    /** 1 = native resolution; below 1 the GL buffer is smaller than the view.
     *  Intent extra octos.OCTOS_RENDER_SCALE overrides it (e.g. 1 for A/B). */
    private float chooseRenderScale() {
        String forced = getIntent().getStringExtra("octos.OCTOS_RENDER_SCALE");
        if (forced != null && !forced.isEmpty()) {
            try {
                return Math.max(0.25f, Math.min(1f, Float.parseFloat(forced)));
            } catch (NumberFormatException ignored) {
            }
        }
        DisplayMetrics metrics = new DisplayMetrics();
        getWindowManager().getDefaultDisplay().getRealMetrics(metrics);
        int longSide = Math.max(metrics.widthPixels, metrics.heightPixels);
        return longSide > RENDER_LONG_SIDE * 4 / 3 ? (float) RENDER_LONG_SIDE / longSide : 1f;
    }

    private static SurfaceView findMakepadSurface(View view) {
        if (view instanceof SurfaceView && view.getClass().getSimpleName().equals("MakepadSurface")) {
            return (SurfaceView) view;
        }
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                SurfaceView found = findMakepadSurface(group.getChildAt(i));
                if (found != null) return found;
            }
        }
        return null;
    }

    /** Smaller GL buffer (the compositor scales it to the view) and touches
     *  mapped into buffer pixels, which Rust divides by OCTOS_RENDER_DPI.
     *  Only this surface's touches are mapped; other Java views are untouched. */
    private void scaleSurface(SurfaceView surface) {
        View.OnLayoutChangeListener resize = (v, l, t, r, b, ol, ot, or, ob) -> {
            int w = r - l, h = b - t;
            if (w > 0 && h > 0) {
                surface.getHolder().setFixedSize(
                    Math.max(1, Math.round(w * renderScale)), Math.max(1, Math.round(h * renderScale)));
            }
        };
        surface.addOnLayoutChangeListener(resize);
        if (surface.getWidth() > 0) {
            resize.onLayoutChange(surface, surface.getLeft(), surface.getTop(), surface.getRight(),
                surface.getBottom(), 0, 0, 0, 0);
        }
        View.OnTouchListener original = (View.OnTouchListener) surface;
        Matrix toBuffer = new Matrix();
        toBuffer.setScale(renderScale, renderScale);
        surface.setOnTouchListener((v, event) -> {
            MotionEvent mapped = MotionEvent.obtain(event);
            mapped.transform(toBuffer);
            try {
                return original.onTouch(v, mapped);
            } finally {
                mapped.recycle();
            }
        });
    }

    private void copyAssets(String asset, File target) throws Exception {
        String[] children = getAssets().list(asset);
        if (children != null && children.length != 0) {
            if (!target.isDirectory() && !target.mkdirs()) {
                throw new java.io.IOException("Cannot create " + target);
            }
            for (String child : children) {
                if (asset.equals(ASSETS) && child.equals("build-id.txt")) continue;
                copyAssets(asset + "/" + child, new File(target, child));
            }
        } else {
            try (InputStream input = getAssets().open(asset);
                 FileOutputStream output = new FileOutputStream(target)) {
                byte[] buffer = new byte[65536];
                int count;
                while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            }
        }
    }

    private static byte[] readAll(InputStream input) throws Exception {
        java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
        byte[] buffer = new byte[4096];
        int count;
        while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
        return output.toByteArray();
    }
}
