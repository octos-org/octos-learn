//! Bounded reassembly for the existing Android service event payloads.
use serde_json::Value;
use std::collections::BTreeMap;
struct Transfer {
    channel: String,
    count: usize,
    parts: Vec<String>,
    bytes: usize,
}
#[derive(Default)]
pub struct Events {
    transfers: BTreeMap<u64, Transfer>,
}
impl Events {
    pub fn receive(
        &mut self,
        channel: &str,
        payload: &str,
    ) -> Result<Option<(String, Value)>, String> {
        let v: Value = serde_json::from_str(payload).map_err(|e| e.to_string())?;
        if channel != "oll.transport" {
            return Ok(Some((channel.into(), v)));
        }
        let id = v["stream"].as_u64().ok_or("Missing transfer id")?;
        let index = v["index"].as_u64().ok_or("Missing transfer index")? as usize;
        let count = v["count"].as_u64().ok_or("Missing transfer count")? as usize;
        let channel = v["channel"].as_str().ok_or("Missing transfer channel")?;
        let part = v["data"].as_str().ok_or("Missing transfer data")?;
        if count == 0 || count > 64 || index >= count || part.len() > 192000 {
            return Err("Invalid transfer bounds".into());
        }
        if index == 0 {
            if self.transfers.len() >= 4 {
                return Err("Too many pending transfers".into());
            }
            self.transfers.insert(
                id,
                Transfer {
                    channel: channel.into(),
                    count,
                    parts: vec![],
                    bytes: 0,
                },
            );
        }
        let transfer = self.transfers.get_mut(&id).ok_or("Unknown transfer")?;
        if transfer.channel != channel || transfer.count != count || transfer.parts.len() != index {
            self.transfers.remove(&id);
            return Err("Out-of-order native transfer".into());
        }
        transfer.bytes += part.len();
        if transfer.bytes > 8 * 1024 * 1024 {
            self.transfers.remove(&id);
            return Err("Native transfer size limit exceeded".into());
        }
        transfer.parts.push(part.into());
        if index + 1 == count {
            let transfer = self.transfers.remove(&id).unwrap();
            let v = serde_json::from_str(&transfer.parts.concat()).map_err(|e| e.to_string())?;
            return Ok(Some((transfer.channel, v)));
        }
        Ok(None)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn audio_payload_reassembles_without_loss_and_bad_order_fails() {
        let payload = json!({"type":"utterance","wavBase64":"A".repeat(90000)}).to_string();
        let mut events = Events::default();
        let cut = 45000;
        assert!(events
            .receive(
                "oll.transport",
                &json!({"stream":1,"channel":"audio","index":0,"count":2,"data":&payload[..cut]})
                    .to_string()
            )
            .unwrap()
            .is_none());
        let (channel, value) = events
            .receive(
                "oll.transport",
                &json!({"stream":1,"channel":"audio","index":1,"count":2,"data":&payload[cut..]})
                    .to_string(),
            )
            .unwrap()
            .unwrap();
        assert_eq!(channel, "audio");
        assert_eq!(value["wavBase64"].as_str().unwrap().len(), 90000);
        assert!(events
            .receive(
                "oll.transport",
                &json!({"stream":2,"channel":"audio","index":1,"count":2,"data":"x"}).to_string()
            )
            .is_err());
    }
}
