use tokio::sync::mpsc;

use super::types::{LlmConfig, LlmRequest, LlmStreamEvent, Provider};
use super::provider_nvidia::stream_nvidia;
use super::provider_local::stream_local;

pub fn route_chat(
    config: LlmConfig,
    request: LlmRequest,
    tx: mpsc::UnboundedSender<LlmStreamEvent>,
) {
    match config.provider {
        Provider::Nvidia => {
            let api_key = config.api_key.unwrap_or_default();
            tokio::spawn(async move {
                stream_nvidia(request, api_key, tx).await;
            });
        }
        Provider::Local => {
            tokio::spawn(async move {
                stream_local(request, config.base_url, tx).await;
            });
        }
    }
}
