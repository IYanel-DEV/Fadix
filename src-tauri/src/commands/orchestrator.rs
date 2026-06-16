use tauri::AppHandle;

use crate::agents::Orchestrator;
use crate::llm::{LlmConfig, Provider};
use crate::state::CurrentTask;

#[tauri::command]
pub async fn execute_agent_workflow(
    app: AppHandle,
    user_query: String,
    target_directory: String,
    provider: String,
    model: String,
    api_key: Option<String>,
    base_url: Option<String>,
) -> Result<CurrentTask, String> {
    if user_query.trim().is_empty() {
        return Err("User query cannot be empty".to_string());
    }

    if target_directory.trim().is_empty() {
        return Err("Target directory cannot be empty".to_string());
    }

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
        model,
        api_key,
        base_url,
    };

    let orchestrator = Orchestrator::new(config);

    let result = orchestrator
        .run_task_pipeline(user_query, app, target_directory)
        .await;

    match result {
        Ok(task) => Ok(task),
        Err(e) => Err(format!("Orchestrator pipeline failed: {}", e)),
    }
}
