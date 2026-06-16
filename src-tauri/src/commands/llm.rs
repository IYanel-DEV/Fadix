use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;

use crate::llm::{
    route_chat, ChatMessage, LlmConfig, LlmRequest, LlmStreamEvent, Provider,
};

#[tauri::command]
pub async fn llm_stream_chat(
    app: AppHandle,
    provider: String,
    model: String,
    messages: Vec<ChatMessage>,
    api_key: Option<String>,
    base_url: Option<String>,
    temperature: Option<f64>,
    max_tokens: Option<u32>,
) -> Result<String, String> {
    let provider_enum = match provider.to_lowercase().as_str() {
        "nvidia" => Provider::Nvidia,
        "local" => Provider::Local,
        other => {
            return Err(format!(
                "Unknown provider '{}'. Expected 'nvidia' or 'local'.",
                other
            ));
        }
    };

    let config = LlmConfig {
        provider: provider_enum,
        model: model.clone(),
        api_key,
        base_url,
    };

    let request = LlmRequest {
        model,
        messages,
        temperature,
        max_tokens,
        stream: true,
    };

    let (tx, mut rx) = mpsc::unbounded_channel::<LlmStreamEvent>();

    route_chat(config, request, tx);

    let app_handle = app.clone();
    tokio::spawn(async move {
        while let Some(event) = rx.recv().await {
            if let Err(e) = app_handle.emit("llm-token", &event) {
                eprintln!("[fadix] Failed to emit llm-token event: {}", e);
                break;
            }
            if event.done {
                break;
            }
        }
    });

    Ok("stream_started".to_string())
}
