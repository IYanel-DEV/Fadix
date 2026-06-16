use futures_util::StreamExt;
use reqwest::Client;
use tokio::sync::mpsc;

use super::types::{LlmRequest, LlmStreamEvent, NvidiaStreamResponse};

const NVIDIA_API_URL: &str = "https://integrate.api.nvidia.com/v1/chat/completions";

pub async fn stream_nvidia(
    request: LlmRequest,
    api_key: String,
    tx: mpsc::UnboundedSender<LlmStreamEvent>,
) {
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
        .post(NVIDIA_API_URL)
        .header("Authorization", format!("Bearer {}", api_key))
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
                error: Some(format!("Network request failed: {}", e)),
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
            error: Some(format!("NVIDIA API error ({}): {}", status, body)),
        });
        return;
    }

    let mut stream = match response.bytes_stream().next().await {
        Some(Ok(_)) => response.bytes_stream(),
        Some(Err(e)) => {
            let _ = tx.send(LlmStreamEvent {
                token: String::new(),
                done: true,
                finish_reason: None,
                error: Some(format!("Stream initialization failed: {}", e)),
            });
            return;
        }
        None => {
            let _ = tx.send(LlmStreamEvent {
                token: String::new(),
                done: true,
                finish_reason: None,
                error: Some("Empty response stream".to_string()),
            });
            return;
        }
    };

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
                            error: Some(format!("NVIDIA stream error: {}", err.message)),
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
                    eprintln!("[fadix] NVIDIA SSE parse error: {} | raw: {}", e, json_str);
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
