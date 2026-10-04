package cc.pitun.appdrawer;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.content.pm.LauncherApps;
import android.content.pm.LauncherActivityInfo;
import android.content.pm.ResolveInfo;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextWatcher;
import android.text.TextUtils;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.InputMethodManager;
import android.widget.BaseAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.GridView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import java.text.Collator;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** A normal Activity launched from Horion's existing custom app slot. No overlay or service. */
public final class AppDrawerActivity extends Activity {
    private static final String TAG = "OctosAppDrawer";
    private static final int INK = Color.rgb(36, 59, 64);
    private static final int TEAL = Color.rgb(22, 106, 121);
    private final ExecutorService loader = Executors.newSingleThreadExecutor();
    private final List<AppEntry> apps = new ArrayList<>();
    private final List<AppEntry> visible = new ArrayList<>();
    private final AppAdapter adapter = new AppAdapter();
    private EditText search;
    private TextView count;
    private TextView empty;
    private GridView grid;
    private int loadGeneration;
    private final BroadcastReceiver packageChanges = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) { reloadApps(); }
    };

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(32), dp(20), dp(32), dp(16));
        root.setBackgroundColor(Color.rgb(248, 247, 242));
        setContentView(root);

        LinearLayout header = new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = text("全部应用", 26, INK);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        header.addView(title, new LinearLayout.LayoutParams(0, dp(52), 1));
        Button home = button("桌面");
        home.setOnClickListener(v -> openHome());
        header.addView(home, new LinearLayout.LayoutParams(dp(88), dp(48)));
        Button close = button("返回");
        close.setOnClickListener(v -> finish());
        LinearLayout.LayoutParams closeParams = new LinearLayout.LayoutParams(dp(88), dp(48));
        closeParams.leftMargin = dp(12);
        header.addView(close, closeParams);
        root.addView(header);

        count = text("正在读取应用…", 14, Color.rgb(99, 117, 120));
        root.addView(count, new LinearLayout.LayoutParams(-1, dp(28)));
        search = new EditText(this);
        search.setSingleLine(true);
        search.setTextSize(16);
        search.setTextColor(INK);
        search.setHint("搜索应用");
        search.setPadding(dp(16), 0, dp(16), 0);
        search.setBackground(background(Color.WHITE, dp(12), Color.rgb(221, 228, 224)));
        LinearLayout.LayoutParams searchParams = new LinearLayout.LayoutParams(-1, dp(48));
        searchParams.bottomMargin = dp(12);
        root.addView(search, searchParams);
        search.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int n, int after) {}
            @Override public void onTextChanged(CharSequence s, int start, int before, int n) { filter(); }
            @Override public void afterTextChanged(Editable s) {}
        });

        empty = text("", 18, INK);
        empty.setGravity(Gravity.CENTER);
        empty.setVisibility(View.GONE);
        root.addView(empty, new LinearLayout.LayoutParams(-1, dp(60)));
        grid = new GridView(this);
        grid.setNumColumns(GridView.AUTO_FIT);
        grid.setColumnWidth(dp(132));
        grid.setStretchMode(GridView.STRETCH_COLUMN_WIDTH);
        grid.setHorizontalSpacing(dp(12));
        grid.setVerticalSpacing(dp(12));
        grid.setPadding(0, dp(2), 0, dp(12));
        grid.setClipToPadding(false);
        grid.setAdapter(adapter);
        grid.setOnItemClickListener((parent, view, position, id) -> launch(visible.get(position)));
        root.addView(grid, new LinearLayout.LayoutParams(-1, 0, 1));
        // Don't summon the keyboard when opened through the sidebar.
        root.setFocusableInTouchMode(true);
        root.requestFocus();

        IntentFilter changes = new IntentFilter();
        changes.addAction(Intent.ACTION_PACKAGE_ADDED);
        changes.addAction(Intent.ACTION_PACKAGE_REMOVED);
        changes.addAction(Intent.ACTION_PACKAGE_CHANGED);
        changes.addDataScheme("package");
        registerReceiver(packageChanges, changes);
    }

    @Override protected void onResume() { super.onResume(); reloadApps(); }

    @Override protected void onDestroy() {
        loadGeneration++;
        unregisterReceiver(packageChanges);
        loader.shutdownNow();
        super.onDestroy();
    }

    private void reloadApps() {
        if (isDestroyed()) return;
        final int generation = ++loadGeneration;
        loader.execute(() -> {
            try {
                PackageManager pm = getPackageManager();
                LinkedHashMap<ComponentName, AppEntry> entries = new LinkedHashMap<>();
                LauncherApps launcher = (LauncherApps) getSystemService(Context.LAUNCHER_APPS_SERVICE);
                for (LauncherActivityInfo installed : launcher.getActivityList(null, android.os.Process.myUserHandle())) {
                    ComponentName component = installed.getComponentName();
                    if (component.getPackageName().equals(getPackageName())
                        || component.getPackageName().equals("com.octosense.sidebarstarter")) continue;
                    entries.put(component, new AppEntry(component, installed.getLabel().toString(),
                        Intent.CATEGORY_LAUNCHER, installed.getIcon(0)));
                }
                // Include TV-only apps, deduplicating any entry also exposed by LauncherApps.
                for (String category : new String[] { Intent.CATEGORY_LEANBACK_LAUNCHER }) {
                    Intent query = new Intent(Intent.ACTION_MAIN).addCategory(category);
                    for (ResolveInfo resolved : pm.queryIntentActivities(query, 0)) {
                        if (resolved.activityInfo == null) continue;
                        if (!resolved.activityInfo.exported || !resolved.activityInfo.enabled
                            || !resolved.activityInfo.applicationInfo.enabled) {
                            Log.i(TAG, "Skip unavailable entry " + resolved.activityInfo.packageName
                                + "/" + resolved.activityInfo.name);
                            continue;
                        }
                        String pkg = resolved.activityInfo.packageName;
                        // Hide this drawer and the boot-only SidebarStarter, both maintenance utilities.
                        if (pkg.equals(getPackageName()) || pkg.equals("com.octosense.sidebarstarter")) continue;
                        ComponentName component = new ComponentName(pkg, resolved.activityInfo.name);
                        Log.d(TAG, "Entry " + component.flattenToString());
                        if (!entries.containsKey(component)) {
                            String label = resolved.loadLabel(pm).toString();
                            entries.put(component, new AppEntry(component, label, category, resolved.loadIcon(pm)));
                        }
                    }
                }
                List<AppEntry> result = new ArrayList<>(entries.values());
                Collator collator = Collator.getInstance(Locale.SIMPLIFIED_CHINESE);
                result.sort((a, b) -> {
                    boolean aLearn = a.component.getPackageName().equals("cc.pitun.learn");
                    boolean bLearn = b.component.getPackageName().equals("cc.pitun.learn");
                    if (aLearn != bLearn) return aLearn ? -1 : 1;
                    int labels = collator.compare(a.label, b.label);
                    return labels != 0 ? labels : a.component.flattenToString().compareTo(b.component.flattenToString());
                });
                runOnUiThread(() -> {
                    if (isDestroyed() || generation != loadGeneration) return;
                    apps.clear(); apps.addAll(result); filter();
                    Log.i(TAG, "Loaded " + apps.size() + " launchable activities");
                });
            } catch (RuntimeException error) {
                Log.e(TAG, "Cannot read application list", error);
                runOnUiThread(() -> {
                    if (isDestroyed() || generation != loadGeneration) return;
                    count.setText("应用列表读取失败，请重新打开");
                });
            }
        });
    }

    private void filter() {
        String query = search.getText().toString().trim().toLowerCase(Locale.ROOT);
        visible.clear();
        for (AppEntry app : apps) {
            if (app.label.toLowerCase(Locale.ROOT).contains(query)
                || app.component.getPackageName().toLowerCase(Locale.ROOT).contains(query)) visible.add(app);
        }
        count.setText(query.isEmpty() ? apps.size() + " 个应用 · 点击图标打开"
            : "找到 " + visible.size() + " 个应用");
        empty.setText(apps.isEmpty() ? "没有可启动的应用" : "没有找到匹配的应用");
        empty.setVisibility(visible.isEmpty() ? View.VISIBLE : View.GONE);
        grid.setVisibility(visible.isEmpty() ? View.GONE : View.VISIBLE);
        adapter.notifyDataSetChanged();
        grid.setSelection(0);
    }

    private void launch(AppEntry app) {
        Intent intent = new Intent(Intent.ACTION_MAIN).addCategory(app.category)
            .setComponent(app.component)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        try {
            ((InputMethodManager) getSystemService(INPUT_METHOD_SERVICE))
                .hideSoftInputFromWindow(search.getWindowToken(), 0);
            if (Intent.CATEGORY_LAUNCHER.equals(app.category)) {
                ((LauncherApps) getSystemService(Context.LAUNCHER_APPS_SERVICE))
                    .startMainActivity(app.component, android.os.Process.myUserHandle(), null, null);
            } else {
                startActivity(intent);
            }
            Log.i(TAG, "Launch " + app.component.flattenToString());
            finish();
        } catch (RuntimeException error) {
            Log.w(TAG, "Cannot launch " + app.component, error);
            Toast.makeText(this, "暂时无法打开“" + app.label + "”", Toast.LENGTH_LONG).show();
            reloadApps();
        }
    }

    private void openHome() {
        try {
            startActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            finish();
        } catch (RuntimeException error) {
            Toast.makeText(this, "暂时无法返回桌面", Toast.LENGTH_SHORT).show();
        }
    }

    private int dp(float value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private TextView text(String value, float size, int color) {
        TextView view = new TextView(this);
        view.setText(value); view.setTextSize(size); view.setTextColor(color);
        view.setGravity(Gravity.CENTER_VERTICAL);
        return view;
    }
    private Button button(String label) {
        Button view = new Button(this);
        view.setText(label); view.setTextSize(16); view.setAllCaps(false); view.setTextColor(TEAL);
        return view;
    }
    private GradientDrawable background(int color, int radius, int border) {
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(color); shape.setCornerRadius(radius); shape.setStroke(dp(1), border);
        return shape;
    }

    private static final class AppEntry {
        final ComponentName component;
        final String label;
        final String category;
        final Drawable icon;
        AppEntry(ComponentName component, String label, String category, Drawable icon) {
            this.component = component; this.label = label; this.category = category; this.icon = icon;
        }
    }

    private final class AppAdapter extends BaseAdapter {
        @Override public int getCount() { return visible.size(); }
        @Override public AppEntry getItem(int position) { return visible.get(position); }
        @Override public long getItemId(int position) { return position; }
        @Override public View getView(int position, View recycled, ViewGroup parent) {
            LinearLayout tile;
            if (recycled instanceof LinearLayout) tile = (LinearLayout) recycled;
            else {
                tile = new LinearLayout(AppDrawerActivity.this);
                tile.setOrientation(LinearLayout.VERTICAL);
                tile.setGravity(Gravity.CENTER);
                tile.setPadding(dp(8), dp(12), dp(8), dp(8));
                tile.setLayoutParams(new GridView.LayoutParams(-1, dp(120)));
                tile.setBackground(background(Color.WHITE, dp(14), Color.rgb(225, 231, 227)));
                ImageView icon = new ImageView(AppDrawerActivity.this);
                icon.setScaleType(ImageView.ScaleType.FIT_CENTER);
                tile.addView(icon, new LinearLayout.LayoutParams(dp(48), dp(48)));
                TextView name = text("", 15, INK);
                name.setGravity(Gravity.CENTER);
                name.setMaxLines(2);
                name.setEllipsize(TextUtils.TruncateAt.END);
                LinearLayout.LayoutParams labelParams = new LinearLayout.LayoutParams(-1, 0, 1);
                labelParams.topMargin = dp(8);
                tile.addView(name, labelParams);
            }
            AppEntry app = getItem(position);
            ((ImageView) tile.getChildAt(0)).setImageDrawable(app.icon);
            ((TextView) tile.getChildAt(1)).setText(app.label);
            tile.setContentDescription(app.label);
            return tile;
        }
    }
}
