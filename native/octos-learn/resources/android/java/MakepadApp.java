package cc.pitun.learn.makepadtest;

import android.os.Bundle;
import android.system.Os;
import android.util.Log;
import dev.makepad.android.MakepadActivity;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.file.Files;

/** Independent performance-test host; course assets stay in this package's private storage. */
public final class MakepadApp extends MakepadActivity {
    private static final String ASSETS = "makepad/octos_learn/resources/course-packs";

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
            for (String name : new String[]{"OCTOS_PERF", "OCTOS_LEARN_OPEN"}) {
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
