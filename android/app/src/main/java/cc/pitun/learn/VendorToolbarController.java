package cc.pitun.learn;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.util.Log;

/** The Philips floating whiteboard toolbar is separate from Android navigation. */
final class VendorToolbarController {
    private static final String TAG = "OctosVendorToolbar";
    private static final ComponentName SERVICE = new ComponentName(
            "com.tpv.xm.wb", "com.tpv.xm.wb.services.toolbar.ToolBarService");
    private static final String ACTION_PREFIX = "com.tpv.toolbarservice.ToolBarService.";
    private final Activity activity;
    private boolean hidden;

    VendorToolbarController(Activity activity) {
        this.activity = activity;
    }

    void hide() {
        if (!"PHILIPS".equalsIgnoreCase(Build.BRAND)) return;
        try {
            ServiceInfo info = activity.getPackageManager().getServiceInfo(SERVICE, 0);
            if (!info.exported || (info.applicationInfo.flags & ApplicationInfo.FLAG_SYSTEM) == 0) return;
            hidden = activity.startService(new Intent(ACTION_PREFIX + "HideBottomToolBar")
                    .setComponent(SERVICE)) != null;
        } catch (Exception error) {
            // Other Philips firmware can omit or restrict this optional service.
            Log.w(TAG, "Unable to hide the vendor toolbar", error);
        }
    }

    void restore() {
        if (!hidden) return;
        hidden = false;
        try {
            activity.startService(new Intent(ACTION_PREFIX + "ShowBottomToolBar")
                    .setComponent(SERVICE));
        } catch (Exception error) {
            Log.w(TAG, "Unable to restore the vendor toolbar", error);
        }
    }
}
