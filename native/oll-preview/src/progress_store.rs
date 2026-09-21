//! Host-owned storage. One worker performs file IO; UI uses bounded nonblocking sends.
use makepad_widgets::*;
use serde_json::Value;
use std::{
    path::PathBuf,
    sync::mpsc::{self, Receiver, SyncSender, TrySendError},
};
pub enum Request {
    Save(String, Value),
    Load(String),
}
pub enum Reply {
    Saved(String),
    Loaded(String, Option<Value>),
    Failed(String),
}
pub struct Store {
    tx: SyncSender<Request>,
    rx: Receiver<Reply>,
}
impl Store {
    pub fn start(cx: &Cx) -> Result<Self, String> {
        let dir = if let Some(p) = std::env::var_os("OLL_PREVIEW_DATA_DIR") {
            PathBuf::from(p)
        } else if let Some(p) = cx.get_data_dir() {
            PathBuf::from(p).join("oll-preview")
        } else {
            PathBuf::from(std::env::var_os("HOME").ok_or("找不到应用存储目录")?)
                .join("Library/Application Support/Octos OLL Preview")
        };
        let (tx, requests) = mpsc::sync_channel(4);
        let (replies, rx) = mpsc::sync_channel(4);
        cx.thread_spawner()
            .spawn_worker(
                ThreadOptions {
                    name: Some("oll-progress-store".into()),
                    ..Default::default()
                },
                move || {
                    for request in requests {
                        let reply = match request {
                            Request::Save(key, value) => {
                                let result = (|| -> Result<(), String> {
                                    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
                                    let path = dir.join(format!("{key}.json"));
                                    let temp = dir.join(format!("{key}.pending"));
                                    let bytes =
                                        serde_json::to_vec(&value).map_err(|e| e.to_string())?;
                                    std::fs::write(&temp, bytes).map_err(|e| e.to_string())?;
                                    std::fs::rename(temp, path).map_err(|e| e.to_string())?;
                                    Ok(())
                                })();
                                match result {
                                    Ok(()) => Reply::Saved(key),
                                    Err(e) => Reply::Failed(e),
                                }
                            }
                            Request::Load(key) => {
                                let path = dir.join(format!("{key}.json"));
                                match std::fs::read(path) {
                                    Ok(bytes) => match serde_json::from_slice(&bytes) {
                                        Ok(value) => Reply::Loaded(key, Some(value)),
                                        Err(e) => {
                                            Reply::Failed(format!("进度文件损坏，保留原文件：{e}"))
                                        }
                                    },
                                    Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                                        Reply::Loaded(key, None)
                                    }
                                    Err(e) => Reply::Failed(e.to_string()),
                                }
                            }
                        };
                        if replies.send(reply).is_err() {
                            break;
                        }
                    }
                },
            )
            .map_err(|e| format!("无法启动存储工作线程：{e:?}"))?
            .detach();
        Ok(Self { tx, rx })
    }
    pub fn send(&self, request: Request) -> Result<(), Request> {
        self.tx.try_send(request).map_err(|e| match e {
            TrySendError::Full(r) | TrySendError::Disconnected(r) => r,
        })
    }
    pub fn poll(&self) -> Option<Reply> {
        self.rx.try_recv().ok()
    }
}
