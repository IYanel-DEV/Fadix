use futures_util::StreamExt;
use reqwest::Client;
use tokio::sync::mpsc;

use super::types::{LlmRequest, LlmStreamEvent, NvidiaStreamResponse};

const OLLAMA_BASE_URL: &str = "http://localhost:11434";
const LM_STUDIO_BASE_URL: &str = "http://localhost:1234";

fn resolve_base_url(custom_url: Option<&str>) -> String {
    match custom_url {
        Some(url) if !url.is_empty() => url.trim_end_matches('/').to_string(),
        _ => format!("{}/v1/chat/completions", OLLAMA_BASE_URL),
    }
}

fn build_endpoint(custom_url: Option<&str>) -> String {
    match custom_url {
        Some(url) if !url.is_empty() => {
            let base = url.trim_end_matches('/');
            if base.ends_with("/chat/completions") {
                base.to_string()
            } else if base.ends_with("/v1") {
                format!("{}/chat/completions", base)
            } else {
                format!("{}/v1/chat/completions", base)
            }
        }
        _ => format!("{}/v1/chat/completions", OLLAMA_BASE_URL),
    }
}

pub async fn stream_local(
    request: LlmRequest,
    base_url: Option<String>,
    tx: mpsc::UnboundedSender<LlmStreamEvent>,
) {
    let endpoint = build_endpoint(base_url.as_deref());

    let client = match Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            let _ = tx.send(LlmStreamEvent {
                token: String::new(),
                done: true,
                finish_reason: None,
                error: Some(format!("Failed to create HTTP client: {}", e)),
            });
            return;
        }
    };

    let response = match client
        .post(&endpoint)
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            let _ = tx.send(LlmStreamEvent {
                token: String::new(),
                done: true,
                finish_reason: None,
                error: Some(format!(
                    "Failed to connect to local LLM at '{}': {}",
                    endpoint, e
                )),
            });
            return;
        }
    };

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        let _ = tx.send(LlmStreamEvent {
            token: String::new(),
            done: true,
            finish_reason: None,
            error: Some(format!("Local LLM error ({}): {}", status, body)),
        });
        return;
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk_result) = stream.next().await {
        let chunk = match chunk_result {
            Ok(c) => c,
            Err(e) => {
                let _ = tx.send(LlmStreamEvent {
                    token: String::new(),
                    done: true,
                    finish_reason: None,
                    error: Some(format!("Stream read error: {}", e)),
                });
                return;
            }
        };

        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(line_end) = buffer.find('\n') {
            let line = buffer[..line_end].trim().to_string();
            buffer = buffer[line_end + 1..].to_string();

            if line.is_empty() {
                continue;
            }

            if line == "data: [DONE]" {
                let _ = tx.send(LlmStreamEvent {
                    token: String::new(),
                    done: true,
                    finish_reason: Some("stop".to_string()),
                    error: None,
                });
                return;
            }

            let json_str = if let Some(rest) = line.strip_prefix("data: ") {
                rest
            } else {
                continue;
            };

            match serde_json::from_str::<NvidiaStreamResponse>(json_str) {
                Ok(parsed) => {
                    if let Some(err) = parsed.error {
                        let _ = tx.send(LlmStreamEvent {
                            token: String::new(),
                            done: true,
                            finish_reason: None,
                            error: Some(format!("Local LLM stream error: {}", err.message)),
                        });
                        return;
                    }

                    if let Some(choices) = parsed.choices {
                        for choice in choices {
                            let finish = choice.finish_reason;
                            if let Some(delta) = choice.delta {
                                if let Some(content) = delta.content {
                                    if !content.is_empty() {
                                        let _ = tx.send(LlmStreamEvent {
                                            token: content,
                                            done: false,
                                            finish_reason: None,
                                            error: None,
                                        });
                                    }
                                }
                            }
                            if let Some(reason) = finish {
                                let _ = tx.send(LlmStreamEvent {
                                    token: String::new(),
                                    done: true,
                                    finish_reason: Some(reason),
                                    error: None,
                                });
                                return;
                            }
                        }
                    }
                }
                Err(e) => {
                    eprintln!("[fadix] Local LLM SSE parse error: {} | raw: {}", e, json_str);
                }
            }
        }
    }

    let _ = tx.send(LlmStreamEvent {
        token: String::new(),
        done: true,
        finish_reason: Some("stream_ended".to_string()),
        error: None,
    });
}
