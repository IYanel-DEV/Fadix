use crate::llm::{ChatMessage, LlmConfig, LlmRequest};
use crate::workspace::atomic_writer::atomic_write;
use crate::state::{CurrentTask, WorkspaceState};

pub fn build_coder_prompt(
    task: &CurrentTask,
    step_index: usize,
    file_contents: &[String],
    file_paths: &[String],
) -> Vec<ChatMessage> {
    let step = &task.execution_plan[step_index];
    let files_section = file_paths
        .iter()
        .zip(file_contents.iter())
        .map(|(p, c)| format!("--- FILE: {} ---\n{}", p, c))
        .collect::<Vec<_>>()
        .join("\n\n");

    vec![
        ChatMessage {
            role: "system".to_string(),
            content: "You are the Coder agent. Write production-grade code changes.\n\
                       For each file you modify, output blocks in this exact format:\n\
                       FILE:<relative_path>\n<full file content>\nEND_FILE\n\n\
                       Rules:\n\
                       - Return complete file contents, not patches\n\
                       - Maintain existing code style\n\
                       - No markdown fences, no explanations, only FILE blocks"
                .to_string(),
        },
        ChatMessage {
            role: "user".to_string(),
            content: format!(
                "TASK: {}\n\nUSER REQUEST:\n{}\n\nEXISTING FILES:\n{}",
                step.action_description, task.user_original_query, files_section
            ),
        },
    ]
}

pub fn parse_coder_output(output: &str) -> Vec<(String, String)> {
    let mut results = Vec::new();
    let mut current_path: Option<String> = None;
    let mut current_content = String::new();

    for line in output.lines() {
        if let Some(path) = line.strip_prefix("FILE:") {
            if let Some(prev_path) = current_path.take() {
                results.push((prev_path, current_content.trim_end().to_string()));
                current_content.clear();
            }
            current_path = Some(path.trim().to_string());
        } else if line.trim() == "END_FILE" {
            if let Some(path) = current_path.take() {
                results.push((path, current_content.trim_end().to_string()));
                current_content.clear();
            }
        } else if current_path.is_some() {
            current_content.push_str(line);
            current_content.push('\n');
        }
    }

    if let Some(path) = current_path {
        results.push((path, current_content.trim_end().to_string()));
    }

    results
}

pub async fn apply_coder_changes(
    root_dir: &str,
    files: &[(String, String)],
    state: &mut WorkspaceState,
) -> Result<(), String> {
    for (relative_path, content) in files {
        let full_path = format!("{}/{}", root_dir.trim_end_matches('/'), relative_path);
        match atomic_write(&full_path, content, true).await {
            Ok(_) => {
                state.push_log(
                    "coder",
                    "Coding",
                    &format!("Wrote: {}", relative_path),
                );
            }
            Err(e) => {
                state.push_log(
                    "coder",
                    "Failed",
                    &format!("Failed to write {}: {}", relative_path, e),
                );
                return Err(format!("Write failed for {}: {}", relative_path, e));
            }
        }
    }
    Ok(())
}
