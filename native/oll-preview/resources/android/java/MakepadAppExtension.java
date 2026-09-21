package cc.pitun.learn.preview;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.RectF;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Handler;
import android.os.Looper;
import android.view.MotionEvent;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import dev.makepad.android.MakepadActivity;
import dev.makepad.android.MakepadNative;
import java.util.ArrayDeque;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

/** Independent validation host. Existing recorder, RTC and sampling implementations are reused. */
public final class MakepadAppExtension implements MakepadActivity.ApplicationExtension, NativeEventSink {
    private final MakepadActivity activity;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService audioWorker = Executors.newSingleThreadExecutor();
    private final NativeAudioBridge audio;
    private final NativeInkBridge ink;
    private final NativeInkOverlayView overlay;
    private final FrameLayout touchLayer;
    private final RectF bounds = new RectF();
    private final ArrayDeque<String[]> pending = new ArrayDeque<>();
    private boolean drawing, tracking, destroyed;
    private int stream = 0;
    private int audioGeneration = 0;
    private AudioFocusRequest focus;
    private final AudioManager audioManager;

    public MakepadAppExtension(MakepadActivity activity) {
        this.activity = activity;
        audioManager = (AudioManager)activity.getSystemService(android.content.Context.AUDIO_SERVICE);
        overlay = new NativeInkOverlayView(activity);
        ink = new NativeInkBridge(this, overlay);
        audio = new NativeAudioBridge(activity, this);
        touchLayer = new FrameLayout(activity) {
            @Override public boolean dispatchTouchEvent(MotionEvent event) {
                if (!drawing) return false;
                if (event.getActionMasked() == MotionEvent.ACTION_DOWN) tracking = bounds.contains(event.getX(),event.getY());
                if (!tracking) return false;
                ink.onMotionEvent(event);
                if (event.getActionMasked()==MotionEvent.ACTION_UP || event.getActionMasked()==MotionEvent.ACTION_CANCEL) tracking=false;
                return true;
            }
        };
        touchLayer.addView(overlay,new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.MATCH_PARENT));
        activity.getApplicationOverlay().addView(touchLayer,new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.MATCH_PARENT));
    }
    @Override public void post(Runnable task) { main.post(task); }
    @Override public void emit(String channel, JSONObject payload) {
        final String value=payload.toString();
        post(() -> {
            if (destroyed) return;
            if (pending.size()>112) { android.util.Log.e("OLL","Native event queue full; stopping input");drawing=false;ink.configure(false,0,0,0,0,1,"#64dbb9",3);return; }
            if (value.length()<48000) pending.add(new String[]{channel,value});
            else {
                final int id=++stream;
                java.util.ArrayList<String> parts=new java.util.ArrayList<>();
                for(int start=0;start<value.length();) {int end=Math.min(value.length(),start+48000);if(end<value.length() && Character.isHighSurrogate(value.charAt(end-1)))end--;parts.add(value.substring(start,end));start=end;}
                final int count=parts.size();
                if (count>64 || pending.size()+count>128) { android.util.Log.e("OLL","Native payload exceeds bounded transport");return; }
                for(int i=0;i<count;i++) try {
                    JSONObject part=new JSONObject();part.put("stream",id);part.put("channel",channel);part.put("index",i);part.put("count",count);part.put("data",parts.get(i));
                    pending.add(new String[]{"oll.transport",part.toString()});
                }catch(Exception error){android.util.Log.e("OLL","Cannot encode event",error);return;}
            }
            drain();
        });
    }
    private boolean draining;
    private void drain(){
        if(draining||destroyed)return;draining=true;
        while(!pending.isEmpty()) {String[] event=pending.peek();if(!MakepadNative.onAndroidIntegrationEvent(event[0],event[1])){main.postDelayed(()->{draining=false;drain();},8);return;}pending.remove();}
        draining=false;
    }
    private void status(String message){try{JSONObject v=new JSONObject();v.put("type","status");v.put("message",message);emit("audio",v);}catch(Exception ignored){}}
    @Override public void command(String channel,String payload) {
        try {
            JSONObject v=new JSONObject(payload);
            if("oll.ink".equals(channel)) {
                String op=v.getString("op");
                if("configure".equals(op)){drawing=v.getBoolean("enabled");double ratio=v.getDouble("ratio");bounds.set((float)(v.getDouble("left")*ratio),(float)(v.getDouble("top")*ratio),(float)(v.getDouble("right")*ratio),(float)(v.getDouble("bottom")*ratio));ink.configure(drawing,v.getDouble("left"),v.getDouble("top"),v.getDouble("right"),v.getDouble("bottom"),ratio,"#64dbb9",3);}
                else if("displayed".equals(op))ink.acknowledge(v.getInt("pointerId"));
                else if("cancel".equals(op))ink.cancel(v.getInt("pointerId"));
            }else if("oll.audio".equals(channel)) {
                final String op=v.getString("op");
                if("start".equals(op)||"asr.start".equals(op)) {
                    if(activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){activity.requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},4201);status("请授予麦克风权限后再次点击录音");return;}
                    final int generation=++audioGeneration;
                    if(focus!=null)audioManager.abandonAudioFocusRequest(focus);
                    focus=new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT).setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()).setOnAudioFocusChangeListener(change->{if(change<0 && generation==audioGeneration){audioWorker.execute(audio::release);status("音频焦点丢失，录音已停止");}}).build();
                    if(audioManager.requestAudioFocus(focus)!=AudioManager.AUDIOFOCUS_REQUEST_GRANTED){status("无法获得音频焦点");return;}
                }
                audioWorker.execute(()->{try{
                    if("start".equals(op)){audio.prepareForVoiceCapture();status(audio.startVoiceCapture());}
                    else if("stop".equals(op)){audio.release();post(()->{if(focus!=null){audioManager.abandonAudioFocusRequest(focus);focus=null;}});status("录音已停止");}
                    else if("devices".equals(op))status(audio.describeInputDevices());
                    else if("asr.start".equals(op))status(audio.startPrivateAsr(v.getString("appId"),v.getString("channel"),v.getString("token"),v.getInt("uid")));
                    else if("asr.listening".equals(op))status(audio.setPrivateAsrListening(v.getBoolean("enabled")));
                    else status("未知音频操作");
                }catch(Exception error){status("音频调用失败："+error.getMessage());}});
            }
        }catch(Exception error){status("平台命令无效："+error.getMessage());}
    }
    @Override public void onResume(){emit("ink.lifecycle",new JSONObject());status("Android 原生服务就绪；录音需手动启动");}
    @Override public void onPause(){audioGeneration++;drawing=false;tracking=false;ink.configure(false,0,0,0,0,1,"#64dbb9",3);audioWorker.execute(audio::release);if(focus!=null){audioManager.abandonAudioFocusRequest(focus);focus=null;}}
    @Override public void onIntent(Intent intent){}
    @Override public void onDestroy(){onPause();destroyed=true;pending.clear();audioWorker.shutdown();((ViewGroup)touchLayer.getParent()).removeView(touchLayer);}
}
